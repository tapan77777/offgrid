import { createFileBackedDb, createInMemoryDb } from '../../support/testDb';
import { ensureLocalUser } from '../../../src/services/identity/localUser';
import { insertUser } from '../../../src/database/repositories/userRepository';
import {
  createGroup,
  deriveJoinCode,
  getGroupDetail,
  GROUP_MEMBER_LIMIT,
  GroupsError,
  joinGroupByCode,
  leaveGroup,
  listGroupsForUser,
  removeMember,
  renameGroup,
} from '../../../src/services/groups';
import { countActiveMembersInGroup } from '../../../src/database/repositories/groupMemberRepository';
import { insertGroup } from '../../../src/database/repositories/groupRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type { GroupId, UserId } from '../../../src/types/ids';

const NOW = '2026-05-01T12:00:00Z';

function seedUserPair(): {
  db: ReturnType<typeof createInMemoryDb>;
  creator: UserId;
  joiner: UserId;
} {
  const db = createInMemoryDb();
  const creator = ensureLocalUser(db).userId;
  const joiner = newUuidV7() as UserId;
  insertUser(db, { id: joiner, displayName: 'Joiner', nowIso: NOW });
  return { db, creator, joiner };
}

describe('groupsService.createGroup', () => {
  it('creates a group and enrols the creator as admin', () => {
    const { db, creator } = seedUserPair();
    const { group, membership } = createGroup(db, {
      name: 'Weekend hike',
      creatorUserId: creator,
    });
    expect(group.name).toBe('Weekend hike');
    expect(group.createdBy).toBe(creator);
    expect(membership.role).toBe('admin');
    expect(membership.status).toBe('active');
    expect(membership.userId).toBe(creator);
    db.close();
  });

  it('rejects empty and overlong names', () => {
    const { db, creator } = seedUserPair();
    expect(() =>
      createGroup(db, { name: '   ', creatorUserId: creator }),
    ).toThrow(GroupsError);
    expect(() =>
      createGroup(db, {
        name: 'x'.repeat(200),
        creatorUserId: creator,
      }),
    ).toThrow(GroupsError);
    db.close();
  });
});

describe('groupsService.joinGroupByCode', () => {
  it('adds an active membership when the code matches', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group } = createGroup(db, { name: 'Trail', creatorUserId: creator });
    const code = deriveJoinCode(group.id);
    const result = joinGroupByCode(db, { code, userId: joiner });
    expect(result.group.id).toBe(group.id);
    expect(result.membership.role).toBe('member');
    expect(result.membership.status).toBe('active');
    expect(result.alreadyMember).toBe(false);
    db.close();
  });

  it('is idempotent — a second join by the same active member returns alreadyMember', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group } = createGroup(db, { name: 'Trail', creatorUserId: creator });
    const code = deriveJoinCode(group.id);
    joinGroupByCode(db, { code, userId: joiner });
    const again = joinGroupByCode(db, { code, userId: joiner });
    expect(again.alreadyMember).toBe(true);
    expect(countActiveMembersInGroup(db, group.id)).toBe(2);
    db.close();
  });

  it('reactivates a previously-left membership on re-join', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group } = createGroup(db, { name: 'Trail', creatorUserId: creator });
    const code = deriveJoinCode(group.id);
    joinGroupByCode(db, { code, userId: joiner });
    leaveGroup(db, { groupId: group.id, userId: joiner });
    const rejoined = joinGroupByCode(db, { code, userId: joiner });
    expect(rejoined.membership.status).toBe('active');
    expect(rejoined.membership.role).toBe('member');
    expect(rejoined.alreadyMember).toBe(false);
    db.close();
  });

  it('rejects unknown codes', () => {
    const { db, joiner } = seedUserPair();
    expect(() =>
      joinGroupByCode(db, { code: 'BOGUSCODE', userId: joiner }),
    ).toThrow(GroupsError);
    db.close();
  });

  it(`rejects the ${GROUP_MEMBER_LIMIT + 1}th join once the limit is reached`, () => {
    const db = createInMemoryDb();
    const creator = ensureLocalUser(db).userId;
    const { group } = createGroup(db, {
      name: 'Big group',
      creatorUserId: creator,
    });
    const code = deriveJoinCode(group.id);

    // Fill the group up to the limit. Creator already counts as 1.
    for (let i = 1; i < GROUP_MEMBER_LIMIT; i += 1) {
      const filler = newUuidV7() as UserId;
      insertUser(db, { id: filler, displayName: `F${i}`, nowIso: NOW });
      joinGroupByCode(db, { code, userId: filler });
    }
    expect(countActiveMembersInGroup(db, group.id)).toBe(GROUP_MEMBER_LIMIT);

    const overflow = newUuidV7() as UserId;
    insertUser(db, { id: overflow, displayName: 'Over', nowIso: NOW });
    let caught: GroupsError | null = null;
    try {
      joinGroupByCode(db, { code, userId: overflow });
    } catch (err) {
      if (err instanceof GroupsError) {
        caught = err;
      }
    }
    expect(caught?.code).toBe('MEMBER_LIMIT_REACHED');
    expect(countActiveMembersInGroup(db, group.id)).toBe(GROUP_MEMBER_LIMIT);
    db.close();
  });
});

describe('groupsService.leaveGroup', () => {
  it('marks the membership as left', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group } = createGroup(db, { name: 'Trail', creatorUserId: creator });
    joinGroupByCode(db, {
      code: deriveJoinCode(group.id),
      userId: joiner,
    });
    const left = leaveGroup(db, { groupId: group.id, userId: joiner });
    expect(left.status).toBe('left');
    expect(countActiveMembersInGroup(db, group.id)).toBe(1);
    db.close();
  });

  it('lets the last remaining admin leave when they are alone', () => {
    const { db, creator } = seedUserPair();
    const { group } = createGroup(db, { name: 'Solo', creatorUserId: creator });
    expect(() =>
      leaveGroup(db, { groupId: group.id, userId: creator }),
    ).not.toThrow();
    db.close();
  });

  it('refuses when the last admin still has other members present', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group } = createGroup(db, { name: 'Duo', creatorUserId: creator });
    joinGroupByCode(db, {
      code: deriveJoinCode(group.id),
      userId: joiner,
    });
    let caught: GroupsError | null = null;
    try {
      leaveGroup(db, { groupId: group.id, userId: creator });
    } catch (err) {
      if (err instanceof GroupsError) {
        caught = err;
      }
    }
    expect(caught?.code).toBe('LAST_ADMIN_WITH_MEMBERS');
    db.close();
  });

  it('refuses to leave a group the user is not in', () => {
    const { db, joiner } = seedUserPair();
    const groupId = newUuidV7() as GroupId;
    insertGroup(db, { id: groupId, name: 'X', nowIso: NOW });
    let caught: GroupsError | null = null;
    try {
      leaveGroup(db, { groupId, userId: joiner });
    } catch (err) {
      if (err instanceof GroupsError) {
        caught = err;
      }
    }
    expect(caught?.code).toBe('NOT_A_MEMBER');
    db.close();
  });
});

describe('groupsService.removeMember', () => {
  it('lets an admin remove another member', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group } = createGroup(db, { name: 'Trail', creatorUserId: creator });
    joinGroupByCode(db, {
      code: deriveJoinCode(group.id),
      userId: joiner,
    });
    const removed = removeMember(db, {
      groupId: group.id,
      actorUserId: creator,
      targetUserId: joiner,
    });
    expect(removed.status).toBe('removed');
    expect(countActiveMembersInGroup(db, group.id)).toBe(1);
    db.close();
  });

  it('rejects when a non-admin tries to remove someone', () => {
    const { db, creator, joiner } = seedUserPair();
    const third = newUuidV7() as UserId;
    insertUser(db, { id: third, displayName: 'C', nowIso: NOW });
    const { group } = createGroup(db, { name: 'Trail', creatorUserId: creator });
    const code = deriveJoinCode(group.id);
    joinGroupByCode(db, { code, userId: joiner });
    joinGroupByCode(db, { code, userId: third });
    let caught: GroupsError | null = null;
    try {
      removeMember(db, {
        groupId: group.id,
        actorUserId: joiner,
        targetUserId: third,
      });
    } catch (err) {
      if (err instanceof GroupsError) {
        caught = err;
      }
    }
    expect(caught?.code).toBe('NOT_ADMIN');
    db.close();
  });

  it('rejects an admin trying to remove themselves', () => {
    const { db, creator } = seedUserPair();
    const { group } = createGroup(db, {
      name: 'Solo',
      creatorUserId: creator,
    });
    let caught: GroupsError | null = null;
    try {
      removeMember(db, {
        groupId: group.id,
        actorUserId: creator,
        targetUserId: creator,
      });
    } catch (err) {
      if (err instanceof GroupsError) {
        caught = err;
      }
    }
    expect(caught?.code).toBe('CANNOT_REMOVE_SELF');
    db.close();
  });

});

describe('groupsService.renameGroup', () => {
  it('lets an admin rename the group', () => {
    const { db, creator } = seedUserPair();
    const { group } = createGroup(db, {
      name: 'Original',
      creatorUserId: creator,
    });
    const renamed = renameGroup(db, {
      groupId: group.id,
      actorUserId: creator,
      name: 'Updated',
    });
    expect(renamed.name).toBe('Updated');
    db.close();
  });

  it('refuses when a non-admin tries to rename', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group } = createGroup(db, {
      name: 'Original',
      creatorUserId: creator,
    });
    joinGroupByCode(db, {
      code: deriveJoinCode(group.id),
      userId: joiner,
    });
    let caught: GroupsError | null = null;
    try {
      renameGroup(db, {
        groupId: group.id,
        actorUserId: joiner,
        name: 'Nope',
      });
    } catch (err) {
      if (err instanceof GroupsError) {
        caught = err;
      }
    }
    expect(caught?.code).toBe('NOT_ADMIN');
    db.close();
  });
});

describe('groupsService.listGroupsForUser', () => {
  it('returns only active memberships and includes local role + join code', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group: g1 } = createGroup(db, {
      name: 'A',
      creatorUserId: creator,
    });
    const { group: g2 } = createGroup(db, {
      name: 'B',
      creatorUserId: creator,
    });
    joinGroupByCode(db, {
      code: deriveJoinCode(g1.id),
      userId: joiner,
    });
    const summaries = listGroupsForUser(db, creator);
    const names = summaries.map(s => s.group.name).sort();
    expect(names).toEqual(['A', 'B']);
    const forJoiner = listGroupsForUser(db, joiner);
    expect(forJoiner.length).toBe(1);
    const [only] = forJoiner;
    if (!only) {
      throw new Error('joiner summary missing');
    }
    expect(only.group.id).toBe(g1.id);
    expect(only.joinCode).toBe(deriveJoinCode(g1.id));
    expect(only.localRole).toBe('member');
    // creator's role on g2 is admin
    const g2Summary = summaries.find(s => s.group.id === g2.id);
    expect(g2Summary?.localRole).toBe('admin');
    db.close();
  });
});

describe('groupsService.getGroupDetail', () => {
  it('returns group + active members + local membership', () => {
    const { db, creator, joiner } = seedUserPair();
    const { group } = createGroup(db, {
      name: 'Detail',
      creatorUserId: creator,
    });
    joinGroupByCode(db, {
      code: deriveJoinCode(group.id),
      userId: joiner,
    });
    const detail = getGroupDetail(db, group.id, creator);
    expect(detail.group.id).toBe(group.id);
    expect(detail.members.map(m => m.userId).sort()).toEqual(
      [creator, joiner].sort(),
    );
    expect(detail.localMembership?.role).toBe('admin');
    expect(detail.joinCode).toBe(deriveJoinCode(group.id));
    db.close();
  });

  it('throws GROUP_NOT_FOUND for an unknown id', () => {
    const { db, creator } = seedUserPair();
    let caught: GroupsError | null = null;
    try {
      getGroupDetail(db, newUuidV7() as GroupId, creator);
    } catch (err) {
      if (err instanceof GroupsError) {
        caught = err;
      }
    }
    expect(caught?.code).toBe('GROUP_NOT_FOUND');
    db.close();
  });
});

describe('groupsService persistence', () => {
  it('preserves groups and memberships across DB reopen', () => {
    const handle = createFileBackedDb();
    const creator = ensureLocalUser(handle.db).userId;
    const joiner = newUuidV7() as UserId;
    insertUser(handle.db, {
      id: joiner,
      displayName: 'Joiner',
      nowIso: NOW,
    });
    const { group } = createGroup(handle.db, {
      name: 'Persist',
      creatorUserId: creator,
    });
    joinGroupByCode(handle.db, {
      code: deriveJoinCode(group.id),
      userId: joiner,
    });

    const reopened = handle.reopen();
    const detail = getGroupDetail(reopened, group.id, creator);
    expect(detail.group.name).toBe('Persist');
    expect(detail.members.length).toBe(2);
    handle.cleanup();
  });
});
