import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radii } from '../theme';
import { Icon, type IconName } from './Icon';

export type IconBadgeTone =
  | 'neutral'
  | 'brand'
  | 'accent'
  | 'safety'
  | 'danger'
  | 'sky';

interface IconBadgeProps {
  readonly name: IconName;
  readonly tone?: IconBadgeTone;
  readonly size?: 'sm' | 'md';
}

// A small tinted chip that hosts an Icon. Used as the leading affordance in
// list rows and tiles. Colour is decorative — screen readers ignore it because
// the accompanying title carries the meaning.
export function IconBadge({
  name,
  tone = 'neutral',
  size = 'md',
}: IconBadgeProps): React.JSX.Element {
  const t = tones[tone];
  const dim = size === 'md' ? 36 : 28;
  const iconSize = size === 'md' ? 18 : 14;
  return (
    <View
      style={[
        styles.base,
        { width: dim, height: dim, backgroundColor: t.bg, borderColor: t.border },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon name={name} color={t.fg} size={iconSize} />
    </View>
  );
}

const tones: Record<IconBadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: {
    bg: colors.surfaceInset,
    fg: colors.textSecondary,
    border: colors.border,
  },
  brand: {
    bg: colors.brandSoft,
    fg: colors.brandStrong,
    border: colors.brandBorder,
  },
  accent: {
    bg: colors.accentSoft,
    fg: colors.accent,
    border: 'transparent',
  },
  safety: {
    bg: colors.imSafeSoft,
    fg: colors.imSafe,
    border: 'transparent',
  },
  danger: {
    bg: colors.sosSoft,
    fg: colors.sos,
    border: 'transparent',
  },
  sky: {
    bg: '#152730',
    fg: colors.statusInternet,
    border: 'transparent',
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  } as ViewStyle,
});
