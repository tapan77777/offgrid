import {
  decodeEnvelope,
  encodeEnvelope,
  validateEnvelope,
} from '../../src/services/communication/codec';
import {
  MAX_MSG_TEXT_UTF8_BYTES,
  type MessageEnvelope,
  type MsgTextBody,
} from '../../src/types/communication';
import type {
  DeviceId,
  GroupId,
  MessageId,
  UserId,
} from '../../src/types/ids';
import { newUuidV7 } from '../../src/utils/ids';

function sampleBody(overrides: Partial<MsgTextBody['payload']> = {}): MsgTextBody {
  return {
    kind: 'msg.text',
    payload: {
      groupId: newUuidV7() as GroupId,
      senderUserId: newUuidV7() as UserId,
      messageId: newUuidV7() as MessageId,
      text: 'hello world',
      createdAt: '2026-09-22T12:00:00.000Z',
      ...overrides,
    },
  };
}

function envelopeFor(body: MsgTextBody): MessageEnvelope {
  return {
    v: 1,
    kind: 'msg.envelope',
    id: body.payload.messageId,
    originDeviceId: newUuidV7() as DeviceId,
    destinationDeviceId: null,
    ttl: 0,
    hopCount: 0,
    sentAt: '2026-09-22T12:00:00.000Z',
    body,
  };
}

describe('msg.text envelope codec', () => {
  it('round-trips a well-formed envelope', () => {
    const env = envelopeFor(sampleBody());
    const frame = encodeEnvelope(env);
    const decoded = decodeEnvelope(frame);
    expect(decoded).toEqual(env);
  });

  it('rejects empty (whitespace-only) text', () => {
    const env = envelopeFor(sampleBody({ text: '   \n\t  ' }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('accepts UTF-8 text at exactly the cap', () => {
    const asciiOnly = 'a'.repeat(MAX_MSG_TEXT_UTF8_BYTES);
    const env = envelopeFor(sampleBody({ text: asciiOnly }));
    expect(validateEnvelope(env)).not.toBeNull();
  });

  it('rejects text one byte over the cap', () => {
    const asciiOnly = 'a'.repeat(MAX_MSG_TEXT_UTF8_BYTES + 1);
    const env = envelopeFor(sampleBody({ text: asciiOnly }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('measures the cap in UTF-8 bytes, not JS chars', () => {
    // Emoji outside BMP -> 4 bytes each. Total bytes = 4 * count.
    const emoji = '😀';
    const count = Math.floor(MAX_MSG_TEXT_UTF8_BYTES / 4) + 1; // one over the cap in bytes
    const overflow = emoji.repeat(count);
    const env = envelopeFor(sampleBody({ text: overflow }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a non-UUIDv7 groupId', () => {
    const env = envelopeFor(sampleBody({ groupId: 'not-a-uuid' as GroupId }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a non-UUIDv7 senderUserId', () => {
    const env = envelopeFor(
      sampleBody({ senderUserId: 'not-a-uuid' as UserId }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a non-UUIDv7 messageId', () => {
    const env = envelopeFor(sampleBody({ messageId: 'not-a-uuid' as MessageId }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a non-ISO createdAt', () => {
    const env = envelopeFor(sampleBody({ createdAt: 'yesterday' }));
    expect(validateEnvelope(env)).toBeNull();
  });
});
