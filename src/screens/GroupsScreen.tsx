import React, { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { IconBadge } from '../components/IconBadge';
import { ListRow } from '../components/ListRow';
import { StatusBadge } from '../components/StatusBadge';
import { colors, spacing, typography } from '../theme';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { useGroupsStore } from '../store/groupsStore';
import { bootstrapApp } from '../services/appBootstrap';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GroupsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const localUserId = useAppFoundationStore(s => s.localUserId);
  const bootStatus = useAppFoundationStore(s => s.status);
  const groups = useGroupsStore(s => s.groups);
  const loaded = useGroupsStore(s => s.loaded);
  const refresh = useGroupsStore(s => s.refresh);

  const reload = useCallback(() => {
    if (!localUserId) {
      return;
    }
    const { db } = bootstrapApp();
    refresh(db, localUserId);
  }, [localUserId, refresh]);

  useEffect(() => {
    if (bootStatus === 'ready') {
      reload();
    }
  }, [bootStatus, reload]);

  useFocusEffect(
    useCallback(() => {
      if (bootStatus === 'ready') {
        reload();
      }
    }, [bootStatus, reload]),
  );

  const hasGroups = groups.length > 0;

  return (
    <Screen scrollable testID="groups-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Private groups you have joined for your trips.
        </Text>
      </View>

      <View style={styles.actionsRow}>
        <Button
          label="Create group"
          leadingIcon="plus"
          onPress={() => navigation.navigate('CreateGroup')}
          testID="groups-create"
        />
        <Button
          label="Join with code"
          variant="ghost"
          onPress={() => navigation.navigate('JoinGroup')}
          testID="groups-join"
        />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Your groups" />
        {!loaded ? (
          <Card testID="groups-loading">
            <Text style={typography.bodySecondary}>Loading…</Text>
          </Card>
        ) : hasGroups ? (
          <Card padded={false} testID="groups-list">
            {groups.map((summary, index) => (
              <View key={summary.group.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <ListRow
                  title={summary.group.name}
                  subtitle={`${summary.memberCount} ${
                    summary.memberCount === 1 ? 'member' : 'members'
                  }`}
                  icon="users"
                  iconTone="brand"
                  trailing={
                    summary.localRole === 'admin' ? (
                      <StatusBadge tone="connected" label="Admin" />
                    ) : undefined
                  }
                  onPress={() =>
                    navigation.navigate('Group', {
                      groupId: summary.group.id,
                    })
                  }
                  testID={`groups-item-${summary.group.id}`}
                />
              </View>
            ))}
          </Card>
        ) : (
          <Card testID="groups-empty">
            <View style={styles.emptyHeader}>
              <IconBadge name="users" tone="brand" />
              <View style={styles.emptyTextBlock}>
                <Text style={typography.bodyStrong}>No groups yet</Text>
                <Text style={typography.bodySecondary}>
                  Create a private group for your trip, or join with a code
                  from a friend.
                </Text>
              </View>
            </View>
          </Card>
        )}
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
    ...typography.displayLarge,
  },
  sub: {
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  emptyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  emptyTextBlock: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 48,
  },
});
