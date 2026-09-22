import { createInMemoryDb } from '../../support/testDb';
import {
  DeviceRepo,
  GroupMemberRepo,
  GroupRepo,
  LocationRepo,
  UserRepo,
} from '../../../src/database/repositories';
import { enableGroupLocationSharing } from '../../../src/services/location';
import {
  receiveGroupLocationEnvelope,
  sendGroupLocation,
} from '../../../src/services/location/groupLocationTransport';
import type {
  GroupLocationBody,
  MessageEnvelope,
} from '../../../src/types/communication';
import type {
  DeviceId,
  GroupId,
  GroupMemberId,
  LocationId,
  MessageId,
  UserId,
} from '../../../src/types/ids';
import { newUuidV7 } from '../../../src/utils/ids';

// Milestone B tests exercise the transport-agnostic sender/receiver
// services with an in-memory paired-DB rig. Each "device" gets its own
// SQLite DB so the receive path can only trust the local view of
// membership (D-023).

jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'android', Version: 34 },
  PermissionsAndroid: {
    PERMISSIONS: {},
    RESULTS: {},
    check: jest.fn(),
    request: jest.fn(),
  },
}));

const { NativeModules } = require('react-native') as {
  NativeModules: Record<string, unknown>;
};

const NOW_ISO = '2026-05-01T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

interface Rig {
  dbA: ReturnType<typeof createInMemoryDb>;
  dbB: ReturnType<typeof createInMemoryDb>;
  userA: UserId;
  userB: UserId;
  outsider: UserId;
  groupId: GroupId;
  deviceA: DeviceId;
  deviceB: DeviceId;
  close(): void;
}

function seedDb(
  db: ReturnType<typeof createInMemoryDb>,
  members: Array<{ userId: UserId; groupId: GroupId; displayName: string }>,
  groupNamesById: Map<GroupId, string>,
): void {
  for (const [groupId, name] of groupNamesById) {
    if (!GroupRepo.findGroupById(db, groupId)) {
      GroupRepo.insertGroup(db, {
        id: groupId,
        name,
        createdBy: null,
        nowIso: NOW_ISO,
      });
    }
  }
  const usersSeeded = new Set<UserId>();
  for (const m of members) {
    if (!usersSeeded.has(m.userId)) {
      UserRepo.insertUser(db, {
        id: m.userId,
        displayName: m.displayName,
        nowIso: NOW_ISO,
      });
      usersSeeded.add(m.userId);
    }
    GroupMemberRepo.insertGroupMember(db, {
      id: newUuidV7() as GroupMemberId,
      groupId: m.groupId,
      userId: m.userId,
      role: 'member',
      nowIso: NOW_ISO,
    });
  }
}

function buildRig(options?: { includeOutsiderInBGroup?: boolean }): Rig {
  const dbA = createInMemoryDb();
  const dbB = createInMemoryDb();
  const userA = newUuidV7() as UserId;
  const userB = newUuidV7() as UserId;
  const outsider = newUuidV7() as UserId;
  const groupId = newUuidV7() as GroupId;
  const deviceA = newUuidV7() as DeviceId;
  const deviceB = newUuidV7() as DeviceId;
  const groupNames = new Map<GroupId, string>([[groupId, 'Alps']]);
  seedDb(
    dbA,
    [
      { userId: userA, groupId, displayName: 'A' },
      { userId: userB, groupId, displayName: 'B' },
    ],
    groupNames,
  );
  // Sender needs its own device row so LocationRepo.insertLocation with
  // device_id → devices(id) satisfies the FK.
  DeviceRepo.insertDevice(dbA, {
    id: deviceA,
    userId: userA,
    platform: 'android',
    nowIso: NOW_ISO,
  });
  seedDb(
    dbB,
    options?.includeOutsiderInBGroup
      ? [
          { userId: userA, groupId, displayName: 'A' },
          { userId: userB, groupId, displayName: 'B' },
          { userId: outsider, groupId, displayName: 'Outsider' },
        ]
      : [
          { userId: userA, groupId, displayName: 'A' },
          { userId: userB, groupId, displayName: 'B' },
        ],
    groupNames,
  );
  // Receiver seeds its OWN device row (deviceB) so that if anything on the
  // receive path ever writes a row keyed on deviceB the FK is satisfied.
  DeviceRepo.insertDevice(dbB, {
    id: deviceB,
    userId: userB,
    platform: 'android',
    nowIso: NOW_ISO,
  });
  return {
    dbA,
    dbB,
    userA,
    userB,
    outsider,
    groupId,
    deviceA,
    deviceB,
    close: () => {
      dbA.close();
      dbB.close();
    },
  };
}

function mockNativeFix(fix: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestampMs?: number;
}): void {
  NativeModules.OffgridLocation = {
    checkPermission: jest.fn(async () => ({ fine: true, coarse: true })),
    isLocationEnabled: jest.fn(async () => true),
    getCurrentLocation: jest.fn(async () => ({
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy ?? null,
      altitude: fix.altitude ?? null,
      heading: fix.heading ?? null,
      speed: fix.speed ?? null,
      provider: 'gps',
      timestampMs: fix.timestampMs ?? NOW_MS,
      wasCached: false,
    })),
  };
}

function clearNative(): void {
  NativeModules.OffgridLocation = undefined;
}

function buildEnvelopeFromBody(
  body: GroupLocationBody,
  deviceA: DeviceId,
): MessageEnvelope {
  return {
    v: 1,
    kind: 'msg.envelope',
    id: body.payload.locationId as unknown as MessageId,
    originDeviceId: deviceA,
    destinationDeviceId: null,
    ttl: 0,
    hopCount: 0,
    sentAt: NOW_ISO,
    body,
  };
}

describe('sendGroupLocation (sender path)', () => {
  afterEach(clearNative);

  it('scenario 1 — sender is not a member → returns not-a-member and does not send', async () => {
    const rig = buildRig();
    const nonMember = newUuidV7() as UserId;
    const sendEnvelope = jest.fn(async (body: GroupLocationBody) =>
      buildEnvelopeFromBody(body, rig.deviceA),
    );
    const outcome = await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: nonMember,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    expect(outcome.status).toBe('not-a-member');
    expect(sendEnvelope).not.toHaveBeenCalled();
    rig.close();
  });

  it('scenario 2 — sharing disabled → returns sharing-disabled and does not send', async () => {
    const rig = buildRig();
    const sendEnvelope = jest.fn(async (body: GroupLocationBody) =>
      buildEnvelopeFromBody(body, rig.deviceA),
    );
    const outcome = await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: rig.userA,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    expect(outcome.status).toBe('sharing-disabled');
    expect(sendEnvelope).not.toHaveBeenCalled();
    rig.close();
  });

  it('scenario 3 — no GPS module → returns no-fix', async () => {
    const rig = buildRig();
    enableGroupLocationSharing(rig.dbA, {
      groupId: rig.groupId,
      userId: rig.userA,
      nowIso: () => NOW_ISO,
    });
    clearNative();
    const sendEnvelope = jest.fn(async (body: GroupLocationBody) =>
      buildEnvelopeFromBody(body, rig.deviceA),
    );
    const outcome = await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: rig.userA,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    expect(outcome.status).toBe('no-fix');
    expect(sendEnvelope).not.toHaveBeenCalled();
    rig.close();
  });

  it('scenario 4 — GPS unavailable (permission denied) → returns no-fix', async () => {
    const rig = buildRig();
    enableGroupLocationSharing(rig.dbA, {
      groupId: rig.groupId,
      userId: rig.userA,
      nowIso: () => NOW_ISO,
    });
    NativeModules.OffgridLocation = {
      checkPermission: jest.fn(async () => ({ fine: false, coarse: false })),
      isLocationEnabled: jest.fn(async () => true),
      getCurrentLocation: jest.fn(async () => {
        const err: Error & { code?: string } = new Error('denied');
        err.code = 'E_PERMISSION_DENIED';
        throw err;
      }),
    };
    const sendEnvelope = jest.fn(async (body: GroupLocationBody) =>
      buildEnvelopeFromBody(body, rig.deviceA),
    );
    const outcome = await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: rig.userA,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    expect(outcome.status).toBe('no-fix');
    if (outcome.status === 'no-fix') {
      expect(outcome.reason.status).toBe('permission-denied');
    }
    expect(sendEnvelope).not.toHaveBeenCalled();
    rig.close();
  });

  it('scenario 5 — happy path → sends an envelope with hopCount=0 and ttl=0', async () => {
    const rig = buildRig();
    enableGroupLocationSharing(rig.dbA, {
      groupId: rig.groupId,
      userId: rig.userA,
      nowIso: () => NOW_ISO,
    });
    mockNativeFix({ latitude: 46.5, longitude: 6.6, accuracy: 8 });
    const sendEnvelope = jest.fn(async (body: GroupLocationBody) =>
      buildEnvelopeFromBody(body, rig.deviceA),
    );
    const outcome = await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: rig.userA,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    expect(outcome.status).toBe('sent');
    expect(sendEnvelope).toHaveBeenCalledTimes(1);
    if (outcome.status === 'sent') {
      expect(outcome.envelope.hopCount).toBe(0);
      expect(outcome.envelope.ttl).toBe(0);
      expect(outcome.envelope.destinationDeviceId).toBeNull();
      expect(outcome.envelope.body.kind).toBe('group.location');
    }
    rig.close();
  });

  it('scenario 6 — transport error surfaces as transport-error', async () => {
    const rig = buildRig();
    enableGroupLocationSharing(rig.dbA, {
      groupId: rig.groupId,
      userId: rig.userA,
      nowIso: () => NOW_ISO,
    });
    mockNativeFix({ latitude: 46.5, longitude: 6.6 });
    const sendEnvelope = jest.fn(async () => {
      throw new Error('mock transport disconnected');
    });
    const outcome = await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: rig.userA,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    expect(outcome.status).toBe('transport-error');
    if (outcome.status === 'transport-error') {
      expect(outcome.error.message).toContain('mock transport disconnected');
    }
    rig.close();
  });

  it('scenario 7 — sharing flipped off between authz and GPS → returns sharing-disabled', async () => {
    const rig = buildRig();
    enableGroupLocationSharing(rig.dbA, {
      groupId: rig.groupId,
      userId: rig.userA,
      nowIso: () => NOW_ISO,
    });
    let flipped = false;
    NativeModules.OffgridLocation = {
      checkPermission: jest.fn(async () => ({ fine: true, coarse: true })),
      isLocationEnabled: jest.fn(async () => true),
      getCurrentLocation: jest.fn(async () => {
        if (!flipped) {
          flipped = true;
          // The user disables sharing while the GPS fix is in flight.
          const {
            disableGroupLocationSharing,
          } = require('../../../src/services/location') as {
            disableGroupLocationSharing: (
              db: ReturnType<typeof createInMemoryDb>,
              input: { groupId: GroupId; userId: UserId; nowIso?: () => string },
            ) => void;
          };
          disableGroupLocationSharing(rig.dbA, {
            groupId: rig.groupId,
            userId: rig.userA,
            nowIso: () => NOW_ISO,
          });
        }
        return {
          latitude: 46.5,
          longitude: 6.6,
          accuracy: 5,
          altitude: null,
          heading: null,
          speed: null,
          provider: 'gps',
          timestampMs: NOW_MS,
          wasCached: false,
        };
      }),
    };
    const sendEnvelope = jest.fn(async (body: GroupLocationBody) =>
      buildEnvelopeFromBody(body, rig.deviceA),
    );
    const outcome = await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: rig.userA,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    expect(outcome.status).toBe('sharing-disabled');
    expect(sendEnvelope).not.toHaveBeenCalled();
    rig.close();
  });
});

describe('receiveGroupLocationEnvelope (receiver path)', () => {
  afterEach(clearNative);

  it('scenario 8 — accepts a valid envelope and persists with source=peer', () => {
    const rig = buildRig();
    const locationId = newUuidV7() as LocationId;
    const envelope = buildEnvelopeFromBody(
      {
        kind: 'group.location',
        payload: {
          groupId: rig.groupId,
          senderUserId: rig.userA,
          locationId,
          latitude: 46.5,
          longitude: 6.6,
          accuracy: 5,
          altitude: null,
          heading: null,
          speed: null,
          capturedAt: NOW_ISO,
        },
      },
      rig.deviceA,
    );
    const outcome = receiveGroupLocationEnvelope({
      db: rig.dbB,
      envelope,
      nowIso: () => NOW_ISO,
    });
    expect(outcome.status).toBe('accepted');
    if (outcome.status === 'accepted') {
      expect(outcome.location.source).toBe('peer');
      expect(outcome.location.groupId).toBe(rig.groupId);
      expect(outcome.location.userId).toBe(rig.userA);
      expect(outcome.location.deviceId).toBe(rig.deviceA);
      expect(outcome.location.createdAt).toBe(NOW_ISO);
    }
    // Persisted with the same id → discoverable via findLocationById.
    const persisted = LocationRepo.findLocationById(rig.dbB, locationId);
    expect(persisted?.source).toBe('peer');
    rig.close();
  });

  it('scenario 9 — dedupes by locationId across re-delivery', () => {
    const rig = buildRig();
    const locationId = newUuidV7() as LocationId;
    const body: GroupLocationBody = {
      kind: 'group.location',
      payload: {
        groupId: rig.groupId,
        senderUserId: rig.userA,
        locationId,
        latitude: 46.5,
        longitude: 6.6,
        accuracy: 5,
        altitude: null,
        heading: null,
        speed: null,
        capturedAt: NOW_ISO,
      },
    };
    const envelope = buildEnvelopeFromBody(body, rig.deviceA);
    const first = receiveGroupLocationEnvelope({
      db: rig.dbB,
      envelope,
      nowIso: () => NOW_ISO,
    });
    const second = receiveGroupLocationEnvelope({
      db: rig.dbB,
      envelope,
      nowIso: () => NOW_ISO,
    });
    expect(first.status).toBe('accepted');
    expect(second.status).toBe('duplicate');
    const { rows } = rig.dbB.execute(
      'SELECT COUNT(*) AS c FROM locations WHERE id = ?',
      [locationId],
    );
    expect((rows[0] as { c: number }).c).toBe(1);
    rig.close();
  });

  it('scenario 10 — rejects a sender who is not an active member locally', () => {
    const rig = buildRig();
    const strangerUser = newUuidV7() as UserId;
    const strangerLocationId = newUuidV7() as LocationId;
    const envelope = buildEnvelopeFromBody(
      {
        kind: 'group.location',
        payload: {
          groupId: rig.groupId,
          senderUserId: strangerUser,
          locationId: strangerLocationId,
          latitude: 46.5,
          longitude: 6.6,
          accuracy: 5,
          altitude: null,
          heading: null,
          speed: null,
          capturedAt: NOW_ISO,
        },
      },
      rig.deviceA,
    );
    const outcome = receiveGroupLocationEnvelope({
      db: rig.dbB,
      envelope,
      nowIso: () => NOW_ISO,
    });
    expect(outcome.status).toBe('not-a-member');
    expect(LocationRepo.findLocationById(rig.dbB, strangerLocationId)).toBeNull();
    rig.close();
  });

  it('scenario 11 — rejects a group the receiver does not know about', () => {
    const rig = buildRig();
    const otherGroup = newUuidV7() as GroupId;
    const locationId = newUuidV7() as LocationId;
    const envelope = buildEnvelopeFromBody(
      {
        kind: 'group.location',
        payload: {
          groupId: otherGroup,
          senderUserId: rig.userA,
          locationId,
          latitude: 46.5,
          longitude: 6.6,
          accuracy: 5,
          altitude: null,
          heading: null,
          speed: null,
          capturedAt: NOW_ISO,
        },
      },
      rig.deviceA,
    );
    const outcome = receiveGroupLocationEnvelope({
      db: rig.dbB,
      envelope,
      nowIso: () => NOW_ISO,
    });
    expect(outcome.status).toBe('group-not-found');
    expect(LocationRepo.findLocationById(rig.dbB, locationId)).toBeNull();
    rig.close();
  });

  it('scenario 12 — rejects an envelope with hopCount > 0 (V0 direct-only)', () => {
    const rig = buildRig();
    const body: GroupLocationBody = {
      kind: 'group.location',
      payload: {
        groupId: rig.groupId,
        senderUserId: rig.userA,
        locationId: newUuidV7() as LocationId,
        latitude: 46.5,
        longitude: 6.6,
        accuracy: 5,
        altitude: null,
        heading: null,
        speed: null,
        capturedAt: NOW_ISO,
      },
    };
    const envelope: MessageEnvelope = {
      ...buildEnvelopeFromBody(body, rig.deviceA),
      hopCount: 1,
    };
    const outcome = receiveGroupLocationEnvelope({
      db: rig.dbB,
      envelope,
      nowIso: () => NOW_ISO,
    });
    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.reason).toBe('hop-count-nonzero');
    }
    rig.close();
  });

  it('scenario 13 — rejects an envelope whose id does not match payload.locationId', () => {
    const rig = buildRig();
    const body: GroupLocationBody = {
      kind: 'group.location',
      payload: {
        groupId: rig.groupId,
        senderUserId: rig.userA,
        locationId: newUuidV7() as LocationId,
        latitude: 46.5,
        longitude: 6.6,
        accuracy: 5,
        altitude: null,
        heading: null,
        speed: null,
        capturedAt: NOW_ISO,
      },
    };
    const tampered: MessageEnvelope = {
      ...buildEnvelopeFromBody(body, rig.deviceA),
      id: newUuidV7() as MessageId,
    };
    const outcome = receiveGroupLocationEnvelope({
      db: rig.dbB,
      envelope: tampered,
      nowIso: () => NOW_ISO,
    });
    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.reason).toBe('envelope-id-mismatch');
    }
    rig.close();
  });
});

describe('end-to-end paired-DB sender + receiver (proves the direct path)', () => {
  afterEach(clearNative);

  it('scenario 14 — A sends → B persists one row with source=peer', async () => {
    const rig = buildRig();
    enableGroupLocationSharing(rig.dbA, {
      groupId: rig.groupId,
      userId: rig.userA,
      nowIso: () => NOW_ISO,
    });
    mockNativeFix({ latitude: 46.5, longitude: 6.6, accuracy: 8 });
    let capturedEnvelope: MessageEnvelope | null = null;
    const sendEnvelope = async (body: GroupLocationBody) => {
      const envelope = buildEnvelopeFromBody(body, rig.deviceA);
      capturedEnvelope = envelope;
      return envelope;
    };
    const outcome = await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: rig.userA,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    expect(outcome.status).toBe('sent');
    expect(capturedEnvelope).not.toBeNull();
    const rx = receiveGroupLocationEnvelope({
      db: rig.dbB,
      envelope: capturedEnvelope!,
      nowIso: () => NOW_ISO,
    });
    expect(rx.status).toBe('accepted');
    if (rx.status === 'accepted') {
      expect(rx.location.userId).toBe(rig.userA);
      expect(rx.location.source).toBe('peer');
    }
    const { rows } = rig.dbB.execute(
      "SELECT COUNT(*) AS c FROM locations WHERE source = 'peer'",
    );
    expect((rows[0] as { c: number }).c).toBe(1);
    rig.close();
  });

  it('scenario 15 — replaying the same envelope on B inserts zero additional rows', async () => {
    const rig = buildRig();
    enableGroupLocationSharing(rig.dbA, {
      groupId: rig.groupId,
      userId: rig.userA,
      nowIso: () => NOW_ISO,
    });
    mockNativeFix({ latitude: 46.5, longitude: 6.6 });
    let capturedEnvelope: MessageEnvelope | null = null;
    const sendEnvelope = async (body: GroupLocationBody) => {
      const envelope = buildEnvelopeFromBody(body, rig.deviceA);
      capturedEnvelope = envelope;
      return envelope;
    };
    await sendGroupLocation({
      db: rig.dbA,
      groupId: rig.groupId,
      userId: rig.userA,
      deviceId: rig.deviceA,
      sendEnvelope,
    });
    // Deliver 3 times.
    const outcomes = [
      receiveGroupLocationEnvelope({
        db: rig.dbB,
        envelope: capturedEnvelope!,
        nowIso: () => NOW_ISO,
      }),
      receiveGroupLocationEnvelope({
        db: rig.dbB,
        envelope: capturedEnvelope!,
        nowIso: () => NOW_ISO,
      }),
      receiveGroupLocationEnvelope({
        db: rig.dbB,
        envelope: capturedEnvelope!,
        nowIso: () => NOW_ISO,
      }),
    ];
    expect(outcomes.map(o => o.status)).toEqual([
      'accepted',
      'duplicate',
      'duplicate',
    ]);
    const { rows } = rig.dbB.execute(
      "SELECT COUNT(*) AS c FROM locations WHERE source = 'peer'",
    );
    expect((rows[0] as { c: number }).c).toBe(1);
    rig.close();
  });
});
