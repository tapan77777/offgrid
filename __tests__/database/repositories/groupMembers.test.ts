import { createInMemoryDb } from '../../support/testDb';
import {
  countActiveMembersInGroup,
  findGroupMemberById,
  findMembership,
  insertGroupMember,
  listActiveMembersForGroup,
  listActiveMembershipsForUser,
  markMembershipLeft,
  markMembershipRemoved,
  reactivateMembership,
  setMembershipRole,
} from '../../../src/database/repositories/groupMemberRepository';
import { insertGroup } from '../../../src/database/repositories/groupRepository';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type {
  GroupId,
  GroupMemberId,
  UserId,
} from '../../../src/types/ids';

const NOW = '2026-05-01T12:00:00Z';

function seed(): {
  db: ReturnType<typeof createInMemoryDb>;
  groupId: GroupId;
  userA: UserId;
  userB: UserId;
} {
  const db = createInMemoryDb();
  const userA = newUuidV7() as UserId;
  const userB = newUuidV7() as UserId;
  insertUser(db, { id: userA, displayName: 'A', nowIso: NOW });
  insertUser(db, { id: userB, displayName: 'B', nowIso: NOW });
  const groupId = newUuidV7() as GroupId;
  insertGroup(db, {
    id: groupId,
    name: 'Test',
    createdBy: userA,
    nowIso: NOW,
  });
  return { db, groupId, userA, userB };
}

describe('groupMemberRepository', () => {
  it('inserts a membership and finds it by id and (group,user)', () => {
    const { db, groupId, userA } = seed();
    const id = newUuidV7() as GroupMemberId;
    const created = insertGroupMember(db, {
      id,
      groupId,
      userId: userA,
      role: 'admin',
      nowIso: NOW,
    });
    expect(created).toMatchObject({
      id,
      groupId,
      userId: userA,
      role: 'admin',
      status: 'active',
      leftAt: null,
    });
    expect(findGroupMemberById(db, id)).toEqual(created);
    expect(findMembership(db, groupId, userA)).toEqual(created);
    db.close();
  });

  it('rejects duplicate (group,user) memberships via UNIQUE constraint', () => {
    const { db, groupId, userA } = seed();
    insertGroupMember(db, {
      id: newUuidV7() as GroupMemberId,
      groupId,
      userId: userA,
      role: 'admin',
      nowIso: NOW,
    });
    expect(() =>
      insertGroupMember(db, {
        id: newUuidV7() as GroupMemberId,
        groupId,
        userId: userA,
        role: 'member',
        nowIso: NOW,
      }),
    ).toThrow();
    db.close();
  });

  it('lists active members and counts them', () => {
    const { db, groupId, userA, userB } = seed();
    insertGroupMember(db, {
      id: newUuidV7() as GroupMemberId,
      groupId,
      userId: userA,
      role: 'admin',
      nowIso: NOW,
    });
    const memberBId = newUuidV7() as GroupMemberId;
    insertGroupMember(db, {
      id: memberBId,
      groupId,
      userId: userB,
      role: 'member',
      nowIso: NOW,
    });
    expect(countActiveMembersInGroup(db, groupId)).toBe(2);
    expect(listActiveMembersForGroup(db, groupId).map(m => m.userId)).toEqual([
      userA,
      userB,
    ]);

    markMembershipLeft(db, memberBId, NOW);
    expect(countActiveMembersInGroup(db, groupId)).toBe(1);
    expect(listActiveMembersForGroup(db, groupId).map(m => m.userId)).toEqual([
      userA,
    ]);
    db.close();
  });

  it('lists active memberships for a user across groups', () => {
    const { db, groupId, userA } = seed();
    const groupB = newUuidV7() as GroupId;
    insertGroup(db, { id: groupB, name: 'Second', nowIso: NOW });
    insertGroupMember(db, {
      id: newUuidV7() as GroupMemberId,
      groupId,
      userId: userA,
      role: 'admin',
      nowIso: NOW,
    });
    insertGroupMember(db, {
      id: newUuidV7() as GroupMemberId,
      groupId: groupB,
      userId: userA,
      role: 'member',
      nowIso: NOW,
    });
    const memberships = listActiveMembershipsForUser(db, userA);
    expect(memberships.map(m => m.groupId).sort()).toEqual(
      [groupId, groupB].sort(),
    );
    db.close();
  });

  it('marks membership left and removed with status + left_at', () => {
    const { db, groupId, userA } = seed();
    const id = newUuidV7() as GroupMemberId;
    insertGroupMember(db, {
      id,
      groupId,
      userId: userA,
      role: 'member',
      nowIso: NOW,
    });
    const left = markMembershipLeft(db, id, '2026-06-01T00:00:00Z');
    expect(left.status).toBe('left');
    expect(left.leftAt).toBe('2026-06-01T00:00:00Z');

    const removed = markMembershipRemoved(db, id, '2026-06-02T00:00:00Z');
    expect(removed.status).toBe('removed');
    expect(removed.leftAt).toBe('2026-06-02T00:00:00Z');
    db.close();
  });

  it('reactivates and changes role', () => {
    const { db, groupId, userA } = seed();
    const id = newUuidV7() as GroupMemberId;
    insertGroupMember(db, {
      id,
      groupId,
      userId: userA,
      role: 'admin',
      nowIso: NOW,
    });
    markMembershipLeft(db, id, '2026-06-01T00:00:00Z');
    const reactivated = reactivateMembership(
      db,
      id,
      'member',
      '2026-06-05T00:00:00Z',
    );
    expect(reactivated.status).toBe('active');
    expect(reactivated.role).toBe('member');
    expect(reactivated.leftAt).toBeNull();

    const promoted = setMembershipRole(db, id, 'admin', '2026-06-06T00:00:00Z');
    expect(promoted.role).toBe('admin');
    db.close();
  });
});
