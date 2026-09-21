import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

interface ComingSoonNoticeProps {
  readonly feature: string;
  readonly detail?: string;
  readonly testID?: string;
}

// Honest placeholder for a feature that isn't wired up yet. The point is to
// clearly say "not available" instead of pretending it works — see D-029,
// D-034, CLAUDE.md §20.
export function ComingSoonNotice({
  feature,
  detail,
  testID,
}: ComingSoonNoticeProps): React.JSX.Element {
  return (
    <View style={styles.container} testID={testID} accessibilityRole="text">
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>COMING SOON</Text>
        </View>
      </View>
      <Text style={[typography.title, styles.feature]}>{feature}</Text>
      {detail !== undefined ? (
        <Text style={[typography.bodySecondary, styles.detail]}>{detail}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: spacing.xxs,
  },
  badge: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.xs,
  },
  badgeText: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
    color: colors.accent,
  },
  feature: {
    color: colors.textPrimary,
    fontSize: 17,
  },
  detail: {
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
