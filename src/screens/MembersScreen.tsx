import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ListRow } from '../components/ListRow';
import { StatusBadge } from '../components/StatusBadge';
import { SectionHeader } from '../components/SectionHeader';
import { ComingSoonNotice } from '../components/ComingSoonNotice';
import { colors, spacing, typography } from '../theme';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { useGroupsStore } from '../store/groupsStore';
import { bootstrapApp } from '../services/appBootstrap';
import {
  GROUP_MEMBER_LIMIT,
  GroupsError,
  getGroupDetail,
  removeMember,
  type GroupDetail,
} from '../services/groups';
import type { RootStackParamList } from '../navigation/RootStack';
import type { GroupId, UserId } from '../types/ids';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MembersRoute = NativeStackScreenProps<
  RootStackParamList,
  'Members'
>['route'];

export function MembersScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<MembersRoute>();
  const localUserId = useAppFoundationStore(s => s.localUserId);
  const refreshGroups = useGroupsStore(s => s.refresh);
  const groupId = route.params?.groupId as GroupId | undefined;

  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!groupId || !localUserId) {
      setLoading(false);
      setLoadError('Missing group.');
      return;
    }
    try {
      const { db } = bootstrapApp();
      setDetail(getGroupDetail(db, groupId, localUserId));
      setLoadError(null);
    } catch (err) {
      const msg = err instanceof GroupsError ? err.message : String(err);
      setLoadError(msg);
      setDetail(null);
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
      navigation.setOptions({ title: `${detail.group.name} · Members` });
    }
  }, [detail, navigation]);

  const performRemove = useCallback(
    (id: GroupId, targetUserId: UserId) => {
      if (!localUserId) {
        return;
      }
      setBusyId(targetUserId);
      try {
        const { db } = bootstrapApp();
        removeMember(db, {
          groupId: id,
          actorUserId: localUserId,
          targetUserId,
        });
        refreshGroups(db, localUserId);
        load();
      } catch (err) {
        const msg = err instanceof GroupsError ? err.message : String(err);
        Alert.alert('Could not remove', msg);
      } finally {
        setBusyId(null);
      }
    },
    [load, localUserId, refreshGroups],
  );

  const handleRemove = useCallback(
    (targetUserId: UserId, targetLabel: string) => {
      if (!detail || !localUserId) {
        return;
      }
      Alert.alert(
        'Remove member?',
        `${targetLabel} will no longer see this group on their device.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => performRemove(detail.group.id, targetUserId),
          },
        ],
      );
    },
    [detail, localUserId, performRemove],
  );

  if (loading) {
    return (
      <Screen scrollable testID="members-screen">
        <Card>
          <Text style={typography.bodySecondary}>Loading members…</Text>
        </Card>
      </Screen>
    );
  }

  if (loadError !== null || !detail) {
    return (
      <Screen scrollable testID="members-screen">
        <Card testID="members-error">
          <Text style={typography.bodyStrong}>Members unavailable</Text>
          <Text style={[typography.bodySecondary, styles.spaced]}>
            {loadError ?? 'The group could not be loaded.'}
          </Text>
        </Card>
      </Screen>
    );
  }

  const isAdmin = detail.localMembership?.role === 'admin';

  return (
    <Screen scrollable testID="members-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{detail.group.name}</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          {detail.members.length} of {GROUP_MEMBER_LIMIT} members
        </Text>
      </View>

      <View style={styles.section}>
        <Card padded={false} style={styles.listCard} testID="members-list">
          {detail.members.map((member, index) => {
            const isSelf = member.userId === localUserId;
            const label = isSelf ? 'You' : shortId(member.userId);
            const canRemove = isAdmin && !isSelf && busyId !== member.userId;
            return (
              <View key={member.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <ListRow
                  title={label}
                  subtitle={member.role === 'admin' ? 'Admin' : 'Member'}
                  icon="person"
                  iconTone={isSelf ? 'brand' : 'neutral'}
                  trailing={
                    isSelf ? (
                      <StatusBadge tone="neutral" label="You" />
                    ) : canRemove ? (
                      <Button
                        label="Remove"
                        variant="ghost"
                        size="sm"
                        onPress={() => handleRemove(member.userId, label)}
                        testID={`members-remove-${member.userId}`}
                      />
                    ) : undefined
                  }
                />
              </View>
            );
          })}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="What the badges will mean" />
        <ComingSoonNotice
          feature="Live member presence"
          detail="Once transport is wired into the consumer app, this screen will show who is currently reachable and when each member was last seen."
        />
      </View>
    </Screen>
  );
}

function shortId(id: string): string {
  return `Member ${id.slice(0, 6)}`;
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
  section: {
    marginBottom: spacing.xl,
  },
  listCard: {
    paddingHorizontal: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 48,
  },
});
