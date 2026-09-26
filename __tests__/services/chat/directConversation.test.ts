import { createInMemoryDb } from '../../support/testDb';
import {
  DirectConversationInvariantError,
  ensureDirectConversation,
} from '../../../src/services/chat/directConversation';
import { deriveDirectGroupId, newUuidV7 } from '../../../src/utils/ids';
import { insertUser } from '../../../src/database/repositories/userRepository';
import {
  findGroupById,
  insertGroup,
} from '../../../src/database/repositories/groupRepository';
import {
  insertGroupMember,
  listActiveMembersForGroup,
} from '../../../src/database/repositories/groupMemberRepository';
import type { OffgridDb } from '../../../src/database';
import type {
  GroupId,
  GroupMemberId,
  UserId,
} from '../../../src/types/ids';

const NOW = '2026-09-22T00:00:00.000Z';

function seedTwoUsers(): {
  db: OffgridDb;
  userA: UserId;
  userB: UserId;
} {
  const db = createInMemoryDb();
  const userA = newUuidV7() as UserId;
  const userB = newUuidV7() as UserId;
  insertUser(db, { id: userA, displayName: 'A', nowIso: NOW });
  insertUser(db, { id: userB, displayName: 'B', nowIso: NOW });
  return { db, userA, userB };
}

describe('ensureDirectConversation', () => {
  it('creates a synthetic private group with is_direct=1 and two active members', () => {
    const { db, userA, userB } = seedTwoUsers();
    const group = ensureDirectConversation(db, {
      userA,
      userB,
      nowIso: NOW,
    });
    expect(group.isDirect).toBe(true);
    expect(group.id).toBe(deriveDirectGroupId(userA, userB));
    const members = listActiveMembersForGroup(db, group.id);
    expect(members).toHaveLength(2);
    const userIds = new Set(members.map(m => m.userId as string));
    expect(userIds.has(userA as string)).toBe(true);
    expect(userIds.has(userB as string)).toBe(true);
    db.close();
  });

  it('is idempotent — a second call returns the same group and does not add members', () => {
    const { db, userA, userB } = seedTwoUsers();
    const first = ensureDirectConversation(db, { userA, userB, nowIso: NOW });
    const second = ensureDirectConversation(db, {
      userA: userB,
      userB: userA,
      nowIso: NOW,
    });
    expect(second.id).toBe(first.id);
    expect(listActiveMembersForGroup(db, first.id)).toHaveLength(2);
    db.close();
  });

  it('throws if an existing group at the derived id is not is_direct', () => {
    const { db, userA, userB } = seedTwoUsers();
    const groupId = deriveDirectGroupId(userA, userB);
    // Force a regular (non-direct) group at the derived id.
    insertGroup(db, {
      id: groupId,
      name: 'clash',
      createdBy: userA,
      nowIso: NOW,
    });
    expect(() =>
      ensureDirectConversation(db, { userA, userB, nowIso: NOW }),
    ).toThrow(DirectConversationInvariantError);
    db.close();
  });

  it('throws if the existing direct group has a wrong member set', () => {
    const { db, userA, userB } = seedTwoUsers();
    const userC = newUuidV7() as UserId;
    insertUser(db, { id: userC, displayName: 'C', nowIso: NOW });
    const groupId: GroupId = deriveDirectGroupId(userA, userB);
    insertGroup(db, {
      id: groupId,
      name: '__direct',
      createdBy: null,
      nowIso: NOW,
      isDirect: true,
    });
    insertGroupMember(db, {
      id: newUuidV7() as GroupMemberId,
      groupId,
      userId: userA,
      role: 'member',
      nowIso: NOW,
    });
    // Wrong second member.
    insertGroupMember(db, {
      id: newUuidV7() as GroupMemberId,
      groupId,
      userId: userC,
      role: 'member',
      nowIso: NOW,
    });
    expect(() =>
      ensureDirectConversation(db, { userA, userB, nowIso: NOW }),
    ).toThrow(DirectConversationInvariantError);
    db.close();
  });

  it('the created row is retrievable via findGroupById with isDirect=true', () => {
    const { db, userA, userB } = seedTwoUsers();
    const created = ensureDirectConversation(db, {
      userA,
      userB,
      nowIso: NOW,
    });
    const looked = findGroupById(db, created.id);
    expect(looked?.isDirect).toBe(true);
    expect(looked?.name).toBe('__direct');
    db.close();
  });
});
