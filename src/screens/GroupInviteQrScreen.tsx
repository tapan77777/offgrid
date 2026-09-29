import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { colors, radii, spacing, typography } from '../theme';
import { bootstrapApp } from '../services/appBootstrap';
import {
  GroupsError,
  JOIN_CODE_LENGTH,
  encodeInvitePayload,
  getGroupDetail,
  type GroupDetail,
} from '../services/groups';
import { useAppFoundationStore } from '../store/appFoundationStore';
import type { RootStackParamList } from '../navigation/RootStack';
import type { GroupId } from '../types/ids';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type GroupInviteQrRoute = NativeStackScreenProps<
  RootStackParamList,
  'GroupInviteQr'
>['route'];

// Renders a QR containing the SAME join info that the invitation card already
// shows on the group screen — nothing more. Payload shape is defined in
// `qrInvite.ts`. On dark backgrounds, QR needs a white quiet zone for reliable
// scanning, so the code itself is drawn on a white tile.

const QR_SIZE = 240;

export function GroupInviteQrScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<GroupInviteQrRoute>();
  const localUserId = useAppFoundationStore(s => s.localUserId);
  const groupId = route.params?.groupId as GroupId | undefined;

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !localUserId) {
      setLoadError('Missing group.');
      return;
    }
    try {
      const { db } = bootstrapApp();
      setDetail(getGroupDetail(db, groupId, localUserId));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof GroupsError ? err.message : String(err));
    }
  }, [groupId, localUserId]);

  useEffect(() => {
    if (detail) {
      navigation.setOptions({ title: 'Invite' });
    }
  }, [detail, navigation]);

  const payload = useMemo(() => {
    if (!detail) return null;
    try {
      return encodeInvitePayload({
        groupId: detail.group.id,
        groupName: detail.group.name,
        joinCode: detail.joinCode,
      });
    } catch {
      return null;
    }
  }, [detail]);

  const shareInvite = useCallback(async () => {
    if (!detail || !payload) return;
    try {
      await Share.share({
        message:
          `Join "${detail.group.name}" on OFFGRID.\n` +
          `Join code: ${detail.joinCode}\n` +
          `QR link: ${payload}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not share', msg);
    }
  }, [detail, payload]);

  if (loadError !== null || !detail) {
    return (
      <Screen scrollable testID="group-invite-qr-screen">
        <Card testID="group-invite-qr-error">
          <Text style={typography.bodyStrong}>Invite unavailable</Text>
          <Text style={[typography.bodySecondary, styles.spaced]}>
            {loadError ?? 'The group could not be loaded.'}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Back"
              variant="ghost"
              onPress={() => navigation.goBack()}
              testID="group-invite-qr-back"
            />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scrollable testID="group-invite-qr-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{detail.group.name}</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Show this QR to someone standing next to you. It contains only the
          join code and group name — no location, no keys, no device details.
        </Text>
      </View>

      <Card testID="group-invite-qr-card">
        <View style={styles.qrTile}>
          {payload ? (
            <QRCode
              value={payload}
              size={QR_SIZE}
              backgroundColor="#FFFFFF"
              color="#000000"
              testID="group-invite-qr-code"
            />
          ) : (
            <Text style={typography.bodySecondary}>
              Could not build QR from this join code.
            </Text>
          )}
        </View>
        <Text style={typography.bodyStrong}>Join code</Text>
        <Text style={[typography.caption, styles.spaced]}>
          Anyone with this code can join — share it in person.
          {' '}
          {JOIN_CODE_LENGTH}-character code.
        </Text>
        <View style={styles.codeBox}>
          <Text
            style={styles.codeText}
            testID="group-invite-qr-code-text"
            selectable
          >
            {detail.joinCode}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button
            label="Share invite"
            onPress={shareInvite}
            disabled={!payload}
            testID="group-invite-qr-share"
          />
        </View>
      </Card>
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
  spaced: {
    marginTop: spacing.xxs,
  },
  qrTile: {
    alignSelf: 'center',
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    marginBottom: spacing.lg,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.md,
  },
});
