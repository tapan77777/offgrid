import { createInMemoryDb } from '../../support/testDb';
import {
  findUserById,
  insertUser,
  listUsers,
  updateUserDisplayName,
} from '../../../src/database/repositories/userRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type { UserId } from '../../../src/types/ids';

describe('userRepository', () => {
  it('inserts and finds a user', () => {
    const db = createInMemoryDb();
    const id = newUuidV7() as UserId;
    const created = insertUser(db, {
      id,
      displayName: 'Tapan',
      nowIso: '2026-01-01T00:00:00Z',
    });
    expect(created).toMatchObject({
      id,
      displayName: 'Tapan',
      avatarUri: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const found = findUserById(db, id);
    expect(found).toEqual(created);
    db.close();
  });

  it('lists users in creation order', () => {
    const db = createInMemoryDb();
    const id1 = newUuidV7() as UserId;
    const id2 = newUuidV7() as UserId;
    insertUser(db, { id: id1, displayName: 'A', nowIso: '2026-01-01T00:00:00Z' });
    insertUser(db, { id: id2, displayName: 'B', nowIso: '2026-01-02T00:00:00Z' });
    const users = listUsers(db);
    expect(users.map(u => u.displayName)).toEqual(['A', 'B']);
    db.close();
  });

  it('rejects duplicate insertion on the same primary key', () => {
    const db = createInMemoryDb();
    const id = newUuidV7() as UserId;
    insertUser(db, { id, displayName: 'A', nowIso: '2026-01-01T00:00:00Z' });
    expect(() =>
      insertUser(db, { id, displayName: 'B', nowIso: '2026-01-01T00:00:00Z' }),
    ).toThrow(/UNIQUE|PRIMARY/i);
    db.close();
  });

  it('updates display name', () => {
    const db = createInMemoryDb();
    const id = newUuidV7() as UserId;
    insertUser(db, { id, displayName: 'A', nowIso: '2026-01-01T00:00:00Z' });
    const updated = updateUserDisplayName(db, id, 'B', '2026-01-02T00:00:00Z');
    expect(updated.displayName).toBe('B');
    expect(updated.updatedAt).toBe('2026-01-02T00:00:00Z');
    db.close();
  });
});
