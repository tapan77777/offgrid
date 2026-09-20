import { createInMemoryDb } from '../support/testDb';
import { CommunicationManager } from '../../src/services/communication/CommunicationManager';
import { createMockTransportPair } from '../../src/services/communication/transports/mockTransport';
import {
  DIAGNOSTIC_GROUP_ID,
  DIAGNOSTIC_USER_ID,
} from '../../src/services/communication/testGroup';
import { listMessagesForGroup } from '../../src/database/repositories/messageRepository';
import { newUuidV7 } from '../../src/utils/ids';
import type { DeviceId } from '../../src/types/ids';
import type { CommunicationEvent } from '../../src/services/communication/CommunicationManager';

interface Rig {
  managerA: CommunicationManager;
  managerB: CommunicationManager;
  eventsA: CommunicationEvent[];
  eventsB: CommunicationEvent[];
  deviceA: DeviceId;
  deviceB: DeviceId;
  dbA: ReturnType<typeof createInMemoryDb>;
  dbB: ReturnType<typeof createInMemoryDb>;
  dispose(): Promise<void>;
}

async function buildRig(): Promise<Rig> {
  const { a: transportA, b: transportB } = createMockTransportPair();
  const dbA = createInMemoryDb();
  const dbB = createInMemoryDb();
  const deviceA = newUuidV7() as DeviceId;
  const deviceB = newUuidV7() as DeviceId;
  const managerA = new CommunicationManager({
    transport: transportA,
    db: dbA,
    localDeviceId: deviceA,
  });
  const managerB = new CommunicationManager({
    transport: transportB,
    db: dbB,
    localDeviceId: deviceB,
  });
  const eventsA: CommunicationEvent[] = [];
  const eventsB: CommunicationEvent[] = [];
  managerA.on(event => eventsA.push(event));
  managerB.on(event => eventsB.push(event));
  await managerA.initialize();
  await managerB.initialize();
  return {
    managerA,
    managerB,
    eventsA,
    eventsB,
    deviceA,
    deviceB,
    dbA,
    dbB,
    dispose: async () => {
      await managerA.dispose();
      await managerB.dispose();
      dbA.close();
      dbB.close();
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
}

describe('CommunicationManager end-to-end (paired mock transport)', () => {
  it('advertises the peer once both sides start discovery', async () => {
    const rig = await buildRig();
    await rig.managerA.startDiscovery();
    await rig.managerB.startDiscovery();
    await flushMicrotasks();

    const peerEventA = rig.eventsA.find(
      (e): e is Extract<CommunicationEvent, { kind: 'peersChanged' }> =>
        e.kind === 'peersChanged',
    );
    expect(peerEventA?.peers.length).toBe(1);
    expect(peerEventA?.peers[0]?.deviceAddress).toBe('00:00:00:00:00:0B');
    await rig.dispose();
  });

  it('forming the group flips both sides to connected', async () => {
    const rig = await buildRig();
    await rig.managerA.startDiscovery();
    await rig.managerB.startDiscovery();
    await rig.managerA.connectToPeer('00:00:00:00:00:0B');
    await flushMicrotasks();

    expect(rig.managerA.currentState()).toBe('connected');
    expect(rig.managerB.currentState()).toBe('connected');
    await rig.dispose();
  });

  it('A→B sendTestPing persists exactly one row in B and emits pingReceived', async () => {
    const rig = await buildRig();
    await rig.managerA.startDiscovery();
    await rig.managerB.startDiscovery();
    await rig.managerA.connectToPeer('00:00:00:00:00:0B');

    const ping = await rig.managerA.sendTestPing('hello from A');
    await flushMicrotasks();

    const rowsB = listMessagesForGroup(rig.dbB, DIAGNOSTIC_GROUP_ID);
    expect(rowsB.map(m => m.id)).toEqual([ping.id]);
    expect(rowsB[0]?.senderId).toBe(DIAGNOSTIC_USER_ID);
    expect(rowsB[0]?.senderDeviceId).toBe(rig.deviceA);

    const pingEvent = rig.eventsB.find(
      (e): e is Extract<CommunicationEvent, { kind: 'pingReceived' }> =>
        e.kind === 'pingReceived',
    );
    expect(pingEvent?.wasDuplicate).toBe(false);
    await rig.dispose();
  });

  it('replaying the same TestPing.id inserts zero additional rows (proves D-014)', async () => {
    const rig = await buildRig();
    await rig.managerA.startDiscovery();
    await rig.managerB.startDiscovery();
    await rig.managerA.connectToPeer('00:00:00:00:00:0B');

    // Force the same generated id twice by stubbing manager A's generator.
    const fixedId = newUuidV7();
    (rig.managerA as unknown as { generateId: () => string }).generateId = () =>
      fixedId;

    await rig.managerA.sendTestPing('first');
    await rig.managerA.sendTestPing('second-with-same-id');
    await flushMicrotasks();

    const rowsB = listMessagesForGroup(rig.dbB, DIAGNOSTIC_GROUP_ID);
    expect(rowsB.length).toBe(1);

    const duplicateEvents = rig.eventsB.filter(
      (e): e is Extract<CommunicationEvent, { kind: 'pingReceived' }> =>
        e.kind === 'pingReceived',
    );
    expect(duplicateEvents.map(e => e.wasDuplicate)).toEqual([false, true]);
    await rig.dispose();
  });

  it('disconnect + reconnect + resend does not duplicate rows', async () => {
    const rig = await buildRig();
    await rig.managerA.startDiscovery();
    await rig.managerB.startDiscovery();
    await rig.managerA.connectToPeer('00:00:00:00:00:0B');

    const first = await rig.managerA.sendTestPing('one');
    await flushMicrotasks();

    // Simulate the underlying transport dropping.
    const { a: transportA } = getTransports(rig);
    transportA.disconnect();
    await flushMicrotasks();
    expect(rig.managerA.currentState()).toBe('disconnected');

    // Reconnect and resend a NEW ping.
    await rig.managerA.connectToPeer('00:00:00:00:00:0B');
    const second = await rig.managerA.sendTestPing('two');
    await flushMicrotasks();

    const rowsB = listMessagesForGroup(rig.dbB, DIAGNOSTIC_GROUP_ID);
    expect(rowsB.map(m => m.id).sort()).toEqual([first.id, second.id].sort());
    await rig.dispose();
  });

  it('reports an honest disconnected state when the peer drops (proves N-008)', async () => {
    const rig = await buildRig();
    await rig.managerA.startDiscovery();
    await rig.managerB.startDiscovery();
    await rig.managerA.connectToPeer('00:00:00:00:00:0B');

    getTransports(rig).b.disconnect();
    await flushMicrotasks();

    expect(rig.managerA.currentState()).toBe('disconnected');
    expect(rig.managerB.currentState()).toBe('disconnected');
    await rig.dispose();
  });
});

function getTransports(rig: Rig): {
  a: import('../../src/services/communication/transports/mockTransport').MockTransport;
  b: import('../../src/services/communication/transports/mockTransport').MockTransport;
} {
  // Read back the transports installed on the managers for direct simulation.
  const a = (
    rig.managerA as unknown as {
      transport: import('../../src/services/communication/transports/mockTransport').MockTransport;
    }
  ).transport;
  const b = (
    rig.managerB as unknown as {
      transport: import('../../src/services/communication/transports/mockTransport').MockTransport;
    }
  ).transport;
  return { a, b };
}
