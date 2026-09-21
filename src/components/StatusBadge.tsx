import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

export type StatusTone =
  | 'connected'
  | 'connecting'
  | 'stale'
  | 'offline'
  | 'internet'
  | 'neutral';

interface StatusBadgeProps {
  readonly tone: StatusTone;
  readonly label: string;
  readonly testID?: string;
}

// A compact pill used for connection / delivery state. Non-color-only: the
// label carries the meaning for accessibility (§33) — the dot is a
// reinforcement, not the whole signal.
export function StatusBadge({
  tone,
  label,
  testID,
}: StatusBadgeProps): React.JSX.Element {
  const t = toneStyle(tone);
  return (
    <View
      style={[styles.container, { backgroundColor: t.bg, borderColor: t.border }]}
      testID={testID}
      accessibilityLabel={`${label} status`}
    >
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[typography.caption, styles.label, { color: t.text }]}>
        {label}
      </Text>
    </View>
  );
}

function toneStyle(tone: StatusTone): {
  bg: string;
  border: string;
  dot: string;
  text: string;
} {
  switch (tone) {
    case 'connected':
      return {
        bg: colors.brandSoft,
        border: colors.brandBorder,
        dot: colors.statusConnected,
        text: colors.brandBright,
      };
    case 'connecting':
      return {
        bg: '#2B240F',
        border: '#4A3B1D',
        dot: colors.statusConnecting,
        text: colors.statusConnecting,
      };
    case 'stale':
      return {
        bg: '#2B240F',
        border: '#4A3B1D',
        dot: colors.statusStale,
        text: colors.statusStale,
      };
    case 'offline':
      return {
        bg: colors.surfaceInset,
        border: colors.border,
        dot: colors.statusOffline,
        text: colors.textMuted,
      };
    case 'internet':
      return {
        bg: '#152730',
        border: '#26414F',
        dot: colors.statusInternet,
        text: colors.statusInternet,
      };
    case 'neutral':
      return {
        bg: colors.surfaceInset,
        border: colors.border,
        dot: colors.textFaint,
        text: colors.textSecondary,
      };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  } as ViewStyle,
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
