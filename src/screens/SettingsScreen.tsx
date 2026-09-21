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

export function SettingsScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  return (
    <Screen scrollable testID="settings-screen">
      <View style={styles.section}>
        <SectionHeader title="Preferences" />
        <Card padded={false} style={styles.listCard}>
          <ListRow title="Notifications" subtitle="Coming later" icon="bell" />
          <View style={styles.divider} />
          <ListRow
            title="Location sharing"
            subtitle="Coming with the location milestone"
            icon="pin"
          />
          <View style={styles.divider} />
          <ListRow
            title="Appearance"
            subtitle="Dark theme"
            icon="ring"
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Data" />
        <Card padded={false} style={styles.listCard}>
          <ListRow
            title="Local storage"
            subtitle="Your messages and groups live on this device"
            icon="device"
          />
          <View style={styles.divider} />
          <ListRow
            title="Cloud sync"
            subtitle="Optional — activates when you sign in"
            icon="cloud"
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Advanced" />
        <Card padded={false} style={styles.listCard}>
          <ListRow
            title="Advanced"
            subtitle="Connection diagnostics and developer tools"
            icon="gear"
            iconTone="neutral"
            onPress={() => navigation.navigate('Advanced')}
            accessibilityHint="Opens the advanced settings screen"
            testID="settings-advanced-row"
          />
        </Card>
        <Text style={[typography.caption, styles.footnote]}>
          These options are intended for troubleshooting and testing. Most
          people never need to open them.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  footnote: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xxs,
    color: colors.textFaint,
  },
});
