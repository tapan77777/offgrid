import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { colors, radii, spacing, typography } from '../theme';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { useGroupsStore } from '../store/groupsStore';
import { bootstrapApp } from '../services/appBootstrap';
import {
  GroupsError,
  JOIN_CODE_LENGTH,
  normalizeJoinCode,
  requestJoinByCode,
} from '../services/groups';
import { UserRepo } from '../database/repositories';
import { getActiveCommunicationManager } from '../services/communication/commsRuntime';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function JoinGroupScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [rawCode, setRawCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const localUserId = useAppFoundationStore(s => s.localUserId);
  const refreshGroups = useGroupsStore(s => s.refresh);

  const normalized = useMemo(() => normalizeJoinCode(rawCode), [rawCode]);
  const codeValid = normalized.length === JOIN_CODE_LENGTH;

  const handleJoin = useCallback(async () => {
    if (!localUserId || !codeValid || busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const { db } = bootstrapApp();
      const localUser = UserRepo.findUserById(db, localUserId);
      const displayName = localUser?.displayName ?? 'OFFGRID user';
      const manager = getActiveCommunicationManager();
      const { group } = await requestJoinByCode({
        db,
        manager,
        code: normalized,
        joinerUserId: localUserId,
        joinerDisplayName: displayName,
      });
      refreshGroups(db, localUserId);
      navigation.replace('Group', { groupId: group.id });
    } catch (err) {
      const msg =
        err instanceof GroupsError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      setErrorMessage(msg);
      setBusy(false);
    }
  }, [busy, codeValid, localUserId, navigation, normalized, refreshGroups]);

  return (
    <Screen scrollable testID="join-group-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Join a group</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Ask an admin for the {JOIN_CODE_LENGTH}-character code shown on the
          group's screen.
        </Text>
      </View>

      <Card testID="join-group-scan-card">
        <Text style={typography.bodyStrong}>Scan a QR code</Text>
        <Text style={[typography.caption, styles.hint]}>
          Point your camera at the admin's QR to fill in the join code.
        </Text>
        <View style={styles.scanActions}>
          <Button
            label="Scan QR code"
            onPress={() => navigation.navigate('ScanJoinQr')}
            disabled={busy}
            testID="join-group-scan"
          />
        </View>
      </Card>

      <View style={styles.section}>
        <Card>
          <Text style={typography.bodyStrong}>Enter code</Text>
          <Text style={[typography.caption, styles.hint]}>
            Letters and numbers, {JOIN_CODE_LENGTH} characters total.
          </Text>
          <TextInput
            style={styles.input}
            value={rawCode}
            onChangeText={setRawCode}
            placeholder="ABCD2345"
            placeholderTextColor={colors.textMuted}
            maxLength={JOIN_CODE_LENGTH * 2}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            testID="join-group-code-input"
            accessibilityLabel="Join code"
          />
          {errorMessage !== null ? (
            <Text style={styles.error} testID="join-group-error">
              {errorMessage}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => navigation.goBack()}
              disabled={busy}
              testID="join-group-cancel"
            />
            <Button
              label={busy ? 'Looking for nearby group…' : 'Join'}
              onPress={handleJoin}
              disabled={!codeValid || busy || !localUserId}
              testID="join-group-submit"
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
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
  hint: {
    marginTop: spacing.xxs,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceInset,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 18,
    letterSpacing: 4,
    fontFamily: 'Courier',
    marginBottom: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  scanActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  section: {
    marginTop: spacing.lg,
  },
});
