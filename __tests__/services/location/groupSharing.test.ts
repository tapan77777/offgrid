import { createFileBackedDb, createInMemoryDb } from '../../support/testDb';
import {
  GroupLocationSharingError,
  disableGroupLocationSharing,
  enableGroupLocationSharing,
  getMyGroupLocationSharingView,
  isGroupLocationSharingEnabled,
  prepareGroupLocationProjection,
} from '../../../src/services/location';
import { LOCATION_STALE_MS } from '../../../src/services/location';
import {
  GroupLocationSharingRepo,
  GroupMemberRepo,
  GroupRepo,
  LocationRepo,
  UserRepo,
} from '../../../src/database/repositories';
import { newUuidV7 } from '../../../src/utils/ids';
import type {
  GroupId,
  GroupMemberId,
  LocationId,
  UserId,
} from '../../../src/types/ids';

const NOW_MS = Date.parse('2026-05-01T12:00:00Z');
const NOW_ISO = new Date(NOW_MS).toISOString();

function seed(): {
  db: ReturnType<typeof createInMemoryDb>;
  userA: UserId;
  userB: UserId;
  outsider: UserId;
  groupOne: GroupId;
  groupTwo: GroupId;
} {
  const db = createInMemoryDb();
  const userA = newUuidV7() as UserId;
  const userB = newUuidV7() as UserId;
  const outsider = newUuidV7() as UserId;
  UserRepo.insertUser(db, { id: userA, displayName: 'A', nowIso: NOW_ISO });
  UserRepo.insertUser(db, { id: userB, displayName: 'B', nowIso: NOW_ISO });
  UserRepo.insertUser(db, {
    id: outsider,
    displayName: 'Outsider',
    nowIso: NOW_ISO,
  });
  const groupOne = newUuidV7() as GroupId;
  const groupTwo = newUuidV7() as GroupId;
  GroupRepo.insertGroup(db, {
    id: groupOne,
    name: 'Alps',
    createdBy: userA,
    nowIso: NOW_ISO,
  });
  GroupRepo.insertGroup(db, {
    id: groupTwo,
    name: 'Andes',
    createdBy: userA,
    nowIso: NOW_ISO,
  });
  // userA is an admin in group one and a member of group two.
  GroupMemberRepo.insertGroupMember(db, {
    id: newUuidV7() as GroupMemberId,
    groupId: groupOne,
    userId: userA,
    role: 'admin',
    nowIso: NOW_ISO,
  });
  GroupMemberRepo.insertGroupMember(db, {
    id: newUuidV7() as GroupMemberId,
    groupId: groupOne,
    userId: userB,
    role: 'member',
    nowIso: NOW_ISO,
  });
  GroupMemberRepo.insertGroupMember(db, {
    id: newUuidV7() as GroupMemberId,
    groupId: groupTwo,
    userId: userA,
    role: 'member',
    nowIso: NOW_ISO,
  });
  return { db, userA, userB, outsider, groupOne, groupTwo };
}

function insertFix(
  db: ReturnType<typeof createInMemoryDb>,
  userId: UserId,
  ageMs: number,
): void {
  LocationRepo.insertLocation(db, {
    id: newUuidV7() as LocationId,
    userId,
    latitude: 46.5,
    longitude: 6.6,
    accuracy: 5,
    source: 'gps',
    createdAt: new Date(NOW_MS - ageMs).toISOString(),
  });
}

describe('groupSharing service', () => {
  it('scenario 1 — enable sharing for an active member persists an enabled row', () => {
    const { db, userA, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    expect(isGroupLocationSharingEnabled(db, groupOne, userA)).toBe(true);
    const row = GroupLocationSharingRepo.findSharing(db, groupOne, userA);
    expect(row?.enabled).toBe(true);
    db.close();
  });

  it('scenario 2 — disable sharing flips the persisted flag back to false', () => {
    const { db, userA, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    disableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    expect(isGroupLocationSharingEnabled(db, groupOne, userA)).toBe(false);
    // Still a single row — disable never duplicates.
    expect(GroupLocationSharingRepo.countRows(db)).toBe(1);
    db.close();
  });

  it('scenario 3 — enabled state survives an app restart', () => {
    const handle = createFileBackedDb();
    try {
      const userId = newUuidV7() as UserId;
      const groupId = newUuidV7() as GroupId;
      UserRepo.insertUser(handle.db, {
        id: userId,
        displayName: 'A',
        nowIso: NOW_ISO,
      });
      GroupRepo.insertGroup(handle.db, {
        id: groupId,
        name: 'Alps',
        createdBy: userId,
        nowIso: NOW_ISO,
      });
      GroupMemberRepo.insertGroupMember(handle.db, {
        id: newUuidV7() as GroupMemberId,
        groupId,
        userId,
        role: 'admin',
        nowIso: NOW_ISO,
      });
      enableGroupLocationSharing(handle.db, {
        groupId,
        userId,
        nowIso: () => NOW_ISO,
      });
      const reopened = handle.reopen();
      expect(isGroupLocationSharingEnabled(reopened, groupId, userId)).toBe(
        true,
      );
    } finally {
      handle.cleanup();
    }
  });

  it('scenario 4 — only active members can enable sharing', () => {
    const { db, userA, groupOne } = seed();
    expect(() =>
      enableGroupLocationSharing(db, {
        groupId: groupOne,
        userId: userA,
        nowIso: () => NOW_ISO,
      }),
    ).not.toThrow();
    db.close();
  });

  it('scenario 5 — non-members cannot enable sharing', () => {
    const { db, outsider, groupOne } = seed();
    expect(() =>
      enableGroupLocationSharing(db, {
        groupId: groupOne,
        userId: outsider,
        nowIso: () => NOW_ISO,
      }),
    ).toThrow(GroupLocationSharingError);

    const missingGroupId = newUuidV7() as GroupId;
    try {
      enableGroupLocationSharing(db, {
        groupId: missingGroupId,
        userId: outsider,
        nowIso: () => NOW_ISO,
      });
      throw new Error('expected GROUP_NOT_FOUND');
    } catch (err) {
      expect(err).toBeInstanceOf(GroupLocationSharingError);
      expect((err as GroupLocationSharingError).code).toBe('GROUP_NOT_FOUND');
    }
    db.close();
  });

  it('scenario 6 — projection is never shareable while disabled', () => {
    const { db, userA, groupOne } = seed();
    insertFix(db, userA, 0);
    const projection = prepareGroupLocationProjection(db, {
      groupId: groupOne,
      userId: userA,
      now: () => NOW_MS,
    });
    expect(projection.status).toBe('sharing-disabled');
    db.close();
  });

  it('scenario 7 — projection is shareable+current when enabled and location is fresh', () => {
    const { db, userA, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    insertFix(db, userA, 5_000);
    const projection = prepareGroupLocationProjection(db, {
      groupId: groupOne,
      userId: userA,
      now: () => NOW_MS,
    });
    expect(projection.status).toBe('shareable');
    if (projection.status !== 'shareable') return;
    expect(projection.freshness).toBe('current');
    expect(projection.ageMs).toBeGreaterThanOrEqual(5_000);
    expect(projection.location.userId).toBe(userA);
    db.close();
  });

  it('scenario 8 — stale locations produce an honest freshness=stale marker', () => {
    const { db, userA, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    insertFix(db, userA, LOCATION_STALE_MS + 10_000);
    const projection = prepareGroupLocationProjection(db, {
      groupId: groupOne,
      userId: userA,
      now: () => NOW_MS,
    });
    expect(projection.status).toBe('shareable');
    if (projection.status !== 'shareable') return;
    expect(projection.freshness).toBe('stale');

    const view = getMyGroupLocationSharingView(db, {
      groupId: groupOne,
      userId: userA,
      now: () => NOW_MS,
    });
    expect(view.sharing).toBe('enabled');
    if (view.sharing !== 'enabled') return;
    expect(view.location).toBe('stale');
    db.close();
  });

  it('scenario 9 — no local fix at all produces location-unavailable', () => {
    const { db, userA, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    const projection = prepareGroupLocationProjection(db, {
      groupId: groupOne,
      userId: userA,
      now: () => NOW_MS,
    });
    expect(projection.status).toBe('location-unavailable');

    const view = getMyGroupLocationSharingView(db, {
      groupId: groupOne,
      userId: userA,
      now: () => NOW_MS,
    });
    expect(view.sharing).toBe('enabled');
    if (view.sharing !== 'enabled') return;
    expect(view.location).toBe('unavailable');
    db.close();
  });

  it('scenario 10 — multiple groups keep independent opt-in state', () => {
    const { db, userA, groupOne, groupTwo } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    expect(isGroupLocationSharingEnabled(db, groupOne, userA)).toBe(true);
    expect(isGroupLocationSharingEnabled(db, groupTwo, userA)).toBe(false);

    // Location exists but the group two projection must NOT expose it.
    insertFix(db, userA, 1_000);
    const projTwo = prepareGroupLocationProjection(db, {
      groupId: groupTwo,
      userId: userA,
      now: () => NOW_MS,
    });
    expect(projTwo.status).toBe('sharing-disabled');
    db.close();
  });

  it('scenario 11 — leaving a group prevents future shareable projections', () => {
    const { db, userB, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userB,
      nowIso: () => NOW_ISO,
    });
    insertFix(db, userB, 1_000);
    // Confirm we're allowed before leaving.
    const before = prepareGroupLocationProjection(db, {
      groupId: groupOne,
      userId: userB,
      now: () => NOW_MS,
    });
    expect(before.status).toBe('shareable');

    const membership = GroupMemberRepo.findMembership(db, groupOne, userB)!;
    GroupMemberRepo.markMembershipLeft(db, membership.id, NOW_ISO);

    const after = prepareGroupLocationProjection(db, {
      groupId: groupOne,
      userId: userB,
      now: () => NOW_MS,
    });
    expect(after.status).toBe('not-a-member');
    db.close();
  });

  it('scenario 12 — a removed member cannot produce a shareable projection', () => {
    const { db, userB, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userB,
      nowIso: () => NOW_ISO,
    });
    insertFix(db, userB, 1_000);
    const membership = GroupMemberRepo.findMembership(db, groupOne, userB)!;
    GroupMemberRepo.markMembershipRemoved(db, membership.id, NOW_ISO);
    const projection = prepareGroupLocationProjection(db, {
      groupId: groupOne,
      userId: userB,
      now: () => NOW_MS,
    });
    expect(projection.status).toBe('not-a-member');
    db.close();
  });

  it('scenario 13 — enabling twice never creates duplicate sharing records', () => {
    const { db, userA, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userA,
      nowIso: () => NOW_ISO,
    });
    expect(GroupLocationSharingRepo.countRows(db)).toBe(1);
    expect(isGroupLocationSharingEnabled(db, groupOne, userA)).toBe(true);
    db.close();
  });

  it('bonus — disable is idempotent and does not require active membership', () => {
    const { db, userB, groupOne } = seed();
    enableGroupLocationSharing(db, {
      groupId: groupOne,
      userId: userB,
      nowIso: () => NOW_ISO,
    });
    const membership = GroupMemberRepo.findMembership(db, groupOne, userB)!;
    GroupMemberRepo.markMembershipRemoved(db, membership.id, NOW_ISO);
    // Even after being removed, the user can still clear their local opt-in.
    expect(() =>
      disableGroupLocationSharing(db, {
        groupId: groupOne,
        userId: userB,
        nowIso: () => NOW_ISO,
      }),
    ).not.toThrow();
    expect(isGroupLocationSharingEnabled(db, groupOne, userB)).toBe(false);
    db.close();
  });

  it('bonus — disabling for a deleted group is a silent no-op', () => {
    const { db, userA, groupOne } = seed();
    db.execute('DELETE FROM groups WHERE id = ?', [groupOne]);
    expect(() =>
      disableGroupLocationSharing(db, {
        groupId: groupOne,
        userId: userA,
        nowIso: () => NOW_ISO,
      }),
    ).not.toThrow();
    expect(GroupLocationSharingRepo.countRows(db)).toBe(0);
    db.close();
  });
});
