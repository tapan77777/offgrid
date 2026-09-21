import React, { useCallback, useState } from 'react';
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
  createGroup,
  GROUP_NAME_MAX_LENGTH,
  GROUP_NAME_MIN_LENGTH,
  GroupsError,
} from '../services/groups';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CreateGroupScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const localUserId = useAppFoundationStore(s => s.localUserId);
  const refreshGroups = useGroupsStore(s => s.refresh);

  const trimmed = name.trim();
  const nameValid =
    trimmed.length >= GROUP_NAME_MIN_LENGTH &&
    trimmed.length <= GROUP_NAME_MAX_LENGTH;

  const handleCreate = useCallback(() => {
    if (!localUserId || !nameValid || busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const { db } = bootstrapApp();
      const { group } = createGroup(db, {
        name: trimmed,
        creatorUserId: localUserId,
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
  }, [busy, localUserId, nameValid, navigation, refreshGroups, trimmed]);

  return (
    <Screen scrollable testID="create-group-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Create a group</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Groups are private. Only people you invite with the code can join.
        </Text>
      </View>

      <Card>
        <Text style={typography.bodyStrong}>Group name</Text>
        <Text style={[typography.caption, styles.hint]}>
          Something your group will recognise — e.g. "Khambeswari Hike".
        </Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          placeholderTextColor={colors.textMuted}
          maxLength={GROUP_NAME_MAX_LENGTH}
          editable={!busy}
          autoFocus
          testID="create-group-name-input"
          accessibilityLabel="Group name"
        />
        {errorMessage !== null ? (
          <Text style={styles.error} testID="create-group-error">
            {errorMessage}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => navigation.goBack()}
            disabled={busy}
            testID="create-group-cancel"
          />
          <Button
            label={busy ? 'Creating…' : 'Create group'}
            onPress={handleCreate}
            disabled={!nameValid || busy || !localUserId}
            leadingIcon="plus"
            testID="create-group-submit"
          />
        </View>
      </Card>

      <View style={styles.footer}>
        <Text style={[typography.caption, styles.footerText]}>
          Groups are stored on this device. Sharing a group with others happens
          in person, using the join code shown on the group screen.
        </Text>
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
    fontSize: 15,
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
  footer: {
    marginTop: spacing.lg,
  },
  footerText: {
    color: colors.textMuted,
  },
});
