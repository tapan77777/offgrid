import { createInMemoryDb } from '../../support/testDb';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { insertGroup } from '../../../src/database/repositories/groupRepository';
import {
  findMessageById,
  insertMessage,
  insertMessageIfAbsent,
  listMessagesForGroup,
} from '../../../src/database/repositories/messageRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type { GroupId, MessageId, UserId } from '../../../src/types/ids';

function seed(): { db: ReturnType<typeof createInMemoryDb>; userId: UserId; groupId: GroupId } {
  const db = createInMemoryDb();
  const userId = newUuidV7() as UserId;
  const groupId = newUuidV7() as GroupId;
  insertUser(db, { id: userId, displayName: 'Tapan', nowIso: '2026-01-01T00:00:00Z' });
  insertGroup(db, { id: groupId, name: 'Test', createdBy: userId, nowIso: '2026-01-01T00:00:00Z' });
  return { db, userId, groupId };
}

describe('messageRepository', () => {
  it('inserts, finds, and lists messages in group order', () => {
    const { db, userId, groupId } = seed();
    const m1 = newUuidV7() as MessageId;
    const m2 = newUuidV7() as MessageId;
    insertMessage(db, {
      id: m1,
      groupId,
      senderId: userId,
      messageType: 'text',
      payload: 'hello',
      createdAt: '2026-01-01T00:00:00Z',
    });
    insertMessage(db, {
      id: m2,
      groupId,
      senderId: userId,
      messageType: 'text',
      payload: 'world',
      createdAt: '2026-01-01T00:00:01Z',
    });
    expect(findMessageById(db, m1)?.payload).toBe('hello');
    expect(listMessagesForGroup(db, groupId).map(m => m.payload)).toEqual([
      'hello',
      'world',
    ]);
    db.close();
  });

  it('insertMessageIfAbsent is idempotent for the same id', () => {
    const { db, userId, groupId } = seed();
    const id = newUuidV7() as MessageId;
    const first = insertMessageIfAbsent(db, {
      id,
      groupId,
      senderId: userId,
      messageType: 'text',
      payload: 'once',
      createdAt: '2026-01-01T00:00:00Z',
    });
    const second = insertMessageIfAbsent(db, {
      id,
      groupId,
      senderId: userId,
      messageType: 'text',
      payload: 'duplicate attempt',
      createdAt: '2026-01-01T00:00:05Z',
    });
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.message.payload).toBe('once');
    expect(listMessagesForGroup(db, groupId)).toHaveLength(1);
    db.close();
  });

  it('rejects a raw duplicate insert by primary key', () => {
    const { db, userId, groupId } = seed();
    const id = newUuidV7() as MessageId;
    insertMessage(db, {
      id,
      groupId,
      senderId: userId,
      messageType: 'text',
      payload: 'a',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(() =>
      insertMessage(db, {
        id,
        groupId,
        senderId: userId,
        messageType: 'text',
        payload: 'b',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(/UNIQUE|PRIMARY/i);
    db.close();
  });
});
