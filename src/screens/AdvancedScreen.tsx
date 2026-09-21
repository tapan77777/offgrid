import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Advanced is the consumer-facing surface for developer / diagnostic tools.
// Diagnostics stays reachable per the checkpoint (physical relay debugging
// parked) — via Settings → Advanced — and is deliberately kept out of the
// primary bottom-tab navigation (D-040, 06-UX-FLOWS §27).
export function AdvancedScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  return (
    <Screen scrollable testID="advanced-screen">
      <View style={styles.section}>
        <SectionHeader title="Connection" />
        <Card padded={false} style={styles.listCard}>
          <ListRow
            title="Connection diagnostics"
            subtitle="Inspect peers, transport state, and event log"
            icon="satellite"
            iconTone="brand"
            onPress={() => navigation.navigate('Diagnostics')}
            accessibilityHint="Opens the connection diagnostics screen"
            testID="advanced-diagnostics-row"
          />
        </Card>
        <Text style={[typography.caption, styles.footnote]}>
          Diagnostics are for testing local connectivity. They expose raw
          transport state and are not part of the normal app experience.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  listCard: {
    paddingHorizontal: spacing.md,
  },
  footnote: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xxs,
    color: colors.textFaint,
  },
});
