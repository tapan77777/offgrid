import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography, MIN_TAP_TARGET } from '../theme';
import { IconBadge, type IconBadgeTone } from './IconBadge';
import { Icon, type IconName } from './Icon';

interface ListRowProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: IconName;
  readonly iconTone?: IconBadgeTone;
  readonly trailing?: React.ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
  readonly accessibilityHint?: string;
}

export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'neutral',
  trailing,
  onPress,
  testID,
  accessibilityHint,
}: ListRowProps): React.JSX.Element {
  const isNavigable = onPress !== undefined;
  const content = (
    <>
      {icon !== undefined ? (
        <View style={styles.leading}>
          <IconBadge name={icon} tone={iconTone} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={typography.body}>{title}</Text>
        {subtitle !== undefined ? (
          <Text style={typography.caption}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing !== undefined ? (
        <View style={styles.trailing}>{trailing}</View>
      ) : null}
      {isNavigable && trailing === undefined ? (
        <View style={styles.chevron}>
          <Icon name="chevronRight" color={colors.textFaint} size={14} />
        </View>
      ) : null}
    </>
  );

  if (isNavigable) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={accessibilityHint}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={styles.row} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TAP_TARGET,
    paddingVertical: spacing.xs,
  },
  leading: {
    marginRight: spacing.sm,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  trailing: {
    marginLeft: spacing.sm,
  },
  chevron: {
    marginLeft: spacing.sm,
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.65,
  },
});
