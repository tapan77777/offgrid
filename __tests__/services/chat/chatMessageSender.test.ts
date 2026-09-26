import { createInMemoryDb } from '../../support/testDb';
import {
  ChatSendValidationError,
  sendChatText,
} from '../../../src/services/chat/chatMessageSender';
import { ensureDirectConversation } from '../../../src/services/chat/directConversation';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { insertGroup } from '../../../src/database/repositories/groupRepository';
import { insertGroupMember } from '../../../src/database/repositories/groupMemberRepository';
import {
  findMessageById,
  listConversation,
} from '../../../src/database/repositories/messageRepository';
import { MAX_MSG_TEXT_UTF8_BYTES } from '../../../src/types/communication';
import { newUuidV7 } from '../../../src/utils/ids';
import type { CommunicationManager } from '../../../src/services/communication/CommunicationManager';
import type { OffgridDb } from '../../../src/database';
import type {
  DeviceId,
  GroupId,
  GroupMemberId,
  MessageId,
  UserId,
} from '../../../src/types/ids';

const NOW = '2026-09-22T12:00:00.000Z';

function seed(): {
  db: OffgridDb;
  userA: UserId;
  userB: UserId;
  groupId: GroupId;
  deviceA: DeviceId;
} {
  const db = createInMemoryDb();
  const userA = newUuidV7() as UserId;
  const userB = newUuidV7() as UserId;
  insertUser(db, { id: userA, displayName: 'A', nowIso: NOW });
  insertUser(db, { id: userB, displayName: 'B', nowIso: NOW });
  const group = ensureDirectConversation(db, { userA, userB, nowIso: NOW });
  return {
    db,
    userA,
    userB,
    groupId: group.id,
    deviceA: newUuidV7() as DeviceId,
  };
}

function fakeManager(): {
  manager: CommunicationManager;
  sendSpy: jest.Mock;
} {
  const sendSpy = jest.fn(async () => undefined);
  const manager = {
    sendChatTextEnvelope: sendSpy,
  } as unknown as CommunicationManager;
  return { manager, sendSpy };
}

describe('sendChatText', () => {
  it('rejects empty text', async () => {
    const { db, userA, groupId, deviceA } = seed();
    await expect(
      sendChatText({
        db,
        manager: null,
        groupId,
        senderUserId: userA,
        senderDeviceId: deviceA,
        text: '   ',
        nowIso: NOW,
      }),
    ).rejects.toBeInstanceOf(ChatSendValidationError);
    db.close();
  });

  it('rejects text over the UTF-8 byte cap', async () => {
    const { db, userA, groupId, deviceA } = seed();
    const overflow = 'a'.repeat(MAX_MSG_TEXT_UTF8_BYTES + 1);
    await expect(
      sendChatText({
        db,
        manager: null,
        groupId,
        senderUserId: userA,
        senderDeviceId: deviceA,
        text: overflow,
        nowIso: NOW,
      }),
    ).rejects.toMatchObject({ reason: 'text-too-long' });
    db.close();
  });

  it('rejects a non-member sender', async () => {
    const { db, groupId, deviceA } = seed();
    const outsider = newUuidV7() as UserId;
    insertUser(db, { id: outsider, displayName: 'X', nowIso: NOW });
    await expect(
      sendChatText({
        db,
        manager: null,
        groupId,
        senderUserId: outsider,
        senderDeviceId: deviceA,
        text: 'hello',
        nowIso: NOW,
      }),
    ).rejects.toMatchObject({ reason: 'not-a-member' });
    db.close();
  });

  it('persists at LOCAL and returns queued when no manager is available', async () => {
    const { db, userA, groupId, deviceA } = seed();
    const outcome = await sendChatText({
      db,
      manager: null,
      groupId,
      senderUserId: userA,
      senderDeviceId: deviceA,
      text: 'hello',
      nowIso: NOW,
    });
    expect(outcome.status).toBe('queued');
    expect(outcome.message.deliveryStatus).toBe('LOCAL');
    expect(outcome.message.payload).toBe('hello');
    // The row exists and is visible in the conversation listing.
    expect(findMessageById(db, outcome.message.id)?.deliveryStatus).toBe(
      'LOCAL',
    );
    expect(listConversation(db, groupId, 10)).toHaveLength(1);
    db.close();
  });

  it('flips LOCAL → SENT when the manager accepts the envelope', async () => {
    const { db, userA, groupId, deviceA } = seed();
    const { manager, sendSpy } = fakeManager();
    const outcome = await sendChatText({
      db,
      manager,
      groupId,
      senderUserId: userA,
      senderDeviceId: deviceA,
      text: 'hi there',
      nowIso: NOW,
    });
    expect(outcome.status).toBe('sent');
    expect(outcome.message.deliveryStatus).toBe('SENT');
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const call = sendSpy.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      kind: 'msg.text',
      payload: {
        groupId,
        senderUserId: userA,
        text: 'hi there',
      },
    });
    // The DB is durably at SENT after the flip.
    expect(findMessageById(db, outcome.message.id)?.deliveryStatus).toBe(
      'SENT',
    );
    db.close();
  });

  it('keeps LOCAL when the manager throws, returns status=error', async () => {
    const { db, userA, groupId, deviceA } = seed();
    const manager = {
      sendChatTextEnvelope: jest.fn(async () => {
        throw new Error('boom');
      }),
    } as unknown as CommunicationManager;
    const outcome = await sendChatText({
      db,
      manager,
      groupId,
      senderUserId: userA,
      senderDeviceId: deviceA,
      text: 'hi',
      nowIso: NOW,
    });
    expect(outcome.status).toBe('error');
    expect(outcome.error?.message).toBe('boom');
    expect(findMessageById(db, outcome.message.id)?.deliveryStatus).toBe(
      'LOCAL',
    );
    db.close();
  });

  it('uses generateId when provided (for deterministic tests)', async () => {
    const { db, userA, groupId, deviceA } = seed();
    const fixed = newUuidV7();
    const outcome = await sendChatText({
      db,
      manager: null,
      groupId,
      senderUserId: userA,
      senderDeviceId: deviceA,
      text: 'x',
      nowIso: NOW,
      generateId: () => fixed,
    });
    expect(outcome.message.id).toBe(fixed as unknown as MessageId);
    db.close();
  });

  it('rejects when the group does not exist locally', async () => {
    const db = createInMemoryDb();
    const userA = newUuidV7() as UserId;
    insertUser(db, { id: userA, displayName: 'A', nowIso: NOW });
    const bogusGroup = newUuidV7() as GroupId;
    await expect(
      sendChatText({
        db,
        manager: null,
        groupId: bogusGroup,
        senderUserId: userA,
        senderDeviceId: newUuidV7() as DeviceId,
        text: 'hello',
        nowIso: NOW,
      }),
    ).rejects.toMatchObject({ reason: 'group-not-found' });
    db.close();
  });

  it('works for a regular (non-direct) group when sender is an active member', async () => {
    const db = createInMemoryDb();
    const userA = newUuidV7() as UserId;
    insertUser(db, { id: userA, displayName: 'A', nowIso: NOW });
    const groupId = newUuidV7() as GroupId;
    insertGroup(db, {
      id: groupId,
      name: 'Team',
      createdBy: userA,
      nowIso: NOW,
    });
    insertGroupMember(db, {
      id: newUuidV7() as GroupMemberId,
      groupId,
      userId: userA,
      role: 'admin',
      nowIso: NOW,
    });
    const outcome = await sendChatText({
      db,
      manager: null,
      groupId,
      senderUserId: userA,
      senderDeviceId: newUuidV7() as DeviceId,
      text: 'group hello',
      nowIso: NOW,
    });
    expect(outcome.status).toBe('queued');
    expect(outcome.message.payload).toBe('group hello');
    db.close();
  });
});
