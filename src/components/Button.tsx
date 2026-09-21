import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing, typography, MIN_TAP_TARGET } from '../theme';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

interface ButtonProps {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly leadingIcon?: IconName;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  leadingIcon,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps): React.JSX.Element {
  const containerStyle: ViewStyle[] = [
    styles.base,
    variantStyles[variant],
    size === 'sm' ? styles.sizeSm : styles.sizeMd,
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
  ].filter((v): v is ViewStyle => Boolean(v));

  const iconColor = labelColor[variant].color;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.inner}>
        {leadingIcon !== undefined ? (
          <Icon name={leadingIcon} color={iconColor} size={16} />
        ) : null}
        <Text style={[typography.buttonLabel, { color: iconColor }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sizeMd: {
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sizeSm: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.sos,
    borderColor: colors.sos,
  },
};

const labelColor: Record<ButtonVariant, { color: string }> = {
  primary: { color: colors.textPrimary },
  secondary: { color: colors.textPrimary },
  ghost: { color: colors.textSecondary },
  danger: { color: colors.textPrimary },
};
