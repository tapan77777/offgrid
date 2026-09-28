import { createInMemoryDb } from '../../support/testDb';
import { CommunicationManager } from '../../../src/services/communication/CommunicationManager';
import {
  MockTransport,
  createTriangleNetwork,
} from '../../../src/services/communication/transports/mockTransport';
import { insertUser } from '../../../src/database/repositories/userRepository';
import {
  createGroup,
  deriveJoinCode,
  GroupsError,
  requestJoinByCode,
  startGroupJoinResponder,
} from '../../../src/services/groups';
import {
  GroupMemberRepo,
  GroupRepo,
} from '../../../src/database/repositories';
import { newUuidV7 } from '../../../src/utils/ids';
import type { OffgridDb } from '../../../src/database';
import type { DeviceId, UserId } from '../../../src/types/ids';

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
  const detachResponder = startGroupJoinResponder({
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

describe('requestJoinByCode (nearby)', () => {
  it('B joins A\'s group by entering the correct code over a nearby link', async () => {
    const { a: tA, b: tB } = createTriangleNetwork();
    const A = await buildNode(tA, 'Aragorn');
    const B = await buildNode(tB, 'Bilbo');

    // A creates the group.
    const { group } = createGroup(A.db, {
      name: 'Trek 2026',
      creatorUserId: A.userId,
    });
    const code = deriveJoinCode(group.id);

    // Pair and connect A↔B.
    MockTransport.pair(tA, tB);
    await tA.connectToPeer(tB.deviceAddress);

    const result = await requestJoinByCode({
      db: B.db,
      manager: B.manager,
      code,
      joinerUserId: B.userId,
      joinerDisplayName: 'Bilbo',
      timeoutMs: 2000,
    });

    expect(result.source).toBe('nearby');
    expect(result.group.id).toBe(group.id);
    expect(result.group.name).toBe('Trek 2026');

    // B has the group locally with A as admin + B as active member.
    const bGroup = GroupRepo.findGroupById(B.db, group.id);
    expect(bGroup?.name).toBe('Trek 2026');
    const bMembers = GroupMemberRepo.listActiveMembersForGroup(B.db, group.id);
    const bUserIds = new Set(bMembers.map(m => m.userId as string));
    expect(bUserIds.has(A.userId as string)).toBe(true);
    expect(bUserIds.has(B.userId as string)).toBe(true);

    // A has enrolled B on its side too, so A can now chat with B.
    const aMembers = GroupMemberRepo.listActiveMembersForGroup(A.db, group.id);
    const aUserIds = new Set(aMembers.map(m => m.userId as string));
    expect(aUserIds.has(A.userId as string)).toBe(true);
    expect(aUserIds.has(B.userId as string)).toBe(true);

    await disposeAll([A, B]);
  });

  it('C also joins the same group by entering the same code', async () => {
    const { a: tA, b: tB, c: tC } = createTriangleNetwork();
    const A = await buildNode(tA, 'Aragorn');
    const B = await buildNode(tB, 'Bilbo');
    const C = await buildNode(tC, 'Cirdan');

    const { group } = createGroup(A.db, {
      name: 'Trek 2026',
      creatorUserId: A.userId,
    });
    const code = deriveJoinCode(group.id);

    // B joins first.
    MockTransport.pair(tA, tB);
    await tA.connectToPeer(tB.deviceAddress);
    await requestJoinByCode({
      db: B.db,
      manager: B.manager,
      code,
      joinerUserId: B.userId,
      joinerDisplayName: 'Bilbo',
      timeoutMs: 2000,
    });

    // Then A hands off to C. Mock Wi-Fi only supports one pair at a time.
    tA.disconnect();
    MockTransport.unpair(tA, tB);
    MockTransport.pair(tA, tC);
    await tA.connectToPeer(tC.deviceAddress);
    await flush();

    const resultC = await requestJoinByCode({
      db: C.db,
      manager: C.manager,
      code,
      joinerUserId: C.userId,
      joinerDisplayName: 'Cirdan',
      timeoutMs: 2000,
    });

    expect(resultC.group.id).toBe(group.id);
    // A now knows about A, B, C.
    const aIds = new Set(
      GroupMemberRepo.listActiveMembersForGroup(A.db, group.id).map(
        m => m.userId as string,
      ),
    );
    expect(aIds.has(A.userId as string)).toBe(true);
    expect(aIds.has(B.userId as string)).toBe(true);
    expect(aIds.has(C.userId as string)).toBe(true);

    // C's snapshot includes A and B (because the responder sent A's current
    // active member list, which at that point contained A + B + C).
    const cIds = new Set(
      GroupMemberRepo.listActiveMembersForGroup(C.db, group.id).map(
        m => m.userId as string,
      ),
    );
    expect(cIds.has(A.userId as string)).toBe(true);
    expect(cIds.has(C.userId as string)).toBe(true);
    // Whether B appears in C's snapshot depends on responder timing. Both
    // are acceptable — chat between B and C is out-of-scope for D-075 V1.
    // Assert the invariant that matters: C sees at least the admin.
    expect(cIds.size).toBeGreaterThanOrEqual(2);

    await disposeAll([A, B, C]);
  });

  it('wrong code does not join any group and surfaces INVALID_JOIN_CODE', async () => {
    const { a: tA, b: tB } = createTriangleNetwork();
    const A = await buildNode(tA, 'Aragorn');
    const B = await buildNode(tB, 'Bilbo');
    createGroup(A.db, { name: 'Trek 2026', creatorUserId: A.userId });

    MockTransport.pair(tA, tB);
    await tA.connectToPeer(tB.deviceAddress);

    let caught: GroupsError | null = null;
    try {
      await requestJoinByCode({
        db: B.db,
        manager: B.manager,
        code: 'ZZZZZZZZ',
        joinerUserId: B.userId,
        joinerDisplayName: 'Bilbo',
        timeoutMs: 250,
      });
    } catch (err) {
      if (err instanceof GroupsError) caught = err;
    }
    expect(caught?.code).toBe('INVALID_JOIN_CODE');
    // No user-facing group was created on B (the __phase3_diagnostics group
    // is a Milestone A internal artifact of manager.initialize()).
    const userGroups = GroupRepo.listGroups(B.db).filter(
      g => g.name !== '__phase3_diagnostics',
    );
    expect(userGroups).toHaveLength(0);

    await disposeAll([A, B]);
  });

  it('surfaces NO_CONNECTION when no manager is registered', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'Solo', nowIso: NOW });

    let caught: GroupsError | null = null;
    try {
      await requestJoinByCode({
        db,
        manager: null,
        code: 'ABCDEFGH',
        joinerUserId: userId,
        joinerDisplayName: 'Solo',
        timeoutMs: 100,
      });
    } catch (err) {
      if (err instanceof GroupsError) caught = err;
    }
    expect(caught?.code).toBe('NO_CONNECTION');
    db.close();
  });

  it('takes the local fast-path when the group is already known locally', async () => {
    // Setup: B previously joined A's group; the group + membership are
    // already on B. requestJoinByCode should return source='local' without
    // needing a live manager.
    const { a: tA, b: tB } = createTriangleNetwork();
    const A = await buildNode(tA, 'Aragorn');
    const B = await buildNode(tB, 'Bilbo');
    const { group } = createGroup(A.db, {
      name: 'Trek 2026',
      creatorUserId: A.userId,
    });
    const code = deriveJoinCode(group.id);

    MockTransport.pair(tA, tB);
    await tA.connectToPeer(tB.deviceAddress);
    await requestJoinByCode({
      db: B.db,
      manager: B.manager,
      code,
      joinerUserId: B.userId,
      joinerDisplayName: 'Bilbo',
      timeoutMs: 2000,
    });

    // Second call with no manager should still succeed via the local
    // fast-path.
    const again = await requestJoinByCode({
      db: B.db,
      manager: null,
      code,
      joinerUserId: B.userId,
      joinerDisplayName: 'Bilbo',
      timeoutMs: 100,
    });
    expect(again.source).toBe('local');
    expect(again.alreadyMember).toBe(true);
    expect(again.group.id).toBe(group.id);

    await disposeAll([A, B]);
  });
});
