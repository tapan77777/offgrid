import React, { useCallback } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button } from '../Button';
import { colors, radii, spacing, typography } from '../../theme';
import { MAX_MSG_TEXT_UTF8_BYTES } from '../../types/communication';
import { utf8Encode } from '../../services/communication/codec';

// Chat V1 composer. Controlled input + Send button.
//   - Send is disabled when the trimmed input is empty or the UTF-8 byte
//     count exceeds the wire cap. Byte count is what matters — a message
//     that fits in JS character length but overflows UTF-8 must be blocked
//     here before it reaches the codec.
//   - Errors are surfaced by the parent (the sender service throws
//     ChatSendValidationError with a stable reason). The composer only
//     enforces the two invariants a user can fix inline.

interface MessageComposerProps {
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly onSend: () => void;
  readonly disabled?: boolean;
}

export function MessageComposer({
  value,
  onChangeText,
  onSend,
  disabled = false,
}: MessageComposerProps): React.JSX.Element {
  const trimmed = value.trim();
  const byteLen = utf8Encode(value).byteLength;
  const overCap = byteLen > MAX_MSG_TEXT_UTF8_BYTES;
  const canSend = !disabled && trimmed.length > 0 && !overCap;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend();
  }, [canSend, onSend]);

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Write a message"
        placeholderTextColor={colors.textMuted}
        multiline
        editable={!disabled}
        testID="chat-composer-input"
        accessibilityLabel="Message text"
      />
      <View style={styles.send}>
        <Button
          label="Send"
          onPress={handleSend}
          disabled={!canSend}
          testID="chat-composer-send"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    backgroundColor: colors.surfaceInset,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  send: {
    paddingBottom: spacing.xxs,
  },
});
