import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface ScreenProps {
  readonly children: React.ReactNode;
  readonly scrollable?: boolean;
  readonly padded?: boolean;
  readonly testID?: string;
  readonly style?: ViewStyle;
  readonly contentContainerStyle?: ViewStyle;
}

export function Screen({
  children,
  scrollable = false,
  padded = true,
  testID,
  style,
  contentContainerStyle,
}: ScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const paddingStyle: ViewStyle = {
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
  };
  const innerPad: ViewStyle | undefined = padded
    ? { padding: spacing.lg }
    : undefined;

  if (scrollable) {
    const scrollProps: ScrollViewProps = {
      contentContainerStyle: [innerPad, contentContainerStyle],
      showsVerticalScrollIndicator: false,
    };
    return (
      <ScrollView
        testID={testID}
        style={[styles.root, paddingStyle, style]}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    );
  }

  const viewProps: ViewProps = { testID };
  return (
    <View style={[styles.root, paddingStyle, innerPad, style]} {...viewProps}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
