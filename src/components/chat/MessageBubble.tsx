import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import {
  MessageStatusDot,
  type MessageStatusDotState,
} from './MessageStatusDot';

// Chat V1 (D-074). Three visual tones:
//   - `self`: right-aligned, brand-accented bubble. Shows a status dot.
//   - `other`: left-aligned, surface bubble. No status dot (we do not track
//     the sender's delivery state).
//   - `system`: centered, faint. No status dot.

export type MessageBubbleTone = 'self' | 'other' | 'system';

interface MessageBubbleProps {
  readonly tone: MessageBubbleTone;
  readonly text: string;
  readonly timestamp: string;
  readonly status?: MessageStatusDotState;
  readonly testID?: string;
}

export function MessageBubble({
  tone,
  text,
  timestamp,
  status,
  testID,
}: MessageBubbleProps): React.JSX.Element {
  if (tone === 'system') {
    return (
      <View style={styles.systemRow} testID={testID}>
        <Text style={[typography.caption, styles.systemText]}>{text}</Text>
      </View>
    );
  }
  const isSelf = tone === 'self';
  const rowStyle = [styles.row, isSelf ? styles.rowSelf : styles.rowOther];
  const bubbleStyle = [
    styles.bubble,
    isSelf ? styles.bubbleSelf : styles.bubbleOther,
  ];
  const textStyle = [
    typography.body,
    isSelf ? styles.textSelf : styles.textOther,
  ];
  return (
    <View style={rowStyle} testID={testID}>
      <View style={bubbleStyle}>
        <Text style={textStyle}>{text}</Text>
        <View style={styles.footer}>
          <Text style={[typography.caption, styles.timestamp]}>
            {formatTimestamp(timestamp)}
          </Text>
          {isSelf && status ? (
            <MessageStatusDot
              state={status}
              {...(testID ? { testID: `${testID}-status` } : {})}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function formatTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '';
  const d = new Date(parsed);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: spacing.xs,
  },
  rowSelf: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xxs,
  },
  bubbleSelf: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandBorder,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  textSelf: {
    color: colors.textPrimary,
  },
  textOther: {
    color: colors.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  timestamp: {
    color: colors.textMuted,
  },
  systemRow: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  systemText: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
