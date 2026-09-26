import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme';

// Chat V1 (D-074). Only three honest states are permitted for chat: LOCAL
// (grey), SENT (green), FAILED (red). We deliberately do NOT render
// DELIVERED — there is no ACK layer in V1 so we could not honestly claim
// delivery (CLAUDE.md §14).

export type MessageStatusDotState = 'LOCAL' | 'SENT' | 'FAILED';

interface MessageStatusDotProps {
  readonly state: MessageStatusDotState;
  readonly testID?: string;
}

export function MessageStatusDot({
  state,
  testID,
}: MessageStatusDotProps): React.JSX.Element {
  const style = STYLE[state];
  return (
    <View
      style={[styles.dot, { backgroundColor: style.color }]}
      testID={testID}
      accessibilityLabel={style.label}
    />
  );
}

const STYLE: Record<MessageStatusDotState, { color: string; label: string }> = {
  LOCAL: { color: colors.textMuted, label: 'Saved locally, not yet sent' },
  SENT: { color: colors.brandStrong, label: 'Sent' },
  FAILED: { color: colors.error, label: 'Failed to send' },
};

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
