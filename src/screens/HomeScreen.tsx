import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { SafetyActionButton } from '../components/SafetyActionButton';
import { ComingSoonNotice } from '../components/ComingSoonNotice';
import { Icon } from '../components/Icon';
import { IconBadge } from '../components/IconBadge';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { useConnectivityStore } from '../store/connectivityStore';
import { colors, radii, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/RootStack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const status = useAppFoundationStore(s => s.status);
  const error = useAppFoundationStore(s => s.error);
  const connectivityLabel = useConnectivityStore(s => s.label);
  const nearbyCount = useConnectivityStore(s => s.nearbyCount);
  const lastSeenMinutes = useConnectivityStore(s => s.lastSeenMinutes);

  const bootReady = status === 'ready';

  return (
    <Screen scrollable testID="home-screen">
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.markWrap}>
            <Icon name="radio" color={colors.brandStrong} size={16} />
          </View>
          <Text style={styles.brand}>OFFGRID</Text>
        </View>
        <Text style={styles.greeting}>Welcome back</Text>
        <Text style={[typography.bodySecondary, styles.subhead]}>
          Stay connected when the network disappears.
        </Text>
      </View>

      <View style={styles.section}>
        {/* D-078: driven by the app-owned ConnectivityController via the
         * connectivity store. Never optimistic — `localConnected` only shows
         * after the manager observes a confirmed session. */}
        <Card>
          <ConnectionStatus
            state={connectivityLabel}
            nearbyCount={nearbyCount}
            lastSeenMinutes={lastSeenMinutes}
            testID="home-connection-status"
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Nearby" />
        <Card testID="home-nearby-cta">
          <View style={styles.emptyHeader}>
            <IconBadge name="radio" tone="brand" />
            <View style={styles.emptyTextBlock}>
              <Text style={typography.bodyStrong}>
                Chat with someone nearby
              </Text>
              <Text style={typography.bodySecondary}>
                Find other OFFGRID users around you and start a private
                1-to-1 chat — no Internet needed.
              </Text>
            </View>
          </View>
          <View style={styles.buttonRow}>
            <Button
              label="Find nearby people"
              onPress={() => navigation.navigate('Nearby')}
              leadingIcon="radio"
              testID="home-nearby-open"
            />
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Your groups" />
        <Card testID="home-groups-empty">
          <View style={styles.emptyHeader}>
            <IconBadge name="users" tone="brand" />
            <View style={styles.emptyTextBlock}>
              <Text style={typography.bodyStrong}>No groups yet</Text>
              <Text style={typography.bodySecondary}>
                Create a private group for your trip, or join with a code from
                a friend.
              </Text>
            </View>
          </View>
          <View style={styles.buttonRow}>
            <Button
              label="Create group"
              variant="secondary"
              onPress={() => navigation.navigate('CreateGroup')}
              leadingIcon="plus"
              testID="home-create-group"
            />
            <Button
              label="Join with code"
              variant="ghost"
              onPress={() => navigation.navigate('JoinGroup')}
              testID="home-join-group"
            />
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Safety" />
        <View style={styles.safetyStack}>
          <SafetyActionButton
            kind="imSafe"
            disabled
            testID="home-im-safe"
          />
          <SafetyActionButton kind="sos" disabled testID="home-sos" />
          <Text style={[typography.caption, styles.safetyNote]}>
            Safety actions activate once a group is joined and a connection is
            available.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Trip essentials" />
        <View style={styles.tileGrid}>
          <ComingSoonNotice
            feature="Offline maps"
            detail="Download areas before you leave signal. Your position stays visible even without internet."
          />
          <ComingSoonNotice
            feature="Group chat"
            detail="Message your group even without internet. Delivery states are honest — sent means sent."
          />
          <ComingSoonNotice
            feature="Live members"
            detail="See who is nearby, who was last seen, and where they were."
          />
        </View>
      </View>

      {!bootReady ? (
        <View style={styles.section}>
          <Card testID="home-boot-status">
            <Text style={typography.bodyStrong}>Preparing your device…</Text>
            <Text style={[typography.bodySecondary, styles.tight]}>
              {error ?? 'Setting up local storage and identity.'}
            </Text>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  markWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    ...typography.overline,
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
  },
  greeting: {
    ...typography.displayLarge,
  },
  subhead: {
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
  tight: {
    marginTop: spacing.xxs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  safetyStack: {
    gap: spacing.sm,
  },
  safetyNote: {
    color: colors.textMuted,
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.xxs,
  },
  tileGrid: {
    gap: spacing.sm,
  },
});
