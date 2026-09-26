import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { MessageBubble } from '../components/chat/MessageBubble';
import { MessageComposer } from '../components/chat/MessageComposer';
import type { MessageStatusDotState } from '../components/chat/MessageStatusDot';
import { colors, spacing, typography } from '../theme';
import { bootstrapApp } from '../services/appBootstrap';
import { useAppFoundationStore } from '../store/appFoundationStore';
import {
  GroupRepo,
  MessageRepo,
} from '../database/repositories';
import {
  ChatSendValidationError,
  sendChatText,
} from '../services/chat/chatMessageSender';
import {
  getActiveCommunicationManager,
  subscribeToActiveCommunicationManager,
} from '../services/communication/commsRuntime';
import type { RootStackParamList } from '../navigation/RootStack';
import type { Message } from '../types/entities';
import type { GroupId } from '../types/ids';

type ChatRoute = NativeStackScreenProps<RootStackParamList, 'Chat'>['route'];

const CONVERSATION_TAIL_LIMIT = 200;

export function ChatScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const route = useRoute<ChatRoute>();
  const localUserId = useAppFoundationStore(s => s.localUserId);

  const groupId = route.params?.groupId as GroupId | undefined;

  const [groupName, setGroupName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [commsAvailable, setCommsAvailable] = useState<boolean>(
    getActiveCommunicationManager() !== null,
  );

  useEffect(() => {
    return subscribeToActiveCommunicationManager(m => {
      setCommsAvailable(m !== null);
    });
  }, []);

  const load = useCallback(() => {
    if (!groupId) {
      setLoading(false);
      setLoadError(null);
      return;
    }
    try {
      const { db } = bootstrapApp();
      const group = GroupRepo.findGroupById(db, groupId);
      if (!group) {
        setLoadError('Conversation not found on this device.');
        setMessages([]);
        setGroupName(null);
        return;
      }
      setGroupName(group.isDirect ? 'Direct message' : group.name);
      setMessages(
        MessageRepo.listConversation(db, groupId, CONVERSATION_TAIL_LIMIT),
      );
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Refresh the visible list whenever the receiver persists a new envelope.
  // Subscribing to the manager directly is more reliable than polling and
  // avoids the "typed a message, saw it, then it disappeared" bug that a
  // heavy interval refresh can cause.
  useEffect(() => {
    if (!groupId) return undefined;
    const manager = getActiveCommunicationManager();
    if (!manager) return undefined;
    const unsub = manager.on(event => {
      if (event.kind === 'chatEnvelopeReceived') {
        // Trust the receiver service to persist first; then re-read.
        load();
      } else if (event.kind === 'chatEnvelopeSent') {
        load();
      }
    });
    return () => {
      unsub();
    };
  }, [groupId, load]);

  useEffect(() => {
    if (groupName) {
      navigation.setOptions({ title: groupName });
    }
  }, [groupName, navigation]);

  const sortedMessages = useMemo(() => messages, [messages]);

  const handleSend = useCallback(async () => {
    if (!groupId || !localUserId) return;
    setSendError(null);
    setSending(true);
    try {
      const { db, deviceId } = bootstrapApp();
      const manager = getActiveCommunicationManager();
      const outcome = await sendChatText({
        db,
        manager,
        groupId,
        senderUserId: localUserId,
        senderDeviceId: deviceId,
        text: composerText,
        nowIso: new Date().toISOString(),
      });
      setComposerText('');
      // Refresh from repo to include the new row with its (possibly SENT)
      // status.
      setMessages(prev => appendOrReplace(prev, outcome.message));
    } catch (err) {
      if (err instanceof ChatSendValidationError) {
        setSendError(err.message);
      } else {
        setSendError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSending(false);
    }
  }, [composerText, groupId, localUserId]);

  if (!groupId) {
    return (
      <Screen scrollable testID="chat-screen">
        <View style={styles.section}>
          <Card>
            <ConnectionStatus state="noConnection" />
          </Card>
        </View>
        <View style={styles.section}>
          <Card testID="chat-no-group">
            <Text style={typography.bodyStrong}>Open a group to start chatting.</Text>
            <Text style={[typography.bodySecondary, styles.tight]}>
              Chat conversations live inside a group or a direct message
              between two members.
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen scrollable testID="chat-screen">
        <Card>
          <Text style={typography.bodySecondary}>Loading conversation…</Text>
        </Card>
      </Screen>
    );
  }

  if (loadError !== null) {
    return (
      <Screen scrollable testID="chat-screen">
        <Card testID="chat-error">
          <Text style={typography.bodyStrong}>Conversation unavailable</Text>
          <Text style={[typography.bodySecondary, styles.tight]}>{loadError}</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <View style={styles.root} testID="chat-screen">
      <View style={styles.connection}>
        <ConnectionStatus
          state={commsAvailable ? 'localConnected' : 'noConnection'}
        />
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        testID="chat-message-list"
        data={sortedMessages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isSelf = item.senderId === localUserId;
          const status = isSelf
            ? deliveryToStatusDot(item.deliveryStatus)
            : undefined;
          const testID = `chat-message-bubble-${status ?? item.deliveryStatus}`;
          return (
            <MessageBubble
              tone={isSelf ? 'self' : 'other'}
              text={item.payload}
              timestamp={item.createdAt}
              {...(status ? { status } : {})}
              testID={testID}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[typography.bodySecondary, styles.emptyText]}>
              No messages yet. Say hello.
            </Text>
          </View>
        }
      />
      {sendError ? (
        <View style={styles.errorBar}>
          <Text style={[typography.caption, styles.errorText]}>{sendError}</Text>
        </View>
      ) : null}
      <MessageComposer
        value={composerText}
        onChangeText={text => {
          if (sendError) setSendError(null);
          setComposerText(text);
        }}
        onSend={handleSend}
        disabled={sending || localUserId === null}
      />
    </View>
  );
}

function deliveryToStatusDot(
  status: Message['deliveryStatus'],
): MessageStatusDotState | undefined {
  // Honest subset only — chat never renders DELIVERED because there is no
  // ACK layer in V1 (D-074).
  if (status === 'LOCAL' || status === 'SENT' || status === 'FAILED') {
    return status;
  }
  // Any other status (PENDING/SENDING/etc.) shouldn't appear on chat rows
  // in V1, but if a stray row exists we render no dot rather than lie.
  return undefined;
}

function appendOrReplace(prev: Message[], next: Message): Message[] {
  const idx = prev.findIndex(m => m.id === next.id);
  if (idx === -1) {
    return [...prev, next];
  }
  const copy = [...prev];
  copy[idx] = next;
  return copy;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  connection: {
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    flexGrow: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  tight: {
    marginTop: spacing.xxs,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
  },
  errorBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.sosSoft,
  },
  errorText: {
    color: colors.error,
  },
});
