import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../theme';

interface SectionHeaderProps {
  readonly title: string;
  readonly trailing?: React.ReactNode;
}

export function SectionHeader({
  title,
  trailing,
}: SectionHeaderProps): React.JSX.Element {
  return (
    <View style={styles.row} accessibilityRole="header">
      <Text style={typography.sectionHeader}>{title}</Text>
      {trailing !== undefined ? (
        <View style={styles.trailing}>{trailing}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  trailing: {
    marginLeft: spacing.sm,
  },
});
