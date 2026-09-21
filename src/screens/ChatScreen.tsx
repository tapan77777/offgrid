import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ComingSoonNotice } from '../components/ComingSoonNotice';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { colors, spacing, typography } from '../theme';

export function ChatScreen(): React.JSX.Element {
  return (
    <Screen scrollable testID="chat-screen">
      <View style={styles.section}>
        <Card>
          <ConnectionStatus state="noConnection" />
        </Card>
      </View>

      <View style={styles.section}>
        <ComingSoonNotice
          feature="Group chat"
          detail="Offline-first messaging with delivery states, duplicate protection, and cloud sync when you're back online. Ships after the messaging engine milestone."
        />
      </View>

      <View style={styles.section}>
        <Card>
          <Text style={typography.bodyStrong}>What to expect</Text>
          <View style={styles.bulletList}>
            <Bullet text="Every message is saved on your phone first." />
            <Bullet text="Messages send when a nearby group member is reachable." />
            <Bullet text="Delivery states are honest — “sent” means sent, not hoped." />
          </View>
        </Card>
      </View>
    </Screen>
  );
}

function Bullet({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={[typography.bodySecondary, styles.bulletText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  bulletList: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brandStrong,
    marginTop: 9,
  },
  bulletText: {
    flex: 1,
    color: colors.textSecondary,
  },
});
