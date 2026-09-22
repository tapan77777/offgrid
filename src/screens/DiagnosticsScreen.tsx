import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bootstrapApp } from '../services/appBootstrap';
import {
  CommunicationManager,
  RelayRouter,
  SETTING_PHASE3_DIAGNOSTICS_ENABLED,
  ensureDiagnosticGroup,
  isDiagnosticsEnabled,
  setDiagnosticsEnabled,
} from '../services/communication';
import { setActiveCommunicationManager } from '../services/communication/commsRuntime';
import { attachGroupLocationReceiver } from '../services/location/groupLocationReceiver';
import { WifiP2pTransport } from '../services/communication/transports/WifiP2pTransport';
import type { DeviceId } from '../types/ids';
import { useAppFoundationStore } from '../store/appFoundationStore';
import {
  useCommunicationStore,
  type DiagnosticsLogEntry,
  type DiagnosticsLogKind,
} from '../store/communicationStore';
import type { PeerHandle } from '../types/communication';
import {
  ensureNearbyWifiPermission,
  hasNearbyWifiPermission,
} from '../utils/permissions';

type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'never_ask_again' | 'not-android';

export function DiagnosticsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const foundationStatus = useAppFoundationStore(s => s.status);
  const localDeviceId = useAppFoundationStore(s => s.localDeviceId);

  const transportState = useCommunicationStore(s => s.transportState);
  const peers = useCommunicationStore(s => s.peers);
  const connection = useCommunicationStore(s => s.connection);
  const lastError = useCommunicationStore(s => s.lastError);
  const log = useCommunicationStore(s => s.log);
  const reset = useCommunicationStore(s => s.reset);

  const managerRef = useRef<CommunicationManager | null>(null);
  const routerRef = useRef<RelayRouter | null>(null);
  const receiverUnsubRef = useRef<(() => void) | null>(null);
  const [permission, setPermission] = useState<PermissionStatus>('unknown');
  const [enabled, setEnabled] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [destinationDeviceIdInput, setDestinationDeviceIdInput] =
    useState<string>('');
  const [envelopeTextInput, setEnvelopeTextInput] = useState<string>('relay hop test');

  const appendLog = useCommunicationStore(s => s.appendLog);
  const setTransportState = useCommunicationStore(s => s.setTransportState);
  const setPeers = useCommunicationStore(s => s.setPeers);
  const setConnection = useCommunicationStore(s => s.setConnection);
  const setLastError = useCommunicationStore(s => s.setLastError);

  const pushLog = useCallback(
    (kind: DiagnosticsLogKind, message: string) => {
      const entry: DiagnosticsLogEntry = {
        at: new Date().toISOString(),
        kind,
        message,
      };
      appendLog(entry);
    },
    [appendLog],
  );

  useEffect(() => {
    if (foundationStatus !== 'ready') return;
    const { db } = bootstrapApp();
    setEnabled(isDiagnosticsEnabled(db));
    if (Platform.OS === 'android') {
      hasNearbyWifiPermission()
        .then(granted => setPermission(granted ? 'granted' : 'denied'))
        .catch(() => setPermission('denied'));
    } else {
      setPermission('not-android');
    }
    return () => {
      const mgr = managerRef.current;
      const router = routerRef.current;
      const detachRx = receiverUnsubRef.current;
      managerRef.current = null;
      routerRef.current = null;
      receiverUnsubRef.current = null;
      setActiveCommunicationManager(null);
      if (detachRx) detachRx();
      if (router) {
        router.detach();
      }
      if (mgr) {
        mgr.dispose().catch(() => undefined);
      }
      reset();
    };
  }, [foundationStatus, reset]);

  const ensureManager = useCallback((): CommunicationManager | null => {
    if (managerRef.current) return managerRef.current;
    if (!localDeviceId) return null;
    const { db } = bootstrapApp();
    ensureDiagnosticGroup(db);
    const transport = new WifiP2pTransport();
    const manager = new CommunicationManager({
      transport,
      db,
      localDeviceId,
    });
    manager.on(event => {
      switch (event.kind) {
        case 'stateChanged':
          setTransportState(event.state);
          pushLog('state', `state → ${event.state}`);
          return;
        case 'peersChanged':
          setPeers(event.peers);
          pushLog('peers', `${event.peers.length} peer(s) visible`);
          return;
        case 'connectionChanged':
          setConnection(event.snapshot);
          pushLog(
            'connection',
            event.snapshot.groupFormed
              ? `group formed (owner=${event.snapshot.isGroupOwner}, addr=${event.snapshot.groupOwnerAddress ?? '—'})`
              : 'group not formed',
          );
          return;
        case 'pingSent':
          pushLog('sent', `sent ping ${event.ping.id.slice(0, 8)}…`);
          return;
        case 'pingReceived':
          pushLog(
            event.wasDuplicate ? 'duplicate' : 'received',
            `${event.wasDuplicate ? 'duplicate' : 'received'} ping ${event.ping.id.slice(0, 8)}… from ${event.ping.fromDeviceId.slice(0, 8)}…`,
          );
          return;
        case 'groupLocationEnvelopeSent':
          pushLog(
            'sent',
            `group-location sent ${event.envelope.id.slice(0, 8)}…`,
          );
          return;
        case 'groupLocationEnvelopeReceived':
          // Persistence + accepted/duplicate/rejected logging is handled by
          // the attached receiver worker (attachGroupLocationReceiver). The
          // manager only surfaces the raw event here.
          return;
        case 'payloadRejected':
          pushLog('rejected', `payload rejected: ${event.reason}`);
          return;
        case 'error':
          setLastError(event.message);
          pushLog('error', event.message);
          return;
      }
    });
    // Phase 4B — RelayRouter shares the same transport. Manager and router
    // are dual subscribers: the manager still handles TestPing frames, and
    // the router handles MessageEnvelope frames (the manager silently ignores
    // envelope-shaped payloads to avoid noisy `payloadRejected` events).
    const router = new RelayRouter({
      transport,
      db,
      localDeviceId,
    });
    router.on(event => {
      switch (event.kind) {
        case 'envelopeSent':
          pushLog(
            'env-sent',
            `envelope ${event.envelope.id.slice(0, 8)}… sent (ttl=${event.envelope.ttl}, dst=${event.envelope.destinationDeviceId?.slice(0, 8) ?? 'broadcast'})`,
          );
          return;
        case 'envelopeReceived':
          pushLog(
            event.wasDuplicate ? 'duplicate' : 'env-received',
            `${event.wasDuplicate ? 'dup ' : ''}env ${event.envelope.id.slice(0, 8)}… hop=${event.envelope.hopCount} forMe=${event.wasForMe}`,
          );
          return;
        case 'envelopeDelivered':
          pushLog(
            'env-delivered',
            `env ${event.envelope.id.slice(0, 8)}… delivered locally`,
          );
          return;
        case 'envelopeFrameWritten':
          pushLog(
            'env-frame-written',
            `env ${event.envelope.id.slice(0, 8)}… frame written → ${event.toAddress} (no ACK)`,
          );
          return;
        case 'envelopeQueued':
          pushLog(
            'env-queued',
            `env ${event.envelope.id.slice(0, 8)}… queued (${event.reason}); depth=${router.queueDepth()}`,
          );
          return;
        case 'envelopeTtlExpired':
          pushLog(
            'env-expired',
            `env ${event.envelope.id.slice(0, 8)}… ttl expired at hop=${event.envelope.hopCount}`,
          );
          return;
        case 'envelopeRejected':
          pushLog('env-rejected', `envelope rejected: ${event.reason}`);
          return;
      }
    });
    router.attach();
    managerRef.current = manager;
    routerRef.current = router;
    setActiveCommunicationManager(manager);
    receiverUnsubRef.current = attachGroupLocationReceiver({
      db,
      manager,
      onOutcome: outcome => {
        switch (outcome.status) {
          case 'accepted':
            pushLog(
              'received',
              `group-location accepted from ${outcome.location.userId.slice(0, 8)}… (${outcome.location.latitude.toFixed(4)}, ${outcome.location.longitude.toFixed(4)})`,
            );
            return;
          case 'duplicate':
            pushLog(
              'duplicate',
              `group-location duplicate ${outcome.location.id.slice(0, 8)}…`,
            );
            return;
          case 'group-not-found':
            pushLog('rejected', 'group-location rejected: group-not-found');
            return;
          case 'not-a-member':
            pushLog('rejected', 'group-location rejected: not-a-member');
            return;
          case 'invalid':
            pushLog(
              'rejected',
              `group-location rejected: ${outcome.reason}`,
            );
            return;
        }
      },
    });
    return manager;
  }, [
    localDeviceId,
    pushLog,
    setConnection,
    setLastError,
    setPeers,
    setTransportState,
  ]);

  const runGuarded = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setLastError(null);
      try {
        await action();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setLastError(message);
        pushLog('error', `${label} failed: ${message}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, pushLog, setLastError],
  );

  const onCopyDeviceId = () => {
    if (!localDeviceId) return;
    // RN's built-in Share opens the OS share sheet which includes "Copy" on
    // Android — avoids adding a clipboard native dep just for a diagnostics
    // affordance (CLAUDE.md §16).
    Share.share({ message: localDeviceId }).catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      pushLog('error', `share device id failed: ${message}`);
    });
  };

  const onEnableDiagnostics = () => {
    if (foundationStatus !== 'ready') return;
    const { db } = bootstrapApp();
    setDiagnosticsEnabled(db, true);
    ensureDiagnosticGroup(db);
    setEnabled(true);
    pushLog('info', 'diagnostics enabled (setting flipped)');
  };

  const onRequestPermission = () => {
    runGuarded('permission request', async () => {
      const result = await ensureNearbyWifiPermission();
      if (result === 'granted') {
        setPermission('granted');
        pushLog('info', 'nearby-devices permission granted');
      } else if (result === 'never_ask_again') {
        setPermission('never_ask_again');
        Alert.alert(
          'Permission blocked',
          'Enable "Nearby devices" for OFFGRID in system settings.',
        );
      } else if (result === 'not-android') {
        setPermission('not-android');
        pushLog('info', 'not an Android platform — no runtime permission needed');
      } else {
        setPermission('denied');
        pushLog('info', 'nearby-devices permission denied');
      }
    });
  };

  const onInitialize = () => {
    runGuarded('initialize', async () => {
      const manager = ensureManager();
      if (!manager) throw new Error('local device id not ready yet');
      await manager.initialize();
    });
  };

  const onStartDiscovery = () => {
    runGuarded('start discovery', async () => {
      const manager = managerRef.current;
      if (!manager) throw new Error('call Initialize first');
      await manager.startDiscovery();
    });
  };

  const onStopDiscovery = () => {
    runGuarded('stop discovery', async () => {
      const manager = managerRef.current;
      if (!manager) return;
      await manager.stopDiscovery();
    });
  };

  const onConnect = (peer: PeerHandle) => {
    runGuarded(`connect ${peer.deviceAddress}`, async () => {
      const manager = managerRef.current;
      if (!manager) throw new Error('call Initialize first');
      await manager.connectToPeer(peer.deviceAddress);
    });
  };

  const onSendPing = () => {
    runGuarded('send test ping', async () => {
      const manager = managerRef.current;
      if (!manager) throw new Error('call Initialize first');
      await manager.sendTestPing(`hello from ${localDeviceId?.slice(0, 8) ?? '?'}`);
    });
  };

  const onSendEnvelope = () => {
    runGuarded('send envelope', async () => {
      const router = routerRef.current;
      if (!router) throw new Error('call Initialize first');
      const trimmed = destinationDeviceIdInput.trim();
      const destination: DeviceId | null =
        trimmed.length === 0 ? null : (trimmed as DeviceId);
      const text =
        envelopeTextInput.trim().length === 0
          ? `relay hop from ${localDeviceId?.slice(0, 8) ?? '?'}`
          : envelopeTextInput.trim();
      await router.sendEnvelope(destination, {
        kind: 'test.ping',
        payload: { textPreview: text },
      });
    });
  };

  const onBroadcastEnvelope = () => {
    runGuarded('broadcast envelope', async () => {
      const router = routerRef.current;
      if (!router) throw new Error('call Initialize first');
      await router.sendEnvelope(null, {
        kind: 'test.ping',
        payload: {
          textPreview:
            envelopeTextInput.trim().length === 0
              ? `broadcast from ${localDeviceId?.slice(0, 8) ?? '?'}`
              : envelopeTextInput.trim(),
        },
      });
    });
  };

  const enableSection = enabled ? null : (
    <View style={styles.card} testID="diagnostics-enable">
      <Text style={styles.cardTitle}>Diagnostics setting</Text>
      <Text style={styles.cardBody}>
        Phase 3 diagnostics are off. Turning this on flips the `
        {SETTING_PHASE3_DIAGNOSTICS_ENABLED}` setting locally so a reserved
        diagnostic group and user are seeded. No network traffic yet.
      </Text>
      <Button label="Enable diagnostics" onPress={onEnableDiagnostics} />
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      testID="diagnostics-screen"
    >
      <Text style={styles.title}>Diagnostics · Phase 3</Text>
      <Text style={styles.subtitle}>
        Wi-Fi Direct A ↔ B — not for consumer chat.
      </Text>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card} testID="diagnostics-local-device-id">
          <Text style={styles.cardTitle}>Local device id</Text>
          <Text
            style={styles.deviceIdValue}
            selectable
            testID="diagnostics-local-device-id-value"
          >
            {localDeviceId ?? '—'}
          </Text>
          <Button
            label="Copy device id"
            onPress={onCopyDeviceId}
            disabled={!localDeviceId}
          />
        </View>

        {enableSection}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>State</Text>
          <StatusRow label="Foundation" value={foundationStatus} />
          <StatusRow label="Transport" value={transportState} />
          <StatusRow label="Permission" value={permission} />
          <StatusRow
            label="Group"
            value={
              connection === null
                ? '—'
                : connection.groupFormed
                  ? `formed (${connection.isGroupOwner ? 'owner' : 'client'}, ${connection.groupOwnerAddress ?? 'no addr'})`
                  : 'none'
            }
          />
          <StatusRow
            label="Local device"
            value={localDeviceId ? `${localDeviceId.slice(0, 8)}…` : '—'}
          />
          {lastError !== null ? (
            <Text style={styles.errorText} testID="diagnostics-error">
              {lastError}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Controls</Text>
          {permission !== 'granted' && permission !== 'not-android' ? (
            <Button
              label="Grant nearby-devices permission"
              onPress={onRequestPermission}
              disabled={busy}
            />
          ) : null}
          <Button
            label="Initialize transport"
            onPress={onInitialize}
            disabled={busy || !enabled || (permission !== 'granted' && permission !== 'not-android')}
          />
          <Button
            label="Start discovery"
            onPress={onStartDiscovery}
            disabled={busy || managerRef.current === null}
          />
          <Button
            label="Stop discovery"
            onPress={onStopDiscovery}
            disabled={busy || managerRef.current === null}
          />
          <Button
            label="Send test ping"
            onPress={onSendPing}
            disabled={
              busy ||
              managerRef.current === null ||
              connection === null ||
              !connection.groupFormed
            }
          />
        </View>

        <View style={styles.card} testID="phase4b-relay">
          <Text style={styles.cardTitle}>Phase 4B · Relay envelope</Text>
          <Text style={styles.cardBody}>
            Sends a `MessageEnvelope` through `RelayRouter` on top of the same
            Wi-Fi Direct transport. Leave the destination blank to broadcast
            (every device relays until TTL=0). Enter Phone C&apos;s device id
            to test A → B → C via sequential handoff (D-069).
          </Text>
          <Text style={styles.rowLabel}>Destination device id (UUIDv7)</Text>
          <TextInput
            value={destinationDeviceIdInput}
            onChangeText={setDestinationDeviceIdInput}
            placeholder="blank = broadcast"
            placeholderTextColor="#5f6368"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.textInput}
            testID="phase4b-destination-input"
          />
          <Text style={styles.rowLabel}>Text preview</Text>
          <TextInput
            value={envelopeTextInput}
            onChangeText={setEnvelopeTextInput}
            placeholder="relay hop test"
            placeholderTextColor="#5f6368"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.textInput}
            testID="phase4b-text-input"
          />
          <Button
            label="Send envelope to destination"
            onPress={onSendEnvelope}
            disabled={
              busy ||
              routerRef.current === null ||
              connection === null ||
              !connection.groupFormed
            }
          />
          <Button
            label="Broadcast envelope"
            onPress={onBroadcastEnvelope}
            disabled={
              busy ||
              routerRef.current === null ||
              connection === null ||
              !connection.groupFormed
            }
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Peers ({peers.length})</Text>
          {peers.length === 0 ? (
            <Text style={styles.cardBody}>No peers visible.</Text>
          ) : (
            peers.map(peer => (
              <View key={peer.id} style={styles.peerRow}>
                <View style={styles.peerInfo}>
                  <Text style={styles.peerName}>
                    {peer.displayName ?? '(unnamed)'}
                  </Text>
                  <Text style={styles.peerAddr}>{peer.deviceAddress}</Text>
                </View>
                <Pressable
                  onPress={() => onConnect(peer)}
                  disabled={busy || managerRef.current === null}
                  style={({ pressed }) => [
                    styles.connectButton,
                    pressed && styles.buttonPressed,
                    (busy || managerRef.current === null) && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.buttonText}>Connect</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Event log</Text>
          {log.length === 0 ? (
            <Text style={styles.cardBody}>No events yet.</Text>
          ) : (
            log.map((entry, idx) => (
              <View key={`${entry.at}-${idx}`} style={styles.logRow}>
                <Text style={[styles.logKind, kindStyle(entry.kind)]}>
                  {entry.kind}
                </Text>
                <Text style={styles.logMessage}>{entry.message}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function kindStyle(kind: DiagnosticsLogKind) {
  switch (kind) {
    case 'error':
    case 'rejected':
    case 'env-rejected':
    case 'env-expired':
      return { color: '#ff6b6b' };
    case 'sent':
    case 'received':
    case 'env-sent':
    case 'env-received':
    case 'env-delivered':
      return { color: '#7cd992' };
    case 'env-frame-written':
      // Deliberately amber, not green: local write only, no ACK.
      return { color: '#f5c542' };
    case 'duplicate':
    case 'env-queued':
      return { color: '#f5c542' };
    default:
      return { color: '#8ab4f8' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0d10',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f5f5f5',
    marginTop: 8,
    marginHorizontal: 20,
  },
  subtitle: {
    fontSize: 12,
    color: '#9aa0a6',
    marginTop: 4,
    marginHorizontal: 20,
  },
  body: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#1c1f24',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#f5f5f5',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardBody: {
    color: '#9aa0a6',
    fontSize: 12,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  rowLabel: {
    color: '#5f6368',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  rowValue: {
    color: '#e8eaed',
    fontSize: 12,
    fontFamily: 'Courier',
  },
  errorText: {
    marginTop: 12,
    color: '#ff6b6b',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#1f6feb',
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  connectButton: {
    backgroundColor: '#1f6feb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonDisabled: {
    backgroundColor: '#3a3f45',
  },
  buttonText: {
    color: '#f5f5f5',
    fontSize: 13,
    fontWeight: '600',
  },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  peerInfo: {
    flexShrink: 1,
  },
  peerName: {
    color: '#e8eaed',
    fontSize: 13,
  },
  peerAddr: {
    color: '#9aa0a6',
    fontSize: 11,
    fontFamily: 'Courier',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    gap: 8,
  },
  logKind: {
    fontSize: 10,
    fontFamily: 'Courier',
    width: 74,
    textTransform: 'uppercase',
  },
  logMessage: {
    color: '#e8eaed',
    fontSize: 12,
    flexShrink: 1,
  },
  deviceIdValue: {
    color: '#e8eaed',
    fontSize: 12,
    fontFamily: 'Courier',
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#3a3f45',
    borderRadius: 6,
    color: '#e8eaed',
    fontSize: 12,
    fontFamily: 'Courier',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#0f1216',
  },
});
