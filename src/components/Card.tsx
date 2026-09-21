import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing } from '../theme';

interface CardProps {
  readonly children: React.ReactNode;
  readonly onPress?: () => void;
  readonly style?: ViewStyle;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
  readonly variant?: 'default' | 'raised' | 'inset';
  readonly padded?: boolean;
}

export function Card({
  children,
  onPress,
  style,
  testID,
  accessibilityLabel,
  variant = 'default',
  padded = true,
}: CardProps): React.JSX.Element {
  const cardStyle = [
    styles.card,
    padded && styles.padded,
    variant === 'raised' && styles.raised,
    variant === 'inset' && styles.inset,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={cardStyle} testID={testID} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  padded: {
    padding: spacing.md,
  },
  raised: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
  },
  inset: {
    backgroundColor: colors.surfaceInset,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.75,
  },
});
