import {
  decodeEnvelope,
  encodeEnvelope,
  validateEnvelope,
} from '../../src/services/communication/codec';
import type {
  GroupLocationBody,
  MessageEnvelope,
} from '../../src/types/communication';
import type {
  DeviceId,
  GroupId,
  LocationId,
  MessageId,
  UserId,
} from '../../src/types/ids';
import { newUuidV7 } from '../../src/utils/ids';

function sampleBody(
  overrides: Partial<GroupLocationBody['payload']> = {},
): GroupLocationBody {
  return {
    kind: 'group.location',
    payload: {
      groupId: newUuidV7() as GroupId,
      senderUserId: newUuidV7() as UserId,
      locationId: newUuidV7() as LocationId,
      latitude: 46.5,
      longitude: 6.6,
      accuracy: 5,
      altitude: 300,
      heading: 90,
      speed: 1.2,
      capturedAt: '2026-05-01T12:00:00.000Z',
      ...overrides,
    },
  };
}

function sampleEnvelope(
  body: GroupLocationBody = sampleBody(),
  overrides: Partial<MessageEnvelope> = {},
): MessageEnvelope {
  return {
    v: 1,
    kind: 'msg.envelope',
    id: body.payload.locationId as unknown as MessageId,
    originDeviceId: newUuidV7() as DeviceId,
    destinationDeviceId: null,
    ttl: 0,
    hopCount: 0,
    sentAt: '2026-05-01T12:00:00.000Z',
    body,
    ...overrides,
  };
}

describe('group.location envelope codec', () => {
  it('round-trips a well-formed envelope through encode/decode', () => {
    const envelope = sampleEnvelope();
    const frame = encodeEnvelope(envelope);
    const decoded = decodeEnvelope(frame);
    expect(decoded).toEqual(envelope);
  });

  it('rejects latitude out of range', () => {
    const bad = sampleEnvelope(sampleBody({ latitude: 91 }));
    expect(validateEnvelope(JSON.parse(JSON.stringify(bad)))).toBeNull();
  });

  it('rejects longitude out of range', () => {
    const bad = sampleEnvelope(sampleBody({ longitude: 180.5 }));
    expect(validateEnvelope(JSON.parse(JSON.stringify(bad)))).toBeNull();
  });

  it('rejects non-finite coordinates (NaN)', () => {
    const bad = JSON.parse(JSON.stringify(sampleEnvelope()));
    bad.body.payload.latitude = 'not-a-number';
    expect(validateEnvelope(bad)).toBeNull();
  });

  it('rejects non-uuidv7 ids in the payload', () => {
    const bad = JSON.parse(JSON.stringify(sampleEnvelope()));
    bad.body.payload.groupId = 'not-a-uuid';
    expect(validateEnvelope(bad)).toBeNull();
    const bad2 = JSON.parse(JSON.stringify(sampleEnvelope()));
    bad2.body.payload.senderUserId = 'not-a-uuid';
    expect(validateEnvelope(bad2)).toBeNull();
    const bad3 = JSON.parse(JSON.stringify(sampleEnvelope()));
    bad3.body.payload.locationId = 'not-a-uuid';
    expect(validateEnvelope(bad3)).toBeNull();
  });

  it('rejects invalid ISO timestamps for capturedAt', () => {
    const bad = JSON.parse(JSON.stringify(sampleEnvelope()));
    bad.body.payload.capturedAt = 'yesterday';
    expect(validateEnvelope(bad)).toBeNull();
  });

  it('accepts nullable kinematics but rejects negative accuracy/speed', () => {
    const ok = sampleEnvelope(
      sampleBody({ accuracy: null, altitude: null, heading: null, speed: null }),
    );
    expect(validateEnvelope(JSON.parse(JSON.stringify(ok)))).not.toBeNull();
    const bad = sampleEnvelope(sampleBody({ accuracy: -1 }));
    expect(validateEnvelope(JSON.parse(JSON.stringify(bad)))).toBeNull();
    const bad2 = sampleEnvelope(sampleBody({ speed: -1 }));
    expect(validateEnvelope(JSON.parse(JSON.stringify(bad2)))).toBeNull();
    const bad3 = sampleEnvelope(sampleBody({ heading: 500 }));
    expect(validateEnvelope(JSON.parse(JSON.stringify(bad3)))).toBeNull();
  });

  it('does not confuse test.ping and group.location bodies', () => {
    const envelope = sampleEnvelope();
    const frame = encodeEnvelope(envelope);
    const decoded = decodeEnvelope(frame);
    expect(decoded?.body.kind).toBe('group.location');
  });
});
