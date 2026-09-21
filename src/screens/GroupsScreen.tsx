import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { IconBadge } from '../components/IconBadge';
import { Icon } from '../components/Icon';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GroupsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  return (
    <Screen scrollable testID="groups-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Private groups you have joined for your trips.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Your groups" />
        <Card testID="groups-empty">
          <View style={styles.emptyHeader}>
            <IconBadge name="users" tone="brand" />
            <View style={styles.emptyTextBlock}>
              <Text style={typography.bodyStrong}>No groups yet</Text>
              <Text style={typography.bodySecondary}>
                Group creation and joining will be available in a later
                release.
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Button
              label="Create group"
              variant="secondary"
              disabled
              leadingIcon="plus"
              testID="groups-create"
              accessibilityHint="Coming in a later release"
            />
            <Button
              label="Join with code"
              variant="ghost"
              disabled
              testID="groups-join"
              accessibilityHint="Coming in a later release"
            />
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Preview" />
        <Card
          testID="groups-preview-open"
          onPress={() => navigation.navigate('Group')}
          accessibilityLabel="Preview the group dashboard layout"
        >
          <View style={styles.previewRow}>
            <IconBadge name="trail" tone="accent" />
            <View style={styles.previewText}>
              <Text style={typography.bodyStrong}>Sample group dashboard</Text>
              <Text style={typography.bodySecondary}>
                Preview how a group screen will look — no real group data is
                shown.
              </Text>
            </View>
            <Icon name="chevronRight" color={colors.textMuted} size={14} />
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  title: {
    ...typography.displayLarge,
  },
  sub: {
    color: colors.textSecondary,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewText: {
    flex: 1,
    gap: 2,
  },
});
