import {
  decodeEnvelope,
  encodeEnvelope,
  validateEnvelope,
} from '../../src/services/communication/codec';
import {
  MAX_JOIN_INVITE_MEMBERS,
  type GroupJoinInviteBody,
  type GroupJoinRequestBody,
  type MessageEnvelope,
} from '../../src/types/communication';
import type { DeviceId, GroupId, MessageId, UserId } from '../../src/types/ids';
import { newUuidV7 } from '../../src/utils/ids';
import { deriveJoinCode } from '../../src/services/groups';

function sampleRequestBody(
  overrides: Partial<GroupJoinRequestBody['payload']> = {},
): GroupJoinRequestBody {
  const groupId = newUuidV7() as GroupId;
  return {
    kind: 'group.join.request',
    payload: {
      code: deriveJoinCode(groupId),
      joinerUserId: newUuidV7() as UserId,
      joinerDisplayName: 'Bilbo',
      ...overrides,
    },
  };
}

function sampleInviteBody(
  overrides: Partial<GroupJoinInviteBody['payload']> = {},
): GroupJoinInviteBody {
  const groupId = newUuidV7() as GroupId;
  const adminId = newUuidV7() as UserId;
  return {
    kind: 'group.join.invite',
    payload: {
      code: deriveJoinCode(groupId),
      groupId,
      groupName: 'Trek 2026',
      groupCreatedAt: '2026-09-27T10:00:00.000Z',
      joinerUserId: newUuidV7() as UserId,
      members: [
        {
          userId: adminId,
          displayName: 'Aragorn',
          role: 'admin',
          joinedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      ...overrides,
    },
  };
}

function envelopeFor(
  body: GroupJoinRequestBody | GroupJoinInviteBody,
): MessageEnvelope {
  return {
    v: 1,
    kind: 'msg.envelope',
    id: newUuidV7() as MessageId,
    originDeviceId: newUuidV7() as DeviceId,
    destinationDeviceId:
      body.kind === 'group.join.invite' ? (newUuidV7() as DeviceId) : null,
    ttl: 0,
    hopCount: 0,
    sentAt: '2026-09-27T10:00:00.000Z',
    body,
  };
}

describe('group.join.request envelope codec', () => {
  it('round-trips a well-formed request', () => {
    const env = envelopeFor(sampleRequestBody());
    const frame = encodeEnvelope(env);
    const decoded = decodeEnvelope(frame);
    expect(decoded).toEqual(env);
  });

  it('rejects a request with a code of the wrong length', () => {
    const env = envelopeFor(sampleRequestBody({ code: 'ABC' }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a request with a non-UUIDv7 joinerUserId', () => {
    const env = envelopeFor(
      sampleRequestBody({ joinerUserId: 'not-a-uuid' as UserId }),
    );
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects a request with a blank joinerDisplayName', () => {
    const env = envelopeFor(sampleRequestBody({ joinerDisplayName: '   ' }));
    expect(validateEnvelope(env)).toBeNull();
  });
});

describe('group.join.invite envelope codec', () => {
  it('round-trips a well-formed invite', () => {
    const env = envelopeFor(sampleInviteBody());
    const frame = encodeEnvelope(env);
    const decoded = decodeEnvelope(frame);
    expect(decoded).toEqual(env);
  });

  it('rejects an invite with zero members', () => {
    const env = envelopeFor(sampleInviteBody({ members: [] }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects an invite exceeding MAX_JOIN_INVITE_MEMBERS', () => {
    const one = sampleInviteBody();
    const oneMember = one.payload.members[0];
    if (!oneMember) throw new Error('sample invite has no members');
    const bloated = Array.from(
      { length: MAX_JOIN_INVITE_MEMBERS + 1 },
      () => ({
        userId: newUuidV7() as UserId,
        displayName: 'X',
        role: 'member' as const,
        joinedAt: oneMember.joinedAt,
      }),
    );
    const env = envelopeFor(sampleInviteBody({ members: bloated }));
    expect(validateEnvelope(env)).toBeNull();
  });

  it('rejects an invite with an unknown member role', () => {
    const bad = sampleInviteBody();
    const env = envelopeFor({
      ...bad,
      payload: {
        ...bad.payload,
        members: [
          {
            ...(bad.payload.members[0] as GroupJoinInviteBody['payload']['members'][number]),
            role: 'owner' as unknown as 'admin',
          },
        ],
      },
    });
    expect(validateEnvelope(env)).toBeNull();
  });

  it('normalizes the join code (O -> 0) on decode', () => {
    const groupId = newUuidV7() as GroupId;
    const derived = deriveJoinCode(groupId);
    // Force an O -> 0 substitution on the wire to prove the codec normalises.
    const wireCode = derived.replace(/0/g, 'O');
    const body = sampleInviteBody({ code: wireCode, groupId });
    const env = envelopeFor(body);
    const decoded = validateEnvelope(env);
    expect(decoded).not.toBeNull();
    if (decoded && decoded.body.kind === 'group.join.invite') {
      expect(decoded.body.payload.code).toBe(derived);
    }
  });
});
