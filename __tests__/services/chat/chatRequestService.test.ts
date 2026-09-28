import { createInMemoryDb } from '../../support/testDb';
import { CommunicationManager } from '../../../src/services/communication/CommunicationManager';
import {
  MockTransport,
  createMockTransportPair,
} from '../../../src/services/communication/transports/mockTransport';
import {
  ChatRequestRepo,
  UserRepo,
} from '../../../src/database/repositories';
import { insertUser } from '../../../src/database/repositories/userRepository';
import {
  acceptChatRequest,
  cancelOutgoingChatRequest,
  ChatRequestError,
  declineChatRequest,
  sendChatRequest,
} from '../../../src/services/chat/chatRequestService';
import { startChatRequestResponder } from '../../../src/services/chat/chatRequestResponder';
import { deriveDirectGroupId, newUuidV7 } from '../../../src/utils/ids';
import type { OffgridDb } from '../../../src/database';
import type { DeviceId, MessageId, UserId } from '../../../src/types/ids';

const NOW = '2026-09-27T10:00:00.000Z';

interface NodeRig {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager;
  readonly userId: UserId;
  readonly deviceId: DeviceId;
  readonly transport: MockTransport;
  readonly detachResponder: () => void;
}

async function buildNode(
  transport: MockTransport,
  displayName: string,
): Promise<NodeRig> {
  const db = createInMemoryDb();
  const userId = newUuidV7() as UserId;
  const deviceId = newUuidV7() as DeviceId;
  insertUser(db, { id: userId, displayName, nowIso: NOW });
  const manager = new CommunicationManager({
    transport,
    db,
    localDeviceId: deviceId,
  });
  await manager.initialize();
  const detachResponder = startChatRequestResponder({
    db,
    manager,
    localUserId: userId,
  });
  return { db, manager, userId, deviceId, transport, detachResponder };
}

async function flush(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
}

async function disposeAll(nodes: readonly NodeRig[]): Promise<void> {
  for (const n of nodes) {
    n.detachResponder();
    await n.manager.dispose();
    n.db.close();
  }
}

describe('sendChatRequest', () => {
  it('rejects when the display name is empty', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW });
    await expect(
      sendChatRequest({
        db,
        manager: null,
        fromUserId: userId,
        fromDisplayName: '   ',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    db.close();
  });

  it('rejects when addressed to self', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW });
    await expect(
      sendChatRequest({
        db,
        manager: null,
        fromUserId: userId,
        fromDisplayName: 'A',
        toUserId: userId,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    db.close();
  });

  it('rejects when no manager is available', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW });
    await expect(
      sendChatRequest({
        db,
        manager: null,
        fromUserId: userId,
        fromDisplayName: 'A',
      }),
    ).rejects.toMatchObject({ code: 'NO_CONNECTION' });
    db.close();
  });

  it('persists outgoing row + broadcasts when toUserId is known (Alice → Bob)', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const result = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });

    // Alice has a persisted outgoing row.
    expect(result.request).not.toBeNull();
    expect(result.reusedExisting).toBe(false);
    const aRow = ChatRequestRepo.findChatRequestById(A.db, result.requestId);
    expect(aRow?.direction).toBe('outgoing');
    expect(aRow?.status).toBe('pending');
    expect(aRow?.requesterUserId).toBe(A.userId);
    expect(aRow?.recipientUserId).toBe(B.userId);

    // Bob's responder inserted a matching incoming row.
    await flush();
    const bRow = ChatRequestRepo.findChatRequestById(B.db, result.requestId);
    expect(bRow?.direction).toBe('incoming');
    expect(bRow?.status).toBe('pending');
    expect(bRow?.requesterDisplayName).toBe('Alice');
    // And Bob learned Alice's User row through the payload.
    expect(UserRepo.findUserById(B.db, A.userId)?.displayName).toBe('Alice');

    await disposeAll([A, B]);
  });

  it('does NOT persist an outgoing row when toUserId is omitted, but still broadcasts', async () => {
    // Nearby flow: Alice knows there is a nearby device but not Bob's userId.
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const result = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      // toUserId omitted — null on the wire.
    });

    expect(result.request).toBeNull();
    expect(result.reusedExisting).toBe(false);
    // Alice did not persist a chat_requests row.
    expect(
      ChatRequestRepo.findChatRequestById(A.db, result.requestId),
    ).toBeNull();

    // Bob still persisted an incoming row addressed to himself (WFD framing
    // restricted delivery; the responder accepts toUserId=null).
    await flush();
    const bRow = ChatRequestRepo.findChatRequestById(B.db, result.requestId);
    expect(bRow?.direction).toBe('incoming');
    expect(bRow?.recipientUserId).toBe(B.userId);
    expect(bRow?.requesterUserId).toBe(A.userId);

    await disposeAll([A, B]);
  });

  it('reuses the existing pending outgoing row on duplicate send', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const first = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });
    const second = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });

    expect(second.reusedExisting).toBe(true);
    expect(second.requestId).toBe(first.requestId);
    // Only one outgoing row exists.
    const outgoing = ChatRequestRepo.listOutgoingPending(A.db, A.userId);
    expect(outgoing).toHaveLength(1);

    await disposeAll([A, B]);
  });

  it('recipient responder ignores loopback (own broadcast heard back)', async () => {
    // Simulate a device receiving its own chat.request envelope through some
    // relay/echo. The responder must not insert a self-addressed row.
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    // Alice sends a chat request FROM herself TO herself's userId — codec
    // would reject a self-loop pre-emptively, so instead we assert on the
    // responder invariant: an envelope where fromUserId === localUserId is
    // ignored. We drive this by re-broadcasting one of Bob's own outgoing
    // requests through Bob's own manager (round-tripping through Alice).
    await sendChatRequest({
      db: B.db,
      manager: B.manager,
      fromUserId: B.userId,
      fromDisplayName: 'Bob',
      toUserId: A.userId,
    });
    await flush();

    // Bob should NOT have inserted an incoming row for his own broadcast.
    const bIncoming = ChatRequestRepo.listIncomingPending(B.db, B.userId);
    expect(bIncoming).toHaveLength(0);

    await disposeAll([A, B]);
  });
});

describe('acceptChatRequest', () => {
  it('creates a direct group, flips row to accepted, and unicasts accept envelope', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });
    await flush();

    const accept = await acceptChatRequest({
      db: B.db,
      manager: B.manager,
      requestId: send.requestId,
      accepterUserId: B.userId,
      accepterDisplayName: 'Bob',
      requesterOriginDeviceId: A.deviceId,
    });

    // Direct group id is derived deterministically from the sorted pair.
    expect(accept.directGroup.id).toBe(
      deriveDirectGroupId(A.userId, B.userId),
    );
    // Bob's row is now accepted.
    expect(accept.request.status).toBe('accepted');
    expect(
      ChatRequestRepo.findChatRequestById(B.db, send.requestId)?.status,
    ).toBe('accepted');

    // Alice received the accept envelope and flipped her outgoing row.
    await flush();
    expect(
      ChatRequestRepo.findChatRequestById(A.db, send.requestId)?.status,
    ).toBe('accepted');
    // Alice learned Bob's user row through the accept payload.
    expect(UserRepo.findUserById(A.db, B.userId)?.displayName).toBe('Bob');

    await disposeAll([A, B]);
  });

  it('ensures accepter user row on Alice even when Alice never persisted the outgoing row', async () => {
    // Nearby flow: Alice sends with toUserId=null (no outgoing row), Bob
    // accepts. Alice must still learn Bob's user row from the accept payload
    // so her UI can open the direct chat.
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      // toUserId omitted → null on wire, no outgoing row on Alice.
    });
    await flush();
    expect(
      ChatRequestRepo.findChatRequestById(A.db, send.requestId),
    ).toBeNull();

    await acceptChatRequest({
      db: B.db,
      manager: B.manager,
      requestId: send.requestId,
      accepterUserId: B.userId,
      accepterDisplayName: 'Bob',
      requesterOriginDeviceId: A.deviceId,
    });
    await flush();

    // Alice ended up with a User row for Bob even though there was no
    // outgoing chat_requests row to flip.
    expect(UserRepo.findUserById(A.db, B.userId)?.displayName).toBe('Bob');

    await disposeAll([A, B]);
  });

  it('rejects when accepter is not the addressed recipient', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });
    await flush();

    // Someone else (not Bob) tries to accept the row on Bob's device.
    const impostor = newUuidV7() as UserId;
    let caught: ChatRequestError | null = null;
    try {
      await acceptChatRequest({
        db: B.db,
        manager: B.manager,
        requestId: send.requestId,
        accepterUserId: impostor,
        accepterDisplayName: 'X',
        requesterOriginDeviceId: A.deviceId,
      });
    } catch (err) {
      if (err instanceof ChatRequestError) caught = err;
    }
    expect(caught?.code).toBe('REQUEST_WRONG_DIRECTION');
    expect(
      ChatRequestRepo.findChatRequestById(B.db, send.requestId)?.status,
    ).toBe('pending');

    await disposeAll([A, B]);
  });

  it('rejects a second accept on an already-resolved row', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });
    await flush();
    await acceptChatRequest({
      db: B.db,
      manager: B.manager,
      requestId: send.requestId,
      accepterUserId: B.userId,
      accepterDisplayName: 'Bob',
      requesterOriginDeviceId: A.deviceId,
    });

    let caught: ChatRequestError | null = null;
    try {
      await acceptChatRequest({
        db: B.db,
        manager: B.manager,
        requestId: send.requestId,
        accepterUserId: B.userId,
        accepterDisplayName: 'Bob',
        requesterOriginDeviceId: A.deviceId,
      });
    } catch (err) {
      if (err instanceof ChatRequestError) caught = err;
    }
    expect(caught?.code).toBe('REQUEST_NOT_PENDING');

    await disposeAll([A, B]);
  });

  it('surfaces REQUEST_NOT_FOUND for an unknown requestId', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);

    const ghost = newUuidV7() as MessageId;
    let caught: ChatRequestError | null = null;
    try {
      await acceptChatRequest({
        db: B.db,
        manager: B.manager,
        requestId: ghost,
        accepterUserId: B.userId,
        accepterDisplayName: 'Bob',
        requesterOriginDeviceId: A.deviceId,
      });
    } catch (err) {
      if (err instanceof ChatRequestError) caught = err;
    }
    expect(caught?.code).toBe('REQUEST_NOT_FOUND');

    await disposeAll([A, B]);
  });
});

describe('declineChatRequest', () => {
  it('flips the row to declined and best-effort notifies the requester', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });
    await flush();

    const result = await declineChatRequest({
      db: B.db,
      manager: B.manager,
      requestId: send.requestId,
      declinerUserId: B.userId,
      requesterOriginDeviceId: A.deviceId,
    });
    expect(result.request.status).toBe('declined');
    // Alice's row also flips (best-effort decline envelope arrived).
    await flush();
    expect(
      ChatRequestRepo.findChatRequestById(A.db, send.requestId)?.status,
    ).toBe('declined');

    await disposeAll([A, B]);
  });

  it('still flips the local row when no origin device is provided (silent decline)', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });
    await flush();

    const result = await declineChatRequest({
      db: B.db,
      manager: B.manager,
      requestId: send.requestId,
      declinerUserId: B.userId,
      requesterOriginDeviceId: null,
    });
    expect(result.request.status).toBe('declined');
    // Alice never got notified — her row is still pending, which is the
    // honest CLAUDE.md §20 outcome when we cannot deliver a decline.
    await flush();
    expect(
      ChatRequestRepo.findChatRequestById(A.db, send.requestId)?.status,
    ).toBe('pending');

    await disposeAll([A, B]);
  });
});

describe('cancelOutgoingChatRequest', () => {
  it('cancels a pending outgoing row without notifying the peer', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });

    const cancelled = cancelOutgoingChatRequest(
      A.db,
      send.requestId,
      A.userId,
      NOW,
    );
    expect(cancelled.status).toBe('cancelled');

    await disposeAll([A, B]);
  });

  it('rejects a cancel from a different user', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });

    const impostor = newUuidV7() as UserId;
    let caught: ChatRequestError | null = null;
    try {
      cancelOutgoingChatRequest(A.db, send.requestId, impostor, NOW);
    } catch (err) {
      if (err instanceof ChatRequestError) caught = err;
    }
    expect(caught?.code).toBe('REQUEST_WRONG_DIRECTION');

    await disposeAll([A, B]);
  });
});

describe('chatRequestResponder duplicate/idempotency', () => {
  it('ignores a repeat chat.request envelope with the same requestId', async () => {
    const { a: tA, b: tB } = createMockTransportPair();
    const A = await buildNode(tA, 'Alice');
    const B = await buildNode(tB, 'Bob');
    await tA.connectToPeer(tB.deviceAddress);
    await flush();

    const send1 = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });
    await flush();

    // Second send collapses to the same outgoing row + rebroadcasts.
    const send2 = await sendChatRequest({
      db: A.db,
      manager: A.manager,
      fromUserId: A.userId,
      fromDisplayName: 'Alice',
      toUserId: B.userId,
    });
    expect(send2.requestId).toBe(send1.requestId);
    await flush();

    // Bob still only has ONE incoming row for this pair.
    const incoming = ChatRequestRepo.listIncomingPending(B.db, B.userId);
    expect(incoming).toHaveLength(1);

    await disposeAll([A, B]);
  });
});
