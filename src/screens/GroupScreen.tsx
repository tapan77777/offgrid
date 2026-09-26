import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { SafetyActionButton } from '../components/SafetyActionButton';
import { ListRow } from '../components/ListRow';
import { StatusBadge } from '../components/StatusBadge';
import { IconBadge } from '../components/IconBadge';
import { colors, radii, spacing, typography } from '../theme';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { useGroupsStore } from '../store/groupsStore';
import { bootstrapApp } from '../services/appBootstrap';
import {
  GROUP_MEMBER_LIMIT,
  GroupsError,
  getGroupDetail,
  leaveGroup,
  renameGroup,
  type GroupDetail,
} from '../services/groups';
import {
  GroupLocationSharingError,
  disableGroupLocationSharing,
  enableGroupLocationSharing,
  getMyGroupLocationSharingView,
  sendGroupLocation,
  type GroupLocationSharingView,
  type SendGroupLocationOutcome,
} from '../services/location';
import {
  getActiveCommunicationManager,
  subscribeToActiveCommunicationManager,
} from '../services/communication/commsRuntime';
import type { RootStackParamList } from '../navigation/RootStack';
import type { GroupId, UserId } from '../types/ids';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type GroupRoute = NativeStackScreenProps<RootStackParamList, 'Group'>['route'];

export function GroupScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<GroupRoute>();
  const localUserId = useAppFoundationStore(s => s.localUserId);
  const localDeviceId = useAppFoundationStore(s => s.localDeviceId);
  const refreshGroups = useGroupsStore(s => s.refresh);

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharingView, setSharingView] =
    useState<GroupLocationSharingView | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sendStatus, setSendStatus] = useState<GroupLocationSendStatus>({
    kind: 'idle',
  });
  const [commsAvailable, setCommsAvailable] = useState<boolean>(
    getActiveCommunicationManager() !== null,
  );

  useEffect(() => {
    return subscribeToActiveCommunicationManager(m => {
      setCommsAvailable(m !== null);
    });
  }, []);

  const groupId = route.params?.groupId as GroupId | undefined;

  const load = useCallback(() => {
    if (!groupId || !localUserId) {
      setLoading(false);
      setLoadError('Missing group.');
      return;
    }
    try {
      const { db } = bootstrapApp();
      const next = getGroupDetail(db, groupId, localUserId);
      setDetail(next);
      setLoadError(null);
      setSharingView(
        getMyGroupLocationSharingView(db, {
          groupId,
          userId: localUserId,
        }),
      );
    } catch (err) {
      const msg = err instanceof GroupsError ? err.message : String(err);
      setLoadError(msg);
      setDetail(null);
      setSharingView(null);
    } finally {
      setLoading(false);
    }
  }, [groupId, localUserId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (detail) {
      navigation.setOptions({ title: detail.group.name });
    }
  }, [detail, navigation]);

  const startRename = useCallback(() => {
    if (!detail) {
      return;
    }
    setRenameValue(detail.group.name);
    setRenaming(true);
  }, [detail]);

  const cancelRename = useCallback(() => {
    setRenaming(false);
    setRenameValue('');
  }, []);

  const commitRename = useCallback(() => {
    if (!detail || !localUserId) {
      return;
    }
    const trimmed = renameValue.trim();
    if (trimmed.length === 0 || trimmed === detail.group.name) {
      cancelRename();
      return;
    }
    setBusy(true);
    try {
      const { db } = bootstrapApp();
      renameGroup(db, {
        groupId: detail.group.id,
        actorUserId: localUserId,
        name: trimmed,
      });
      refreshGroups(db, localUserId);
      setRenaming(false);
      load();
    } catch (err) {
      const msg = err instanceof GroupsError ? err.message : String(err);
      Alert.alert('Could not rename', msg);
    } finally {
      setBusy(false);
    }
  }, [cancelRename, detail, load, localUserId, refreshGroups, renameValue]);

  const performLeave = useCallback(
    (id: GroupId, userId: UserId) => {
      setBusy(true);
      try {
        const { db } = bootstrapApp();
        leaveGroup(db, { groupId: id, userId });
        refreshGroups(db, userId);
        navigation.goBack();
      } catch (err) {
        const msg = err instanceof GroupsError ? err.message : String(err);
        Alert.alert('Could not leave', msg);
        setBusy(false);
      }
    },
    [navigation, refreshGroups],
  );

  const confirmLeave = useCallback(() => {
    if (!detail || !localUserId) {
      return;
    }
    Alert.alert(
      'Leave group?',
      `You will stop receiving messages from ${detail.group.name} on this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => performLeave(detail.group.id, localUserId),
        },
      ],
    );
  }, [detail, localUserId, performLeave]);

  const toggleSharing = useCallback(() => {
    if (!detail || !localUserId || sharingBusy) {
      return;
    }
    setSharingBusy(true);
    try {
      const { db } = bootstrapApp();
      const currentlyEnabled = sharingView?.sharing === 'enabled';
      if (currentlyEnabled) {
        disableGroupLocationSharing(db, {
          groupId: detail.group.id,
          userId: localUserId,
        });
      } else {
        enableGroupLocationSharing(db, {
          groupId: detail.group.id,
          userId: localUserId,
        });
      }
      setSharingView(
        getMyGroupLocationSharingView(db, {
          groupId: detail.group.id,
          userId: localUserId,
        }),
      );
    } catch (err) {
      const msg =
        err instanceof GroupLocationSharingError ? err.message : String(err);
      Alert.alert('Location sharing', msg);
    } finally {
      setSharingBusy(false);
    }
  }, [detail, localUserId, sharingBusy, sharingView]);

  const onShareCurrentLocation = useCallback(async () => {
    if (!detail || !localUserId) return;
    const manager = getActiveCommunicationManager();
    if (!manager) {
      setSendStatus({ kind: 'no-comms' });
      return;
    }
    setSendStatus({ kind: 'sending' });
    try {
      const { db } = bootstrapApp();
      const outcome = await sendGroupLocation({
        db,
        groupId: detail.group.id,
        userId: localUserId,
        deviceId: localDeviceId ?? null,
        sendEnvelope: body => manager.sendGroupLocationEnvelope(body),
      });
      setSendStatus(outcomeToStatus(outcome));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSendStatus({ kind: 'failed', reason: message });
    }
  }, [detail, localDeviceId, localUserId]);

  if (loading) {
    return (
      <Screen scrollable testID="group-screen">
        <Card>
          <Text style={typography.bodySecondary}>Loading group…</Text>
        </Card>
      </Screen>
    );
  }

  if (loadError !== null || !detail) {
    return (
      <Screen scrollable testID="group-screen">
        <Card testID="group-error">
          <Text style={typography.bodyStrong}>Group unavailable</Text>
          <Text style={[typography.bodySecondary, styles.spaced]}>
            {loadError ?? 'The group could not be loaded.'}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Back"
              variant="ghost"
              onPress={() => navigation.goBack()}
              testID="group-error-back"
            />
          </View>
        </Card>
      </Screen>
    );
  }

  const isAdmin = detail.localMembership?.role === 'admin';
  const memberCount = detail.members.length;

  return (
    <Screen scrollable testID="group-screen">
      <View style={styles.header}>
        {renaming ? (
          <View style={styles.renameRow}>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              maxLength={64}
              editable={!busy}
              testID="group-rename-input"
              accessibilityLabel="Group name"
            />
            <View style={styles.renameActions}>
              <Button
                label="Cancel"
                variant="ghost"
                size="sm"
                onPress={cancelRename}
                disabled={busy}
                testID="group-rename-cancel"
              />
              <Button
                label="Save"
                size="sm"
                onPress={commitRename}
                disabled={busy}
                testID="group-rename-save"
              />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.title} testID="group-title">
              {detail.group.name}
            </Text>
            <Text style={[typography.bodySecondary, styles.sub]}>
              {memberCount} of {GROUP_MEMBER_LIMIT} members
            </Text>
          </>
        )}
      </View>

      {/*
       * Real transport state is only wired into the Diagnostics screen. Show
       * "no connection" here to stay honest (CLAUDE.md §20, D-029).
       */}
      <View style={styles.section}>
        <Card>
          <ConnectionStatus state="noConnection" />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Invitation" />
        <Card testID="group-invite-card">
          <Text style={typography.bodyStrong}>Join code</Text>
          <Text style={[typography.caption, styles.spaced]}>
            Share this code with people you want to invite. Groups are private
            — anyone with the code can join, so share it in person.
          </Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText} testID="group-invite-code">
              {detail.joinCode}
            </Text>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <View style={styles.tileRow}>
          <Card
            style={styles.tile}
            onPress={() => navigation.navigate('Map', { groupId: detail.group.id })}
            accessibilityLabel="Open group map"
            testID="group-open-map"
          >
            <IconBadge name="map" tone="brand" />
            <View style={styles.tileText}>
              <Text style={typography.bodyStrong}>Map</Text>
              <Text style={typography.caption}>Group positions</Text>
            </View>
          </Card>
          <Card
            style={styles.tile}
            onPress={() => navigation.navigate('Chat', { groupId: detail.group.id })}
            accessibilityLabel="Open group chat"
            testID="group-open-chat"
          >
            <IconBadge name="chat" tone="brand" />
            <View style={styles.tileText}>
              <Text style={typography.bodyStrong}>Chat</Text>
              <Text style={typography.caption}>Group messages</Text>
            </View>
          </Card>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Members"
          trailing={
            <Text
              style={styles.link}
              onPress={() =>
                navigation.navigate('Members', { groupId: detail.group.id })
              }
              accessibilityRole="link"
              testID="group-members-see-all"
            >
              See all
            </Text>
          }
        />
        <Card padded={false} style={styles.listCard} testID="group-members-preview">
          {detail.members.slice(0, 3).map((member, index) => (
            <View key={member.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <ListRow
                title={
                  member.userId === localUserId ? 'You' : shortId(member.userId)
                }
                subtitle={member.role === 'admin' ? 'Admin' : 'Member'}
                icon="person"
                iconTone={member.userId === localUserId ? 'brand' : 'neutral'}
                trailing={
                  member.userId === localUserId ? (
                    <StatusBadge tone="neutral" label="You" />
                  ) : undefined
                }
              />
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Location" />
        <Card testID="group-location-card">
          <LocationSharingSummary view={sharingView} />
          <View style={styles.locationActions}>
            <Button
              label={
                sharingView?.sharing === 'enabled'
                  ? 'Stop sharing my location'
                  : 'Share my location with this group'
              }
              variant={
                sharingView?.sharing === 'enabled' ? 'secondary' : 'primary'
              }
              onPress={toggleSharing}
              disabled={sharingBusy || sharingView === null}
              testID="group-location-toggle"
            />
            <Button
              label={
                sendStatus.kind === 'sending'
                  ? 'Sending…'
                  : 'Share current location now'
              }
              variant="secondary"
              onPress={onShareCurrentLocation}
              disabled={
                sharingView?.sharing !== 'enabled' ||
                sendStatus.kind === 'sending'
              }
              testID="group-location-share-now"
            />
          </View>
          <SendStatusText status={sendStatus} commsAvailable={commsAvailable} />
          <Text style={[typography.caption, styles.locationNote]}>
            Sharing stays local until a live connection is available. No one
            outside this group can see your location.
          </Text>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Safety" />
        <View style={styles.safetyStack}>
          <SafetyActionButton kind="imSafe" disabled />
          <SafetyActionButton kind="sos" disabled />
          <Text style={[typography.caption, styles.safetyNote]}>
            Safety actions activate once a connection is available.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Actions" />
        <View style={styles.actionsColumn}>
          {isAdmin ? (
            <Button
              label="Rename group"
              variant="secondary"
              onPress={startRename}
              disabled={renaming || busy}
              testID="group-rename"
            />
          ) : null}
          <Button
            label="Leave group"
            variant="danger"
            onPress={confirmLeave}
            disabled={busy}
            testID="group-leave"
          />
        </View>
      </View>
    </Screen>
  );
}

function shortId(id: string): string {
  return `Member ${id.slice(0, 6)}`;
}

function LocationSharingSummary({
  view,
}: {
  readonly view: GroupLocationSharingView | null;
}): React.JSX.Element {
  if (view === null) {
    return (
      <>
        <StatusBadge tone="neutral" label="Loading" />
        <Text style={[typography.bodySecondary, styles.locationBody]}>
          Checking your location sharing state…
        </Text>
      </>
    );
  }
  if (view.sharing === 'disabled') {
    return (
      <>
        <StatusBadge tone="offline" label="Not sharing" />
        <Text style={[typography.bodyStrong, styles.locationBody]}>
          Location sharing is off for this group.
        </Text>
        <Text style={typography.bodySecondary}>
          Turn it on to let group members see where you are once a connection is
          available.
        </Text>
      </>
    );
  }
  if (view.location === 'unavailable') {
    return (
      <>
        <StatusBadge tone="stale" label="No location yet" />
        <Text style={[typography.bodyStrong, styles.locationBody]}>
          Sharing is on, but this device has no location fix yet.
        </Text>
        <Text style={typography.bodySecondary}>
          Use the Home screen to acquire a GPS fix.
        </Text>
      </>
    );
  }
  if (view.location === 'stale') {
    return (
      <>
        <StatusBadge tone="stale" label="Last known" />
        <Text style={[typography.bodyStrong, styles.locationBody]}>
          Sharing your last-known location
        </Text>
        <Text style={typography.bodySecondary}>
          {`Updated ${formatAge(view.ageMs)} ago.`}
        </Text>
      </>
    );
  }
  return (
    <>
      <StatusBadge tone="connected" label="Sharing" />
      <Text style={[typography.bodyStrong, styles.locationBody]}>
        Sharing your current location with this group
      </Text>
      <Text style={typography.bodySecondary}>
        {`Updated ${formatAge(view.ageMs)} ago.`}
      </Text>
    </>
  );
}

type GroupLocationSendStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'sharing-disabled' }
  | { kind: 'not-a-member' }
  | { kind: 'no-fix'; reason: string }
  | { kind: 'no-comms' }
  | { kind: 'failed'; reason: string };

function outcomeToStatus(
  outcome: SendGroupLocationOutcome,
): GroupLocationSendStatus {
  switch (outcome.status) {
    case 'sent':
      return { kind: 'sent' };
    case 'sharing-disabled':
      return { kind: 'sharing-disabled' };
    case 'not-a-member':
      return { kind: 'not-a-member' };
    case 'no-fix':
      return {
        kind: 'no-fix',
        reason:
          outcome.reason.status === 'permission-denied'
            ? 'Location permission is denied.'
            : outcome.reason.status === 'timeout'
              ? 'Location request timed out.'
              : outcome.reason.status === 'unavailable'
                ? outcome.reason.reason
                : 'Location unavailable.',
      };
    case 'transport-error':
      return { kind: 'failed', reason: outcome.error.message };
  }
}

function SendStatusText({
  status,
  commsAvailable,
}: {
  readonly status: GroupLocationSendStatus;
  readonly commsAvailable: boolean;
}): React.JSX.Element | null {
  if (status.kind === 'idle' && commsAvailable) return null;
  if (status.kind === 'idle' && !commsAvailable) {
    return (
      <Text style={[typography.caption, styles.sendStatus]}>
        No connection: open the diagnostics screen to start a session.
      </Text>
    );
  }
  const label = ((): string => {
    switch (status.kind) {
      case 'sending':
        return 'Sending your current location…';
      case 'sent':
        return 'Sent to the local session. No delivery confirmation yet.';
      case 'sharing-disabled':
        return 'Sharing is off for this group. Turn it on first.';
      case 'not-a-member':
        return 'You are no longer an active member of this group.';
      case 'no-fix':
        return `Location unavailable: ${status.reason}`;
      case 'no-comms':
        return 'No connection: open the diagnostics screen to start a session.';
      case 'failed':
        return `Failed: ${status.reason}`;
      case 'idle':
        return '';
    }
  })();
  return (
    <Text
      style={[typography.caption, styles.sendStatus]}
      testID="group-location-share-status"
    >
      {label}
    </Text>
  );
}

function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  title: {
    ...typography.displayMedium,
  },
  sub: {
    color: colors.textSecondary,
  },
  spaced: {
    marginTop: spacing.xxs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    gap: spacing.sm,
  },
  tileText: {
    gap: 2,
  },
  link: {
    ...typography.caption,
    color: colors.brandBright,
    fontWeight: '600',
  },
  listCard: {
    paddingHorizontal: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 48,
  },
  safetyStack: {
    gap: spacing.sm,
  },
  safetyNote: {
    color: colors.textMuted,
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.xxs,
  },
  locationBody: {
    marginTop: spacing.sm,
  },
  locationActions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  locationNote: {
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  sendStatus: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionsColumn: {
    gap: spacing.sm,
  },
  codeBox: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceInset,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  codeText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    color: colors.textPrimary,
    fontFamily: 'Courier',
  },
  renameRow: {
    gap: spacing.sm,
  },
  renameInput: {
    backgroundColor: colors.surfaceInset,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  renameActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
});
