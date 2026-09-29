import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  type Code,
} from 'react-native-vision-camera';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { colors, radii, spacing, typography } from '../theme';
import { bootstrapApp } from '../services/appBootstrap';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { useGroupsStore } from '../store/groupsStore';
import { getActiveCommunicationManager } from '../services/communication/commsRuntime';
import { UserRepo } from '../database/repositories';
import {
  GroupsError,
  decodeInvitePayload,
  requestJoinByCode,
  type QrInvitePayload,
} from '../services/groups';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Scan-then-confirm flow (D-077).
//
// Scanning DOES NOT auto-join. When the camera reads a QR, we validate the
// payload, then present a modal asking the user to confirm the group they are
// about to join. Only after the user taps [Join Group] do we call the
// existing `requestJoinByCode` service. Invalid payloads produce an inline
// error with rescan / manual-entry options — the user is never silently
// redirected.

type ScanState =
  | { kind: 'permission-requesting' }
  | { kind: 'permission-denied' }
  | { kind: 'no-device' }
  | { kind: 'scanning' }
  | { kind: 'confirming'; payload: QrInvitePayload }
  | { kind: 'joining'; payload: QrInvitePayload }
  | { kind: 'invalid'; message: string };

export function ScanJoinQrScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const localUserId = useAppFoundationStore(s => s.localUserId);
  const refreshGroups = useGroupsStore(s => s.refresh);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [state, setState] = useState<ScanState>({ kind: 'permission-requesting' });
  const consumingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function ensurePermission(): Promise<void> {
      if (hasPermission) {
        if (!cancelled) {
          setState(device ? { kind: 'scanning' } : { kind: 'no-device' });
        }
        return;
      }
      const granted = await requestPermission();
      if (cancelled) return;
      if (!granted) {
        setState({ kind: 'permission-denied' });
        return;
      }
      setState(device ? { kind: 'scanning' } : { kind: 'no-device' });
    }
    ensurePermission();
    return () => {
      cancelled = true;
    };
  }, [device, hasPermission, requestPermission]);

  const handleCodes = useCallback((codes: Code[]) => {
    if (consumingRef.current) return;
    const value = codes.find(c => typeof c.value === 'string' && c.value.length > 0)?.value;
    if (!value) return;
    consumingRef.current = true;
    try {
      const payload = decodeInvitePayload(value);
      setState({ kind: 'confirming', payload });
    } catch (err) {
      const message =
        err instanceof GroupsError ? err.message : 'Invalid group invite.';
      setState({ kind: 'invalid', message });
    }
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: handleCodes,
  });

  const resumeScanning = useCallback(() => {
    consumingRef.current = false;
    setState(prev => {
      if (prev.kind === 'permission-denied' || prev.kind === 'no-device') {
        return prev;
      }
      return { kind: 'scanning' };
    });
  }, []);

  const confirmJoin = useCallback(async () => {
    if (state.kind !== 'confirming' || !localUserId) return;
    const payload = state.payload;
    setState({ kind: 'joining', payload });
    try {
      const { db } = bootstrapApp();
      const localUser = UserRepo.findUserById(db, localUserId);
      const displayName = localUser?.displayName ?? 'OFFGRID user';
      const manager = getActiveCommunicationManager();
      const { group } = await requestJoinByCode({
        db,
        manager,
        code: payload.code,
        joinerUserId: localUserId,
        joinerDisplayName: displayName,
      });
      refreshGroups(db, localUserId);
      navigation.replace('Group', { groupId: group.id });
    } catch (err) {
      const message =
        err instanceof GroupsError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      setState({ kind: 'invalid', message });
    }
  }, [localUserId, navigation, refreshGroups, state]);

  const openManualEntry = useCallback(() => {
    navigation.replace('JoinGroup');
  }, [navigation]);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:').catch(() => undefined);
    } else {
      Linking.openSettings().catch(() => undefined);
    }
  }, []);

  const isScanningActive =
    state.kind === 'scanning' ||
    state.kind === 'confirming' ||
    state.kind === 'joining';

  if (state.kind === 'permission-requesting') {
    return (
      <Screen scrollable testID="scan-join-qr-screen">
        <Card testID="scan-join-qr-permission-requesting">
          <Text style={typography.bodyStrong}>Requesting camera access…</Text>
        </Card>
      </Screen>
    );
  }

  if (state.kind === 'permission-denied') {
    return (
      <Screen scrollable testID="scan-join-qr-screen">
        <Card testID="scan-join-qr-permission-denied">
          <Text style={typography.bodyStrong}>Camera access is needed</Text>
          <Text style={[typography.bodySecondary, styles.spaced]}>
            OFFGRID needs camera access to read the group invite QR code.
            Enable it in Settings, or enter the join code manually.
          </Text>
          <View style={styles.actions}>
            <Button
              label="Enter code instead"
              variant="ghost"
              onPress={openManualEntry}
              testID="scan-join-qr-manual"
            />
            <Button
              label="Open Settings"
              onPress={openSettings}
              testID="scan-join-qr-open-settings"
            />
          </View>
        </Card>
      </Screen>
    );
  }

  if (state.kind === 'no-device' || !device) {
    return (
      <Screen scrollable testID="scan-join-qr-screen">
        <Card testID="scan-join-qr-no-device">
          <Text style={typography.bodyStrong}>No camera found</Text>
          <Text style={[typography.bodySecondary, styles.spaced]}>
            This device has no available camera. Enter the join code manually.
          </Text>
          <View style={styles.actions}>
            <Button
              label="Enter code instead"
              onPress={openManualEntry}
              testID="scan-join-qr-manual"
            />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <View style={styles.root} testID="scan-join-qr-screen">
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isScanningActive}
        codeScanner={codeScanner}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.reticleContainer} pointerEvents="none">
          <View style={styles.reticle} />
        </View>
        <View style={styles.hintBar} pointerEvents="none">
          <Text style={styles.hintText}>
            Point at an OFFGRID group invite QR
          </Text>
        </View>
        <View style={styles.bottomBar}>
          <Button
            label="Enter code instead"
            variant="ghost"
            onPress={openManualEntry}
            testID="scan-join-qr-manual"
          />
        </View>
      </View>

      <Modal
        visible={state.kind === 'invalid'}
        transparent
        animationType="fade"
        onRequestClose={resumeScanning}
      >
        <View style={styles.modalBackdrop}>
          <Card testID="scan-join-qr-invalid">
            <Text style={typography.bodyStrong}>Invalid group invite</Text>
            <Text style={[typography.bodySecondary, styles.spaced]}>
              {state.kind === 'invalid' ? state.message : ''}
            </Text>
            <View style={styles.actions}>
              <Button
                label="Enter code instead"
                variant="ghost"
                onPress={openManualEntry}
                testID="scan-join-qr-invalid-manual"
              />
              <Button
                label="Try again"
                onPress={resumeScanning}
                testID="scan-join-qr-invalid-retry"
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        visible={state.kind === 'confirming' || state.kind === 'joining'}
        transparent
        animationType="fade"
        onRequestClose={
          state.kind === 'joining' ? undefined : resumeScanning
        }
      >
        <View style={styles.modalBackdrop}>
          <Card testID="scan-join-qr-confirm">
            <Text style={typography.bodyStrong}>Join this group?</Text>
            {state.kind === 'confirming' || state.kind === 'joining' ? (
              <>
                <Text style={[typography.bodySecondary, styles.spaced]}>
                  {state.payload.name.length > 0
                    ? `Group: ${state.payload.name}`
                    : 'The invite did not include a group name.'}
                </Text>
                <View style={styles.codeBox}>
                  <Text
                    style={styles.codeText}
                    testID="scan-join-qr-confirm-code"
                    selectable
                  >
                    {state.payload.code}
                  </Text>
                </View>
                <Text style={[typography.caption, styles.spaced]}>
                  Scanning does not join automatically. Confirm to send a join
                  request using this code.
                </Text>
              </>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={resumeScanning}
                disabled={state.kind === 'joining'}
                testID="scan-join-qr-confirm-cancel"
              />
              <Button
                label={state.kind === 'joining' ? 'Joining…' : 'Join group'}
                onPress={confirmJoin}
                disabled={state.kind === 'joining' || !localUserId}
                testID="scan-join-qr-confirm-join"
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  reticleContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reticle: {
    width: 260,
    height: 260,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: '#FFFFFFCC',
  },
  hintBar: {
    marginTop: spacing.xl * 2,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#000000AA',
    alignItems: 'center',
  },
  hintText: {
    ...typography.body,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  bottomBar: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: '#000000AA',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: '#000000CC',
    justifyContent: 'center',
  },
  spaced: {
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.md,
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
});
