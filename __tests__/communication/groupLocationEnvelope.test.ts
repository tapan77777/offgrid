import { createInMemoryDb } from '../support/testDb';
import { CommunicationManager } from '../../src/services/communication/CommunicationManager';
import { createMockTransportPair } from '../../src/services/communication/transports/mockTransport';
import type { CommunicationEvent } from '../../src/services/communication/CommunicationManager';
import type {
  GroupLocationBody,
  MessageEnvelope,
} from '../../src/types/communication';
import type {
  DeviceId,
  GroupId,
  LocationId,
  UserId,
} from '../../src/types/ids';
import { newUuidV7 } from '../../src/utils/ids';

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
  await managerA.startDiscovery();
  await managerB.startDiscovery();
  await managerA.connectToPeer('00:00:00:00:00:0B');
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

async function flush(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
}

function sampleBody(overrides: Partial<GroupLocationBody['payload']> = {}): {
  body: GroupLocationBody;
  locationId: LocationId;
} {
  const locationId = newUuidV7() as LocationId;
  return {
    locationId,
    body: {
      kind: 'group.location',
      payload: {
        groupId: newUuidV7() as GroupId,
        senderUserId: newUuidV7() as UserId,
        locationId,
        latitude: 46.5,
        longitude: 6.6,
        accuracy: 5,
        altitude: null,
        heading: null,
        speed: null,
        capturedAt: '2026-05-01T12:00:00.000Z',
        ...overrides,
      },
    },
  };
}

describe('CommunicationManager group.location envelope dispatch', () => {
  it('emits groupLocationEnvelopeSent on the sending side with hopCount=0/ttl=0', async () => {
    const rig = await buildRig();
    const { body } = sampleBody();
    const envelope = await rig.managerA.sendGroupLocationEnvelope(body);
    expect(envelope.hopCount).toBe(0);
    expect(envelope.ttl).toBe(0);
    const sent = rig.eventsA.find(
      (e): e is Extract<
        CommunicationEvent,
        { kind: 'groupLocationEnvelopeSent' }
      > => e.kind === 'groupLocationEnvelopeSent',
    );
    expect(sent?.envelope.id).toBe(body.payload.locationId);
    await rig.dispose();
  });

  it('emits groupLocationEnvelopeReceived on the receiver — never falls into payloadRejected', async () => {
    const rig = await buildRig();
    const { body } = sampleBody();
    await rig.managerA.sendGroupLocationEnvelope(body);
    await flush();

    const rx = rig.eventsB.find(
      (e): e is Extract<
        CommunicationEvent,
        { kind: 'groupLocationEnvelopeReceived' }
      > => e.kind === 'groupLocationEnvelopeReceived',
    );
    expect(rx).toBeDefined();
    expect(rx?.envelope.body.kind).toBe('group.location');

    const rejected = rig.eventsB.filter(e => e.kind === 'payloadRejected');
    expect(rejected).toEqual([]);
    await rig.dispose();
  });

  it('rejects a corrupt payload with payloadRejected (garbage bytes)', async () => {
    const rig = await buildRig();
    // Inject garbage bytes through the transport pair.
    const { managerB } = rig;
    const managerBRef = managerB as unknown as {
      handleTransportEvent(event: {
        kind: 'payloadReceived';
        fromAddress: string;
        bytes: Uint8Array;
      }): void;
    };
    managerBRef.handleTransportEvent({
      kind: 'payloadReceived',
      fromAddress: '00:00:00:00:00:0A',
      bytes: new Uint8Array([0, 0, 0, 4, 0xff, 0xff, 0xff, 0xff]),
    });
    const rejected = rig.eventsB.find(e => e.kind === 'payloadRejected');
    expect(rejected).toBeDefined();
    await rig.dispose();
  });

  it('does NOT invoke a RelayRouter (V0 direct-only) — the envelope frame is one-shot', async () => {
    const rig = await buildRig();
    const { body } = sampleBody();
    const envelope: MessageEnvelope =
      await rig.managerA.sendGroupLocationEnvelope(body);
    // Only one envelope kind is emitted on A's side; nothing routes back.
    const forwarded = rig.eventsA.filter(
      e => e.kind === 'groupLocationEnvelopeSent',
    );
    expect(forwarded.length).toBe(1);
    expect(envelope.ttl).toBe(0);
    await rig.dispose();
  });
});
