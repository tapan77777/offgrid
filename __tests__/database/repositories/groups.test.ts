import { createInMemoryDb } from '../../support/testDb';
import {
  findGroupById,
  insertGroup,
  listGroups,
} from '../../../src/database/repositories/groupRepository';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type { GroupId, UserId } from '../../../src/types/ids';

describe('groupRepository', () => {
  it('inserts a group and finds it', () => {
    const db = createInMemoryDb();
    const ownerId = newUuidV7() as UserId;
    insertUser(db, { id: ownerId, displayName: 'Owner', nowIso: '2026-01-01T00:00:00Z' });

    const groupId = newUuidV7() as GroupId;
    const created = insertGroup(db, {
      id: groupId,
      name: 'Khambeswari Hike',
      createdBy: ownerId,
      nowIso: '2026-01-01T00:00:00Z',
    });
    expect(created).toMatchObject({
      id: groupId,
      name: 'Khambeswari Hike',
      createdBy: ownerId,
      status: 'active',
    });
    expect(findGroupById(db, groupId)).toEqual(created);
    db.close();
  });

  it('lists groups in creation order', () => {
    const db = createInMemoryDb();
    const g1 = newUuidV7() as GroupId;
    const g2 = newUuidV7() as GroupId;
    insertGroup(db, { id: g1, name: 'A', nowIso: '2026-01-01T00:00:00Z' });
    insertGroup(db, { id: g2, name: 'B', nowIso: '2026-01-02T00:00:00Z' });
    expect(listGroups(db).map(g => g.name)).toEqual(['A', 'B']);
    db.close();
  });
});
