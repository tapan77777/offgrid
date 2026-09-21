import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { withPrefix } from '../utils/ids';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const localDeviceId = useAppFoundationStore(s => s.localDeviceId);

  return (
    <Screen scrollable testID="profile-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Your identity on this device.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="This device" />
        <Card padded={false} style={styles.listCard}>
          <ListRow
            title="Device"
            subtitle={
              localDeviceId
                ? withPrefix('dev', localDeviceId).slice(0, 20) + '…'
                : 'Preparing…'
            }
            icon="device"
            iconTone="brand"
          />
          <View style={styles.divider} />
          <ListRow
            title="Account"
            subtitle="Not required — OFFGRID works offline"
            icon="lock"
            iconTone="neutral"
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Preferences" />
        <Card padded={false} style={styles.listCard}>
          <ListRow
            title="Settings"
            subtitle="App preferences and advanced options"
            icon="gear"
            iconTone="neutral"
            onPress={() => navigation.navigate('Settings')}
            accessibilityHint="Opens the settings screen"
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="About OFFGRID" />
        <Card>
          <Text style={typography.bodyStrong}>Offline-first by design</Text>
          <Text style={[typography.bodySecondary, styles.about]}>
            OFFGRID keeps your group connected when the network disappears.
            Core features work without internet; syncing happens when it's
            back.
          </Text>
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
  listCard: {
    paddingHorizontal: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 48,
  },
  about: {
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
