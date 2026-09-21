import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { SafetyActionButton } from '../components/SafetyActionButton';
import { ListRow } from '../components/ListRow';
import { StatusBadge } from '../components/StatusBadge';
import { IconBadge } from '../components/IconBadge';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// GroupScreen is a layout preview per 06-UX-FLOWS §10. No real group data
// exists in Phase 4 — every value shown is a static placeholder marked with
// clear "preview" language so it cannot be mistaken for live state.
export function GroupScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  return (
    <Screen scrollable testID="group-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Sample group</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Layout preview — not connected to real group data.
        </Text>
      </View>

      <View style={styles.section}>
        <Card>
          <ConnectionStatus state="noConnection" />
        </Card>
      </View>

      <View style={styles.section}>
        <View style={styles.tileRow}>
          <Card
            style={styles.tile}
            onPress={() => navigation.navigate('Map')}
            accessibilityLabel="Open map"
          >
            <IconBadge name="map" tone="brand" />
            <View style={styles.tileText}>
              <Text style={typography.bodyStrong}>Map</Text>
              <Text style={typography.caption}>Preview</Text>
            </View>
          </Card>
          <Card
            style={styles.tile}
            onPress={() => navigation.navigate('Chat')}
            accessibilityLabel="Open chat"
          >
            <IconBadge name="chat" tone="brand" />
            <View style={styles.tileText}>
              <Text style={typography.bodyStrong}>Chat</Text>
              <Text style={typography.caption}>Preview</Text>
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
              onPress={() => navigation.navigate('Members')}
              accessibilityRole="link"
            >
              See all
            </Text>
          }
        />
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
        <SectionHeader title="Safety" />
        <View style={styles.safetyStack}>
          <SafetyActionButton kind="imSafe" disabled />
          <SafetyActionButton kind="sos" disabled />
        </View>
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
    ...typography.displayMedium,
  },
  sub: {
    color: colors.textSecondary,
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
});
