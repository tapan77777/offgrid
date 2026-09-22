import { createFileBackedDb, createInMemoryDb } from '../../support/testDb';
import {
  deleteExpired,
  findLatestForGroup,
  findLatestForUser,
  findLocationById,
  insertLocation,
  listRecentForUser,
} from '../../../src/database/repositories/locationRepository';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { insertGroup } from '../../../src/database/repositories/groupRepository';
import { insertDevice } from '../../../src/database/repositories/deviceRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type {
  DeviceId,
  GroupId,
  LocationId,
  UserId,
} from '../../../src/types/ids';

const NOW = '2026-05-01T12:00:00Z';

function seed(): {
  db: ReturnType<typeof createInMemoryDb>;
  userA: UserId;
  userB: UserId;
  deviceA: DeviceId;
  group: GroupId;
} {
  const db = createInMemoryDb();
  const userA = newUuidV7() as UserId;
  const userB = newUuidV7() as UserId;
  insertUser(db, { id: userA, displayName: 'A', nowIso: NOW });
  insertUser(db, { id: userB, displayName: 'B', nowIso: NOW });
  const deviceA = newUuidV7() as DeviceId;
  insertDevice(db, {
    id: deviceA,
    userId: userA,
    platform: 'android',
    nowIso: NOW,
  });
  const group = newUuidV7() as GroupId;
  insertGroup(db, { id: group, name: 'Alps', createdBy: userA, nowIso: NOW });
  return { db, userA, userB, deviceA, group };
}

describe('locationRepository', () => {
  it('inserts a location and reads it back with all fields', () => {
    const { db, userA, deviceA, group } = seed();
    const id = newUuidV7() as LocationId;
    const created = insertLocation(db, {
      id,
      userId: userA,
      deviceId: deviceA,
      groupId: group,
      latitude: 46.5197,
      longitude: 6.6323,
      accuracy: 8.5,
      altitude: 372.0,
      heading: 90.0,
      speed: 1.2,
      source: 'gps',
      createdAt: NOW,
    });
    expect(created).toMatchObject({
      id,
      userId: userA,
      deviceId: deviceA,
      groupId: group,
      latitude: 46.5197,
      longitude: 6.6323,
      accuracy: 8.5,
      altitude: 372.0,
      heading: 90.0,
      speed: 1.2,
      source: 'gps',
      syncStatus: 'NOT_SYNCED',
    });
    expect(findLocationById(db, id)).toEqual(created);
    db.close();
  });

  it('accepts null accuracy/altitude/heading/speed and null device/group', () => {
    const { db, userA } = seed();
    const id = newUuidV7() as LocationId;
    const created = insertLocation(db, {
      id,
      userId: userA,
      latitude: 0,
      longitude: 0,
      source: 'gps',
      createdAt: NOW,
    });
    expect(created.accuracy).toBeNull();
    expect(created.altitude).toBeNull();
    expect(created.heading).toBeNull();
    expect(created.speed).toBeNull();
    expect(created.deviceId).toBeNull();
    expect(created.groupId).toBeNull();
    db.close();
  });

  it('rejects out-of-range coordinates', () => {
    const { db, userA } = seed();
    expect(() =>
      insertLocation(db, {
        id: newUuidV7() as LocationId,
        userId: userA,
        latitude: 91,
        longitude: 0,
        source: 'gps',
        createdAt: NOW,
      }),
    ).toThrow(/Invalid coordinates/);
    expect(() =>
      insertLocation(db, {
        id: newUuidV7() as LocationId,
        userId: userA,
        latitude: 0,
        longitude: -181,
        source: 'gps',
        createdAt: NOW,
      }),
    ).toThrow(/Invalid coordinates/);
    expect(() =>
      insertLocation(db, {
        id: newUuidV7() as LocationId,
        userId: userA,
        latitude: Number.NaN,
        longitude: 0,
        source: 'gps',
        createdAt: NOW,
      }),
    ).toThrow(/Invalid coordinates/);
    db.close();
  });

  it('returns the latest location per user ordered by created_at', () => {
    const { db, userA, userB } = seed();
    insertLocation(db, {
      id: newUuidV7() as LocationId,
      userId: userA,
      latitude: 1,
      longitude: 1,
      source: 'gps',
      createdAt: '2026-05-01T10:00:00Z',
    });
    insertLocation(db, {
      id: newUuidV7() as LocationId,
      userId: userA,
      latitude: 2,
      longitude: 2,
      source: 'gps',
      createdAt: '2026-05-01T11:00:00Z',
    });
    insertLocation(db, {
      id: newUuidV7() as LocationId,
      userId: userB,
      latitude: 3,
      longitude: 3,
      source: 'gps',
      createdAt: '2026-05-01T12:00:00Z',
    });
    const latestA = findLatestForUser(db, userA);
    expect(latestA?.latitude).toBe(2);
    expect(latestA?.createdAt).toBe('2026-05-01T11:00:00Z');
    const latestB = findLatestForUser(db, userB);
    expect(latestB?.latitude).toBe(3);
    db.close();
  });

  it('returns the latest location per group', () => {
    const { db, userA, userB, group } = seed();
    insertLocation(db, {
      id: newUuidV7() as LocationId,
      userId: userA,
      groupId: group,
      latitude: 1,
      longitude: 1,
      source: 'gps',
      createdAt: '2026-05-01T10:00:00Z',
    });
    insertLocation(db, {
      id: newUuidV7() as LocationId,
      userId: userB,
      groupId: group,
      latitude: 2,
      longitude: 2,
      source: 'gps',
      createdAt: '2026-05-01T11:00:00Z',
    });
    const latest = findLatestForGroup(db, group);
    expect(latest?.userId).toBe(userB);
    db.close();
  });

  it('listRecentForUser returns most-recent-first, limited', () => {
    const { db, userA } = seed();
    for (let i = 0; i < 5; i += 1) {
      insertLocation(db, {
        id: newUuidV7() as LocationId,
        userId: userA,
        latitude: i,
        longitude: i,
        source: 'gps',
        createdAt: `2026-05-01T1${i}:00:00Z`,
      });
    }
    const recent = listRecentForUser(db, userA, 3);
    expect(recent.map(l => l.latitude)).toEqual([4, 3, 2]);
    db.close();
  });

  it('deleteExpired removes rows past expires_at and leaves NULL expires_at alone', () => {
    const { db, userA } = seed();
    insertLocation(db, {
      id: newUuidV7() as LocationId,
      userId: userA,
      latitude: 1,
      longitude: 1,
      source: 'gps',
      createdAt: NOW,
      expiresAt: '2026-05-01T09:00:00Z',
    });
    insertLocation(db, {
      id: newUuidV7() as LocationId,
      userId: userA,
      latitude: 2,
      longitude: 2,
      source: 'gps',
      createdAt: NOW,
      expiresAt: '2026-06-01T00:00:00Z',
    });
    insertLocation(db, {
      id: newUuidV7() as LocationId,
      userId: userA,
      latitude: 3,
      longitude: 3,
      source: 'gps',
      createdAt: NOW,
      // no expires_at
    });
    const removed = deleteExpired(db, '2026-05-15T00:00:00Z');
    expect(removed).toBe(1);
    expect(listRecentForUser(db, userA, 10).map(l => l.latitude).sort()).toEqual(
      [2, 3],
    );
    db.close();
  });

  it('persists locations across an app restart', () => {
    const handle = createFileBackedDb();
    try {
      const userId = newUuidV7() as UserId;
      insertUser(handle.db, { id: userId, displayName: 'A', nowIso: NOW });
      const id = newUuidV7() as LocationId;
      insertLocation(handle.db, {
        id,
        userId,
        latitude: 42,
        longitude: 42,
        source: 'gps',
        createdAt: NOW,
      });
      const reopened = handle.reopen();
      const latest = findLatestForUser(reopened, userId);
      expect(latest?.id).toBe(id);
      expect(latest?.latitude).toBe(42);
    } finally {
      handle.cleanup();
    }
  });
});
