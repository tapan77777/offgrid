import {
  decodeEnvelope,
  encodeEnvelope,
  validateEnvelope,
} from '../../src/services/communication/codec';
import {
  MAX_CHAT_REQUEST_DISPLAY_NAME_LENGTH,
  type ChatRequestAcceptBody,
  type ChatRequestBody,
  type ChatRequestDeclineBody,
  type MessageEnvelope,
} from '../../src/types/communication';
import type { DeviceId, MessageId, UserId } from '../../src/types/ids';
import { newUuidV7 } from '../../src/utils/ids';

// D-076 codec tests. The chat-request handshake carries the requester's
// identity in the payload itself (privacy-first: no separate presence
// broadcast). toUserId is nullable because Wi-Fi Direct discovery only
// exposes device addresses, so the requester frequently does not yet know
// the recipient's OFFGRID userId when they tap "message this nearby device".

function sampleRequestBody(
  overrides: Partial<ChatRequestBody['payload']> = {},
): ChatRequestBody {
  return {
    kind: 'chat.request',
    payload: {
      requestId: newUuidV7() as MessageId,
      fromUserId: newUuidV7() as UserId,
      fromDisplayName: 'Alice',
      toUserId: newUuidV7() as UserId,
      ...overrides,
    },
  };
}

function sampleAcceptBody(
  overrides: Partial<ChatRequestAcceptBody['payload']> = {},
): ChatRequestAcceptBody {
  return {
    kind: 'chat.request.accept',
    payload: {
      requestId: newUuidV7() as MessageId,
      accepterUserId: newUuidV7() as UserId,
      accepterDisplayName: 'Bob',
      requesterUserId: newUuidV7() as UserId,
      ...overrides,
    },
  };
}

function sampleDeclineBody(
  overrides: Partial<ChatRequestDeclineBody['payload']> = {},
): ChatRequestDeclineBody {
  return {
    kind: 'chat.request.decline',
    payload: {
      requestId: newUuidV7() as MessageId,
      declinerUserId: newUuidV7() as UserId,
      requesterUserId: newUuidV7() as UserId,
      ...overrides,
    },
  };
}

function envelopeFor(
  body:
    | ChatRequestBody
    | ChatRequestAcceptBody
    | ChatRequestDeclineBody,
  destinationDeviceId: DeviceId | null = null,
): MessageEnvelope {
  return {
    v: 1,
    kind: 'msg.envelope',
    id: newUuidV7() as MessageId,
    originDeviceId: newUuidV7() as DeviceId,
    destinationDeviceId,
    ttl: 0,
    hopCount: 0,
    sentAt: '2026-09-27T10:00:00.000Z',
    body,
  };
}

describe('chat.request envelope codec', () => {
  it('round-trips a well-formed request with a concrete recipient', () => {
    const env = envelopeFor(sampleRequestBody());
    const frame = encodeEnvelope(env);
    const decoded = decodeEnvelope(frame);
    expect(decoded).toEqual(env);
  });

  it('accepts and round-trips a request with toUserId = null', () => {
    const env = envelopeFor(sampleRequestBody({ toUserId: null }));
    const frame = encodeEnvelope(env);
    const decoded = decodeEnvelope(frame);
    expect(decoded).not.toBeNull();
    if (decoded && decoded.body.kind === 'chat.request') {
      expect(decoded.body.payload.toUserId).toBeNull();
    }
  });

  it('rejects a request with a non-UUIDv7 requestId', () => {
    const env = envelopeFor(
      sampleRequestBody({ requestId: 'not-a-uuid' as MessageId }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a request with a non-UUIDv7 fromUserId', () => {
    const env = envelopeFor(
      sampleRequestBody({ fromUserId: 'not-a-uuid' as UserId }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a request whose toUserId is a non-null non-UUIDv7 value', () => {
    const env = envelopeFor(
      sampleRequestBody({ toUserId: 'not-a-uuid' as unknown as UserId }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a self-addressed request (fromUserId === toUserId)', () => {
    const uid = newUuidV7() as UserId;
    const env = envelopeFor(
      sampleRequestBody({ fromUserId: uid, toUserId: uid }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a request with a blank display name', () => {
    const env = envelopeFor(sampleRequestBody({ fromDisplayName: '   ' }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a request whose display name exceeds the cap', () => {
    const tooLong = 'x'.repeat(MAX_CHAT_REQUEST_DISPLAY_NAME_LENGTH + 1);
    const env = envelopeFor(sampleRequestBody({ fromDisplayName: tooLong }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('trims surrounding whitespace on display name', () => {
    const env = envelopeFor(
      sampleRequestBody({ fromDisplayName: '  Alice  ' }),
    );
    const decoded = validateEnvelope(env);
    expect(decoded).not.toBeNull();
    if (decoded && decoded.body.kind === 'chat.request') {
      expect(decoded.body.payload.fromDisplayName).toBe('Alice');
    }
  });
});

describe('chat.request.accept envelope codec', () => {
  it('round-trips a well-formed accept', () => {
    const env = envelopeFor(sampleAcceptBody(), newUuidV7() as DeviceId);
    const frame = encodeEnvelope(env);
    const decoded = decodeEnvelope(frame);
    expect(decoded).toEqual(env);
  });

  it('rejects an accept where accepter equals requester', () => {
    const uid = newUuidV7() as UserId;
    const env = envelopeFor(
      sampleAcceptBody({ accepterUserId: uid, requesterUserId: uid }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects an accept with a blank display name', () => {
    const env = envelopeFor(sampleAcceptBody({ accepterDisplayName: '   ' }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects an accept with a non-UUIDv7 accepterUserId', () => {
    const env = envelopeFor(
      sampleAcceptBody({ accepterUserId: 'nope' as UserId }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects an accept with a non-UUIDv7 requesterUserId', () => {
    const env = envelopeFor(
      sampleAcceptBody({ requesterUserId: 'nope' as UserId }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects an accept whose display name exceeds the cap', () => {
    const tooLong = 'x'.repeat(MAX_CHAT_REQUEST_DISPLAY_NAME_LENGTH + 1);
    const env = envelopeFor(sampleAcceptBody({ accepterDisplayName: tooLong }));
    expect(validateEnvelope(env)).toBeNull();
  });
});

describe('chat.request.decline envelope codec', () => {
  it('round-trips a well-formed decline', () => {
    const env = envelopeFor(sampleDeclineBody(), newUuidV7() as DeviceId);
    const frame = encodeEnvelope(env);
    const decoded = decodeEnvelope(frame);
    expect(decoded).toEqual(env);
  });

  it('rejects a decline where decliner equals requester', () => {
    const uid = newUuidV7() as UserId;
    const env = envelopeFor(
      sampleDeclineBody({ declinerUserId: uid, requesterUserId: uid }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a decline with a non-UUIDv7 declinerUserId', () => {
    const env = envelopeFor(
      sampleDeclineBody({ declinerUserId: 'nope' as UserId }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });
});
