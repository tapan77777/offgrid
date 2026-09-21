import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ComingSoonNotice } from '../components/ComingSoonNotice';
import { colors, spacing, typography } from '../theme';

export function MapScreen(): React.JSX.Element {
  return (
    <Screen scrollable testID="map-screen">
      <View style={styles.section}>
        <ComingSoonNotice
          feature="Offline maps"
          detail="Download areas before you leave signal. Your position stays visible even when internet is gone."
        />
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={typography.bodyStrong}>Location, honestly</Text>
          <Text style={[typography.bodySecondary, styles.body]}>
            OFFGRID will show a clear difference between your current position
            and a last-known location, and will never share your location
            silently.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  body: {
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
