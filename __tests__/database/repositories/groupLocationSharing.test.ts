import { createFileBackedDb, createInMemoryDb } from '../../support/testDb';
import {
  countRows,
  findSharing,
  listSharingForGroup,
  listSharingForUser,
  upsertSharing,
} from '../../../src/database/repositories/groupLocationSharingRepository';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { insertGroup } from '../../../src/database/repositories/groupRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type {
  GroupId,
  GroupLocationSharingId,
  UserId,
} from '../../../src/types/ids';

const NOW = '2026-05-01T12:00:00Z';
const LATER = '2026-05-01T13:00:00Z';

function seed(): {
  db: ReturnType<typeof createInMemoryDb>;
  userA: UserId;
  userB: UserId;
  groupOne: GroupId;
  groupTwo: GroupId;
} {
  const db = createInMemoryDb();
  const userA = newUuidV7() as UserId;
  const userB = newUuidV7() as UserId;
  insertUser(db, { id: userA, displayName: 'A', nowIso: NOW });
  insertUser(db, { id: userB, displayName: 'B', nowIso: NOW });
  const groupOne = newUuidV7() as GroupId;
  const groupTwo = newUuidV7() as GroupId;
  insertGroup(db, {
    id: groupOne,
    name: 'Alps',
    createdBy: userA,
    nowIso: NOW,
  });
  insertGroup(db, {
    id: groupTwo,
    name: 'Andes',
    createdBy: userA,
    nowIso: NOW,
  });
  return { db, userA, userB, groupOne, groupTwo };
}

describe('groupLocationSharingRepository', () => {
  it('inserts a sharing row and reads it back with normalized booleans', () => {
    const { db, userA, groupOne } = seed();
    const id = newUuidV7() as GroupLocationSharingId;
    const created = upsertSharing(db, {
      id,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      nowIso: NOW,
    });
    expect(created).toEqual({
      id,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(findSharing(db, groupOne, userA)).toEqual(created);
    db.close();
  });

  it('flips the enabled bit via UPSERT and never creates a duplicate row', () => {
    const { db, userA, groupOne } = seed();
    const id = newUuidV7() as GroupLocationSharingId;
    upsertSharing(db, {
      id,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      nowIso: NOW,
    });
    upsertSharing(db, {
      id,
      groupId: groupOne,
      userId: userA,
      enabled: false,
      nowIso: LATER,
    });
    upsertSharing(db, {
      id,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      nowIso: LATER,
    });
    expect(countRows(db)).toBe(1);
    const found = findSharing(db, groupOne, userA);
    expect(found?.enabled).toBe(true);
    expect(found?.updatedAt).toBe(LATER);
    expect(found?.createdAt).toBe(NOW);
    db.close();
  });

  it('scopes rows per (group, user) pair', () => {
    const { db, userA, userB, groupOne, groupTwo } = seed();
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      nowIso: NOW,
    });
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupTwo,
      userId: userA,
      enabled: false,
      nowIso: NOW,
    });
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupOne,
      userId: userB,
      enabled: true,
      nowIso: NOW,
    });

    expect(findSharing(db, groupOne, userA)?.enabled).toBe(true);
    expect(findSharing(db, groupTwo, userA)?.enabled).toBe(false);
    expect(findSharing(db, groupOne, userB)?.enabled).toBe(true);
    expect(findSharing(db, groupTwo, userB)).toBeNull();
    db.close();
  });

  it('lists sharing rows for a user across groups', () => {
    const { db, userA, groupOne, groupTwo } = seed();
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      nowIso: NOW,
    });
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupTwo,
      userId: userA,
      enabled: false,
      nowIso: NOW,
    });
    const list = listSharingForUser(db, userA);
    expect(list.map(r => r.groupId).sort()).toEqual(
      [groupOne, groupTwo].sort(),
    );
    db.close();
  });

  it('lists sharing rows for a group across users', () => {
    const { db, userA, userB, groupOne } = seed();
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      nowIso: NOW,
    });
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupOne,
      userId: userB,
      enabled: true,
      nowIso: NOW,
    });
    const list = listSharingForGroup(db, groupOne);
    expect(list.map(r => r.userId).sort()).toEqual([userA, userB].sort());
    db.close();
  });

  it('cascades on group delete', () => {
    const { db, userA, groupOne } = seed();
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      nowIso: NOW,
    });
    db.execute('DELETE FROM groups WHERE id = ?', [groupOne]);
    expect(findSharing(db, groupOne, userA)).toBeNull();
    expect(countRows(db)).toBe(0);
    db.close();
  });

  it('cascades on user delete', () => {
    const { db, userA, groupOne } = seed();
    upsertSharing(db, {
      id: newUuidV7() as GroupLocationSharingId,
      groupId: groupOne,
      userId: userA,
      enabled: true,
      nowIso: NOW,
    });
    db.execute('DELETE FROM users WHERE id = ?', [userA]);
    expect(findSharing(db, groupOne, userA)).toBeNull();
    expect(countRows(db)).toBe(0);
    db.close();
  });

  it('persists sharing rows across an app restart', () => {
    const handle = createFileBackedDb();
    try {
      const userId = newUuidV7() as UserId;
      const groupId = newUuidV7() as GroupId;
      insertUser(handle.db, { id: userId, displayName: 'A', nowIso: NOW });
      insertGroup(handle.db, {
        id: groupId,
        name: 'Alps',
        createdBy: userId,
        nowIso: NOW,
      });
      const rowId = newUuidV7() as GroupLocationSharingId;
      upsertSharing(handle.db, {
        id: rowId,
        groupId,
        userId,
        enabled: true,
        nowIso: NOW,
      });
      const reopened = handle.reopen();
      const found = findSharing(reopened, groupId, userId);
      expect(found?.id).toBe(rowId);
      expect(found?.enabled).toBe(true);
    } finally {
      handle.cleanup();
    }
  });
});
