import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';
import { Icon, type IconName } from './Icon';

export type SafetyKind = 'imSafe' | 'sos';

interface SafetyActionButtonProps {
  readonly kind: SafetyKind;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

// Distinct, high-visibility safety buttons per D-041 and 06-UX-FLOWS §§20–22.
// SOS is styled danger + shows a "Hold to activate" hint per §21 — the actual
// hold-timer behaviour is deferred to Phase 8; today the button is a
// non-functional placeholder that MUST NOT imply that anything was sent.
export function SafetyActionButton({
  kind,
  onPress,
  disabled = false,
  testID,
}: SafetyActionButtonProps): React.JSX.Element {
  const config = kind === 'imSafe' ? imSafeConfig : sosConfig;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: config.bg, borderColor: config.border },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={config.a11yLabel}
      accessibilityHint={config.a11yHint}
      accessibilityState={{ disabled }}
    >
      <View style={styles.inner}>
        <View style={[styles.iconWrap, { backgroundColor: config.iconBg }]}>
          <Icon name={config.icon} color={config.iconFg} size={22} />
        </View>
        <View style={styles.textBlock}>
          <Text style={[typography.title, styles.label]}>{config.label}</Text>
          <Text style={[typography.caption, styles.hint]}>{config.hint}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const imSafeConfig = {
  icon: 'shieldCheck' as IconName,
  iconFg: colors.imSafe,
  iconBg: colors.imSafeSoft,
  label: "I'm Safe",
  hint: 'Send check-in when safety features are ready',
  bg: colors.imSafeSoft,
  border: '#20493A',
  a11yLabel: "I'm Safe check-in",
  a11yHint: 'Feature not yet available',
} as const;

const sosConfig = {
  icon: 'alert' as IconName,
  iconFg: colors.sos,
  iconBg: '#2A1414',
  label: 'SOS',
  hint: 'Hold to activate — not yet available',
  bg: colors.sosSoft,
  border: '#5A2724',
  a11yLabel: 'Emergency SOS',
  a11yHint: 'Feature not yet available',
} as const;

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    minHeight: 76,
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.textPrimary,
  },
  hint: {
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
});
