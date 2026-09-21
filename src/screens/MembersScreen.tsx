import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ListRow } from '../components/ListRow';
import { StatusBadge } from '../components/StatusBadge';
import { ComingSoonNotice } from '../components/ComingSoonNotice';
import { colors, spacing, typography } from '../theme';

export function MembersScreen(): React.JSX.Element {
  return (
    <Screen scrollable testID="members-screen">
      <View style={styles.section}>
        <Card padded={false} style={styles.listCard}>
          <ListRow
            title="You"
            subtitle="This device"
            icon="person"
            iconTone="brand"
            trailing={<StatusBadge tone="neutral" label="You" />}
          />
          <View style={styles.divider} />
          <ListRow
            title="Sample member"
            subtitle="Preview only"
            icon="person"
            iconTone="neutral"
            trailing={<StatusBadge tone="offline" label="Not connected" />}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <ComingSoonNotice
          feature="Live member presence"
          detail="See who is currently reachable, who was last seen and when, and their most recent location."
        />
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={typography.bodyStrong}>What the badges will mean</Text>
          <View style={styles.legend}>
            <LegendItem
              tone="connected"
              label="Nearby"
              text="Reachable right now, near you or through a hop."
            />
            <LegendItem
              tone="stale"
              label="Last seen"
              text="Reachable a moment ago."
            />
            <LegendItem
              tone="offline"
              label="Offline"
              text="No path to this member at all."
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function LegendItem({
  tone,
  label,
  text,
}: {
  tone: 'connected' | 'stale' | 'offline';
  label: string;
  text: string;
}): React.JSX.Element {
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendBadge}>
        <StatusBadge tone={tone} label={label} />
      </View>
      <Text style={[typography.bodySecondary, styles.legendText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  listCard: {
    paddingHorizontal: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 48,
  },
  legend: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  legendBadge: {
    minWidth: 92,
  },
  legendText: {
    flex: 1,
    color: colors.textSecondary,
  },
});
