import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { colors, spacing, typography } from '../theme';
import { bootstrapApp } from '../services/appBootstrap';
import { useAppFoundationStore } from '../store/appFoundationStore';
import {
  nearbyPeerLabel,
  useNearbyStore,
  type NearbyIncomingRequest,
} from '../store/nearbyStore';
import { CommunicationManager } from '../services/communication/CommunicationManager';
import {
  getActiveCommunicationManager,
  setActiveCommunicationManager,
} from '../services/communication/commsRuntime';
import { WifiP2pTransport } from '../services/communication/transports/WifiP2pTransport';
import {
  ChatRequestError,
  acceptChatRequest,
  declineChatRequest,
  ensureDirectConversation,
  sendChatRequest,
} from '../services/chat';
import { UserRepo } from '../database/repositories';
import {
  ensureNearbyWifiPermission,
  hasNearbyWifiPermission,
} from '../utils/permissions';
import type { PeerHandle } from '../types/communication';
import type { RootStackParamList } from '../navigation/RootStack';
import type { MessageId, UserId } from '../types/ids';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NearbyScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const localDeviceId = useAppFoundationStore(s => s.localDeviceId);
  const localUserId = useAppFoundationStore(s => s.localUserId);

  const status = useNearbyStore(s => s.status);
  const permission = useNearbyStore(s => s.permission);
  const peers = useNearbyStore(s => s.peers);
  const outgoing = useNearbyStore(s => s.outgoing);
  const incoming = useNearbyStore(s => s.incoming);
  const errorMessage = useNearbyStore(s => s.errorMessage);
  const setStatus = useNearbyStore(s => s.setStatus);
  const setPermission = useNearbyStore(s => s.setPermission);
  const setPeers = useNearbyStore(s => s.setPeers);
  const setOutgoing = useNearbyStore(s => s.setOutgoing);
  const addIncoming = useNearbyStore(s => s.addIncoming);
  const removeIncoming = useNearbyStore(s => s.removeIncoming);
  const setError = useNearbyStore(s => s.setError);
  const resetNearby = useNearbyStore(s => s.reset);

  const managerRef = useRef<CommunicationManager | null>(null);
  const managerOwnedRef = useRef(false);
  const unsubscribeManagerRef = useRef<(() => void) | null>(null);
  const [connectionFormed, setConnectionFormed] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  const teardown = useCallback(async () => {
    unsubscribeManagerRef.current?.();
    unsubscribeManagerRef.current = null;
    const mgr = managerRef.current;
    managerRef.current = null;
    if (mgr && managerOwnedRef.current) {
      setActiveCommunicationManager(null);
      try {
        await mgr.dispose();
      } catch {
        // Disposing a transport can throw on Android when the underlying
        // channel is already gone. Swallow — we're unmounting.
      }
    }
    managerOwnedRef.current = false;
  }, []);

  const stopSearching = useCallback(async () => {
    const mgr = managerRef.current;
    if (mgr) {
      try {
        await mgr.stopDiscovery();
      } catch {
        // best-effort
      }
    }
    setStatus('stopped');
  }, [setStatus]);

  const attachToManager = useCallback(
    (manager: CommunicationManager): void => {
      unsubscribeManagerRef.current?.();
      unsubscribeManagerRef.current = manager.on(event => {
        if (event.kind === 'peersChanged') {
          setPeers(event.peers);
          return;
        }
        if (event.kind === 'connectionChanged') {
          setConnectionFormed(event.snapshot.groupFormed);
          return;
        }
        if (event.kind === 'error') {
          setError(event.message);
          setStatus('error');
          return;
        }
        if (event.kind === 'chatRequestEnvelopeReceived') {
          const body = event.envelope.body;
          if (body.kind !== 'chat.request') return;
          if (
            body.payload.toUserId !== null &&
            (body.payload.toUserId as string) !== (localUserId as string)
          ) {
            return;
          }
          if (
            (body.payload.fromUserId as string) === (localUserId as string)
          ) {
            return;
          }
          const entry: NearbyIncomingRequest = {
            requestId: body.payload.requestId,
            fromUserId: body.payload.fromUserId,
            fromDisplayName: body.payload.fromDisplayName,
            originDeviceId: event.envelope.originDeviceId,
            receivedAt: event.envelope.sentAt,
          };
          addIncoming(entry);
          return;
        }
        if (event.kind === 'chatRequestAcceptEnvelopeReceived') {
          const body = event.envelope.body;
          if (body.kind !== 'chat.request.accept') return;
          if (
            (body.payload.requesterUserId as string) !==
            (localUserId as string)
          ) {
            return;
          }
          const current = useNearbyStore.getState().outgoing;
          if (
            current.stage !== 'sending' &&
            current.stage !== 'waitingForReply'
          ) {
            return;
          }
          if (current.requestId !== body.payload.requestId) return;

          try {
            const { db } = bootstrapApp();
            // Ensure the accepter's user row (the responder already does this
            // for privacy defence-in-depth, but if the responder ran first we
            // still need to be idempotent here).
            if (!UserRepo.findUserById(db, body.payload.accepterUserId)) {
              UserRepo.insertUser(db, {
                id: body.payload.accepterUserId,
                displayName: body.payload.accepterDisplayName,
                nowIso: new Date().toISOString(),
              });
            }
            const group = ensureDirectConversation(db, {
              userA: localUserId as UserId,
              userB: body.payload.accepterUserId,
              nowIso: new Date().toISOString(),
            });
            setOutgoing({
              stage: 'accepted',
              requestId: current.requestId,
              targetPeerKey: current.targetPeerKey,
              peerUserId: body.payload.accepterUserId,
              peerDisplayName: body.payload.accepterDisplayName,
              directGroupId: group.id,
            });
          } catch (err) {
            setOutgoing({
              stage: 'failed',
              reason: err instanceof Error ? err.message : String(err),
              targetPeerKey: current.targetPeerKey,
            });
          }
          return;
        }
        if (event.kind === 'chatRequestDeclineEnvelopeReceived') {
          const body = event.envelope.body;
          if (body.kind !== 'chat.request.decline') return;
          if (
            (body.payload.requesterUserId as string) !==
            (localUserId as string)
          ) {
            return;
          }
          const current = useNearbyStore.getState().outgoing;
          if (
            current.stage !== 'sending' &&
            current.stage !== 'waitingForReply'
          ) {
            return;
          }
          if (current.requestId !== body.payload.requestId) return;
          setOutgoing({
            stage: 'declined',
            requestId: current.requestId,
            targetPeerKey: current.targetPeerKey,
          });
        }
      });
    },
    [addIncoming, localUserId, setError, setOutgoing, setPeers, setStatus],
  );

  const startSearching = useCallback(async () => {
    if (!localDeviceId) return;
    setError(null);

    if (Platform.OS === 'android') {
      const granted = await hasNearbyWifiPermission();
      if (!granted) {
        const result = await ensureNearbyWifiPermission();
        setPermission(result);
        if (result !== 'granted' && result !== 'not-android') {
          setStatus('permissionRequired');
          return;
        }
      } else {
        setPermission('granted');
      }
    } else {
      setPermission('not-android');
    }

    setStatus('initializing');
    setConnectionFormed(false);

    const existing = getActiveCommunicationManager();
    let manager = existing;
    if (!manager) {
      const { db } = bootstrapApp();
      manager = new CommunicationManager({
        transport: new WifiP2pTransport(),
        db,
        localDeviceId,
      });
      managerRef.current = manager;
      managerOwnedRef.current = true;
      setActiveCommunicationManager(manager);
      attachToManager(manager);
      try {
        await manager.initialize();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
        await teardown();
        return;
      }
    } else {
      managerRef.current = manager;
      managerOwnedRef.current = false;
      attachToManager(manager);
    }

    try {
      await manager.startDiscovery();
      setStatus('searching');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [
    attachToManager,
    localDeviceId,
    setError,
    setPermission,
    setStatus,
    teardown,
  ]);

  useFocusEffect(
    useCallback(() => {
      startSearching();
      return () => {
        stopSearching();
      };
    }, [startSearching, stopSearching]),
  );

  useEffect(() => {
    return () => {
      teardown();
      resetNearby();
    };
  }, [teardown, resetNearby]);

  const handleRequestChat = useCallback(
    async (peer: PeerHandle) => {
      if (busy || !localUserId) return;
      setBusy(true);
      setError(null);
      const manager = managerRef.current;
      if (!manager) {
        setBusy(false);
        return;
      }
      try {
        const { db } = bootstrapApp();
        const localUser = UserRepo.findUserById(db, localUserId);
        const displayName = localUser?.displayName?.trim().length
          ? localUser.displayName
          : 'OFFGRID user';

        // Pending outgoing state — records which peer we're addressing so
        // duplicate taps on other peers won't clobber this request.
        const placeholderRequestId = ('' as unknown) as MessageId;
        setOutgoing({
          stage: 'connecting',
          requestId: placeholderRequestId,
          targetPeerKey: peer.id,
        });

        if (!connectionFormed) {
          await manager.connectToPeer(peer.deviceAddress);
          // Wait one microtask so the connectionChanged event flushes;
          // CommunicationManager's send methods refuse if the transport
          // hasn't reported groupFormed=true yet.
          await new Promise<void>(resolve => setTimeout(resolve, 250));
        }

        setOutgoing({
          stage: 'sending',
          requestId: placeholderRequestId,
          targetPeerKey: peer.id,
        });
        const outcome = await sendChatRequest({
          db,
          manager,
          fromUserId: localUserId,
          fromDisplayName: displayName,
        });
        setOutgoing({
          stage: 'waitingForReply',
          requestId: outcome.requestId,
          targetPeerKey: peer.id,
        });
      } catch (err) {
        const message =
          err instanceof ChatRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        setOutgoing({
          stage: 'failed',
          reason: message,
          targetPeerKey: peer.id,
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, connectionFormed, localUserId, setError, setOutgoing],
  );

  const handleAccept = useCallback(
    async (entry: NearbyIncomingRequest) => {
      if (!localUserId) return;
      const manager = managerRef.current;
      const { db } = bootstrapApp();
      const localUser = UserRepo.findUserById(db, localUserId);
      const displayName = localUser?.displayName?.trim().length
        ? localUser.displayName
        : 'OFFGRID user';
      try {
        const result = await acceptChatRequest({
          db,
          manager,
          requestId: entry.requestId,
          accepterUserId: localUserId,
          accepterDisplayName: displayName,
          requesterOriginDeviceId: entry.originDeviceId,
        });
        removeIncoming(entry.requestId);
        navigation.navigate('Chat', { groupId: result.directGroup.id });
      } catch (err) {
        const message =
          err instanceof ChatRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        Alert.alert('Could not accept', message);
      }
    },
    [localUserId, navigation, removeIncoming],
  );

  const handleDecline = useCallback(
    async (entry: NearbyIncomingRequest) => {
      if (!localUserId) return;
      const manager = managerRef.current;
      const { db } = bootstrapApp();
      try {
        await declineChatRequest({
          db,
          manager,
          requestId: entry.requestId,
          declinerUserId: localUserId,
          requesterOriginDeviceId: entry.originDeviceId,
        });
      } catch (err) {
        // Best-effort decline (D-076). Log-only.
        console.warn(
          '[nearby-screen] decline failed:',
          err instanceof Error ? err.message : String(err),
        );
      }
      removeIncoming(entry.requestId);
    },
    [localUserId, removeIncoming],
  );

  useEffect(() => {
    if (outgoing.stage === 'accepted') {
      navigation.navigate('Chat', { groupId: outgoing.directGroupId });
      setOutgoing({ stage: 'idle' });
    }
  }, [navigation, outgoing, setOutgoing]);

  const statusCard = renderStatusCard(status, permission, errorMessage);

  return (
    <Screen scrollable testID="nearby-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Nearby</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          People near you — no Internet needed.
        </Text>
      </View>

      <View style={styles.section}>
        <Card>{statusCard}</Card>
      </View>

      {status === 'permissionRequired' ? (
        <View style={styles.section}>
          <Card testID="nearby-permission-card">
            <Text style={typography.bodyStrong}>
              Allow nearby devices to continue.
            </Text>
            <Text style={[typography.bodySecondary, styles.tight]}>
              OFFGRID needs nearby-device access to find other people around
              you without the Internet.
            </Text>
            <View style={styles.actionsRow}>
              <Button
                label="Allow access"
                onPress={startSearching}
                testID="nearby-permission-request"
              />
            </View>
          </Card>
        </View>
      ) : null}

      {incoming.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="Chat requests for you" />
          <Card padded={false} testID="nearby-incoming-list">
            {incoming.map((entry, index) => (
              <View key={entry.requestId}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.incomingRow}>
                  <View style={styles.incomingText}>
                    <Text style={typography.bodyStrong}>
                      {entry.fromDisplayName}
                    </Text>
                    <Text style={typography.caption}>
                      Wants to chat with you
                    </Text>
                  </View>
                  <View style={styles.incomingActions}>
                    <Button
                      label="Decline"
                      variant="ghost"
                      size="sm"
                      onPress={() => handleDecline(entry)}
                      testID={`nearby-decline-${entry.requestId}`}
                    />
                    <Button
                      label="Accept"
                      size="sm"
                      onPress={() => handleAccept(entry)}
                      testID={`nearby-accept-${entry.requestId}`}
                    />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader
          title="Nearby OFFGRID devices"
          trailing={
            status === 'searching' ? (
              <StatusBadge tone="connecting" label="Searching" />
            ) : status === 'stopped' ? (
              <Button
                label="Search again"
                variant="ghost"
                size="sm"
                onPress={startSearching}
                testID="nearby-search-again"
              />
            ) : null
          }
        />
        {renderPeersCard({
          peers,
          status,
          outgoing,
          onRequest: handleRequestChat,
          busy,
        })}
      </View>

      {status === 'searching' ? (
        <View style={styles.section}>
          <Button
            label="Stop searching"
            variant="ghost"
            onPress={stopSearching}
            testID="nearby-stop-searching"
          />
        </View>
      ) : null}

      {outgoing.stage === 'declined' ? (
        <View style={styles.section}>
          <Card testID="nearby-declined-notice">
            <Text style={typography.bodyStrong}>Request declined</Text>
            <Text style={[typography.bodySecondary, styles.tight]}>
              They chose not to chat right now. You can try again later.
            </Text>
            <View style={styles.actionsRow}>
              <Button
                label="OK"
                variant="ghost"
                onPress={() => setOutgoing({ stage: 'idle' })}
                testID="nearby-clear-declined"
              />
            </View>
          </Card>
        </View>
      ) : null}

      {outgoing.stage === 'failed' ? (
        <View style={styles.section}>
          <Card testID="nearby-failed-notice">
            <Text style={typography.bodyStrong}>Could not send request</Text>
            <Text style={[typography.bodySecondary, styles.tight]}>
              {outgoing.reason}
            </Text>
            <View style={styles.actionsRow}>
              <Button
                label="OK"
                variant="ghost"
                onPress={() => setOutgoing({ stage: 'idle' })}
                testID="nearby-clear-failed"
              />
            </View>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

function renderStatusCard(
  status: ReturnType<typeof useNearbyStore.getState>['status'],
  permission: ReturnType<typeof useNearbyStore.getState>['permission'],
  errorMessage: string | null,
): React.JSX.Element {
  switch (status) {
    case 'idle':
      return (
        <Text style={typography.bodySecondary}>
          Preparing to look for nearby OFFGRID devices…
        </Text>
      );
    case 'permissionRequired':
      return (
        <Text style={typography.bodySecondary}>
          {permission === 'never_ask_again'
            ? 'Nearby-devices access is blocked. Enable it in system settings for OFFGRID.'
            : 'Nearby-devices access is needed to find people around you.'}
        </Text>
      );
    case 'initializing':
      return (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.brandStrong} />
          <Text style={typography.bodySecondary}>Turning on nearby radio…</Text>
        </View>
      );
    case 'searching':
      return (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.brandStrong} />
          <Text style={typography.bodySecondary}>
            Looking for other OFFGRID users nearby…
          </Text>
        </View>
      );
    case 'stopped':
      return (
        <Text style={typography.bodySecondary}>
          Search paused. Tap "Search again" to keep looking.
        </Text>
      );
    case 'error':
      return (
        <Text style={typography.bodySecondary}>
          {errorMessage ?? 'Something went wrong.'}
        </Text>
      );
  }
}

interface PeersCardProps {
  readonly peers: readonly PeerHandle[];
  readonly status: ReturnType<typeof useNearbyStore.getState>['status'];
  readonly outgoing: ReturnType<typeof useNearbyStore.getState>['outgoing'];
  readonly onRequest: (peer: PeerHandle) => void;
  readonly busy: boolean;
}

function renderPeersCard({
  peers,
  status,
  outgoing,
  onRequest,
  busy,
}: PeersCardProps): React.JSX.Element {
  if (peers.length === 0) {
    return (
      <Card testID="nearby-peers-empty">
        <Text style={typography.bodyStrong}>Nothing here yet.</Text>
        <Text style={[typography.bodySecondary, styles.tight]}>
          Make sure the other person also has OFFGRID open and is looking for
          nearby devices. Devices need to be close to each other.
        </Text>
      </Card>
    );
  }
  return (
    <Card padded={false} testID="nearby-peers-list">
      {peers.map((peer, index) => {
        const isTargeted =
          outgoing.stage !== 'idle' &&
          outgoing.stage !== 'failed' &&
          'targetPeerKey' in outgoing &&
          outgoing.targetPeerKey === peer.id;
        const label = trailingLabel(outgoing, isTargeted, busy, status);
        const rowDisabled = busy || isTargeted;
        return (
          <View key={peer.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {rowDisabled ? (
              <ListRow
                icon="radio"
                iconTone="brand"
                title={nearbyPeerLabel(peer)}
                subtitle="Tap to send a chat request"
                trailing={label}
                testID={`nearby-peer-${peer.id}`}
              />
            ) : (
              <ListRow
                icon="radio"
                iconTone="brand"
                title={nearbyPeerLabel(peer)}
                subtitle="Tap to send a chat request"
                onPress={() => onRequest(peer)}
                trailing={label}
                testID={`nearby-peer-${peer.id}`}
              />
            )}
          </View>
        );
      })}
    </Card>
  );
}

function trailingLabel(
  outgoing: ReturnType<typeof useNearbyStore.getState>['outgoing'],
  isTargeted: boolean,
  busy: boolean,
  status: ReturnType<typeof useNearbyStore.getState>['status'],
): React.ReactNode {
  if (!isTargeted) {
    if (busy) return <StatusBadge tone="neutral" label="Busy" />;
    if (status === 'searching')
      return <StatusBadge tone="connecting" label="Nearby" />;
    return null;
  }
  switch (outgoing.stage) {
    case 'connecting':
      return <StatusBadge tone="connecting" label="Connecting" />;
    case 'sending':
      return <StatusBadge tone="connecting" label="Sending" />;
    case 'waitingForReply':
      return <StatusBadge tone="connecting" label="Waiting" />;
    case 'accepted':
      return <StatusBadge tone="connected" label="Accepted" />;
    case 'declined':
      return <StatusBadge tone="stale" label="Declined" />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    ...typography.displayMedium,
  },
  sub: {
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  tight: {
    marginTop: spacing.xxs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'flex-end',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  incomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  incomingText: {
    flex: 1,
    gap: 2,
  },
  incomingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: spacing.md,
  },
});
