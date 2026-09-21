import { createInMemoryDb } from '../support/testDb';
import { CommunicationManager } from '../../src/services/communication/CommunicationManager';
import type { CommunicationEvent } from '../../src/services/communication/CommunicationManager';
import { RelayRouter } from '../../src/services/communication/RelayRouter';
import type { RelayRouterEvent } from '../../src/services/communication/RelayRouter';
import {
  createMockTransportPair,
  MockTransport,
} from '../../src/services/communication/transports/mockTransport';
import { encodeEnvelope } from '../../src/services/communication/codec';
import type {
  Transport,
  TransportEvent,
  TransportEventListener,
} from '../../src/services/communication/types';
import type {
  MessageEnvelope,
  TransportId,
} from '../../src/types/communication';
import { MAX_ENVELOPE_TTL } from '../../src/types/communication';
import type { DeviceId, MessageId } from '../../src/types/ids';
import { newUuidV7 } from '../../src/utils/ids';

// Lightweight recording transport used for router tests where we want full
// control over event ordering (synthesizing real-Android GO semantics that
// MockTransport doesn't model) and need `sendPayload` to succeed without
// requiring a paired mock. Captures every send so the test can assert what
// went out on the wire.
class RecordingTransport implements Transport {
  readonly id: TransportId = 'mock';
  readonly sentFrames: Uint8Array[] = [];
  private readonly listeners = new Set<TransportEventListener>();

  on(listener: TransportEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async initialize(): Promise<void> {}
  async startDiscovery(): Promise<void> {}
  async stopDiscovery(): Promise<void> {}
  async connectToPeer(): Promise<void> {}
  async sendPayload(bytes: Uint8Array): Promise<void> {
    this.sentFrames.push(new Uint8Array(bytes));
  }
  async dispose(): Promise<void> {
    this.listeners.clear();
  }

  emitEvent(event: TransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

interface SoloRouterRig {
  readonly transport: RecordingTransport;
  readonly router: RelayRouter;
  readonly events: RelayRouterEvent[];
  readonly localDeviceId: DeviceId;
  readonly db: ReturnType<typeof createInMemoryDb>;
  dispose(): Promise<void>;
}

async function buildSoloRouterRig(): Promise<SoloRouterRig> {
  const db = createInMemoryDb();
  const localDeviceId = newUuidV7() as DeviceId;
  const transport = new RecordingTransport();
  const router = new RelayRouter({ transport, db, localDeviceId });
  const events: RelayRouterEvent[] = [];
  router.on(e => events.push(e));
  router.attach();
  await transport.initialize();
  return {
    transport,
    router,
    events,
    localDeviceId,
    db,
    dispose: async () => {
      router.detach();
      await transport.dispose();
      db.close();
    },
  };
}

function emit(transport: Transport, event: TransportEvent): void {
  // RecordingTransport uses `emitEvent`; MockTransport uses `emit`.
  const anyTransport = transport as unknown as {
    emit?: (e: TransportEvent) => void;
    emitEvent?: (e: TransportEvent) => void;
  };
  if (typeof anyTransport.emitEvent === 'function') {
    anyTransport.emitEvent(event);
    return;
  }
  if (typeof anyTransport.emit === 'function') {
    anyTransport.emit(event);
    return;
  }
  throw new Error('transport has no emit hook');
}

function buildEnvelope(
  overrides: Partial<MessageEnvelope> = {},
): MessageEnvelope {
  return {
    v: 1,
    kind: 'msg.envelope',
    id: newUuidV7() as MessageId,
    originDeviceId: newUuidV7() as DeviceId,
    destinationDeviceId: null,
    ttl: MAX_ENVELOPE_TTL,
    hopCount: 0,
    sentAt: new Date().toISOString(),
    body: { kind: 'test.ping', payload: { textPreview: 'phase4b' } },
    ...overrides,
  };
}

describe('RelayRouter — Phase 4B GO-side peer identity', () => {
  it('learns currentPeerAddress from payloadReceived when acting as group owner', async () => {
    // Real Android reports our own IP as groupOwnerAddress when we are the
    // elected GO. The router must NOT treat that as a forwarding target; it
    // has to wait for the first frame from the peer to learn the peer's IP.
    const rig = await buildSoloRouterRig();

    emit(rig.transport, {
      kind: 'connectionChanged',
      snapshot: {
        groupFormed: true,
        isGroupOwner: true,
        groupOwnerAddress: '192.168.49.1',
      },
    });

    // A send attempted before we know the peer's IP must queue, not forward.
    const outbound = await rig.router.sendEnvelope(
      newUuidV7() as DeviceId,
      { kind: 'test.ping', payload: { textPreview: 'queue then flush' } },
    );
    await flushMicrotasks();
    expect(rig.router.queueDepth()).toBe(1);
    expect(rig.events.some(e => e.kind === 'envelopeFrameWritten')).toBe(false);
    expect(rig.events.some(e => e.kind === 'envelopeQueued')).toBe(true);

    // The first frame from the actual client teaches the router the peer's
    // real IP. Queue drains and outbound is forwarded to it. Address the
    // inbound directly to us so it terminates here (avoids the router also
    // queuing an onward-forward attempt back to the sender, which would
    // muddy the queueDepth assertion below).
    const clientAddress = '192.168.49.42';
    const inbound = buildEnvelope({
      destinationDeviceId: rig.localDeviceId,
      body: { kind: 'test.ping', payload: { textPreview: 'from client' } },
    });
    emit(rig.transport, {
      kind: 'payloadReceived',
      fromAddress: clientAddress,
      bytes: encodeEnvelope(inbound),
    });
    await flushMicrotasks();

    const forwarded = rig.events.find(e => e.kind === 'envelopeFrameWritten');
    expect(forwarded?.kind).toBe('envelopeFrameWritten');
    if (forwarded?.kind === 'envelopeFrameWritten') {
      expect(forwarded.envelope.id).toBe(outbound.id);
      expect(forwarded.toAddress).toBe(clientAddress);
    }
    expect(rig.router.queueDepth()).toBe(0);

    await rig.dispose();
  });

  it('does not loop a received envelope back to the sender when we are GO', async () => {
    // Loop-prevention: only one active socket in a P2P group. If we ignored
    // receivedFromAddress and tried to forward, the envelope would go back
    // out the same socket to the origin. This test proves the router queues
    // instead of looping.
    const rig = await buildSoloRouterRig();

    emit(rig.transport, {
      kind: 'connectionChanged',
      snapshot: {
        groupFormed: true,
        isGroupOwner: true,
        groupOwnerAddress: '192.168.49.1',
      },
    });

    const senderAddress = '192.168.49.42';
    const inbound = buildEnvelope({
      destinationDeviceId: newUuidV7() as DeviceId, // someone we can't reach yet
    });
    emit(rig.transport, {
      kind: 'payloadReceived',
      fromAddress: senderAddress,
      bytes: encodeEnvelope(inbound),
    });
    await flushMicrotasks();

    const forwarded = rig.events.filter(e => e.kind === 'envelopeFrameWritten');
    expect(forwarded).toHaveLength(0);
    const queued = rig.events.filter(e => e.kind === 'envelopeQueued');
    expect(queued).toHaveLength(1);
    if (queued[0]?.kind === 'envelopeQueued') {
      expect(queued[0].envelope.id).toBe(inbound.id);
      expect(queued[0].envelope.hopCount).toBe(1);
      expect(queued[0].envelope.ttl).toBe(MAX_ENVELOPE_TTL - 1);
    }

    await rig.dispose();
  });

  it('does not set currentPeerAddress from connectionChanged when we are GO', async () => {
    // If the router set currentPeerAddress from groupOwnerAddress while GO,
    // a subsequent sendEnvelope with an empty queue would eagerly try to
    // send on the socket even though we have no peer address yet. We assert
    // the queue path is taken instead.
    const rig = await buildSoloRouterRig();

    emit(rig.transport, {
      kind: 'connectionChanged',
      snapshot: {
        groupFormed: true,
        isGroupOwner: true,
        groupOwnerAddress: '10.0.0.1',
      },
    });

    await rig.router.sendEnvelope(newUuidV7() as DeviceId, {
      kind: 'test.ping',
      payload: { textPreview: 'must queue' },
    });
    await flushMicrotasks();

    expect(rig.events.some(e => e.kind === 'envelopeFrameWritten')).toBe(false);
    expect(rig.router.queueDepth()).toBe(1);
    await rig.dispose();
  });

  it('drains a queued envelope to the NEW peer after a group transition (A↔B → B↔C style)', async () => {
    // Paired with the OffgridP2pModule.requestConnectionInfo fix in rev 2:
    // when the router transitions from one Wi-Fi Direct group to another
    // (peer changes, role may change), a queued envelope whose original
    // receivedFromAddress belonged to the old peer must drain to the new
    // peer address on the very next `connectionChanged` — provided the
    // router first observes the intermediate groupFormed=false to clear
    // stale state. This is the pure-JS state-machine half of the fix
    // (Kotlin owns the socket-lifecycle half, which isn't covered here).
    const rig = await buildSoloRouterRig();

    // We are GO of the first group (A↔B). Learn the peer address from a
    // frame the way the router does on real Android.
    emit(rig.transport, {
      kind: 'connectionChanged',
      snapshot: {
        groupFormed: true,
        isGroupOwner: true,
        groupOwnerAddress: '192.168.49.1',
      },
    });
    const oldPeerAddress = '192.168.49.42';
    const inbound = buildEnvelope({
      destinationDeviceId: newUuidV7() as DeviceId, // for someone we can't reach yet
    });
    emit(rig.transport, {
      kind: 'payloadReceived',
      fromAddress: oldPeerAddress,
      bytes: encodeEnvelope(inbound),
    });
    await flushMicrotasks();
    expect(rig.router.queueDepth()).toBe(1);

    // The first group tears down (this is the intermediate groupFormed=false
    // that native must ensure is observed on rev 2 OEMs).
    emit(rig.transport, {
      kind: 'connectionChanged',
      snapshot: {
        groupFormed: false,
        isGroupOwner: false,
        groupOwnerAddress: null,
      },
    });
    // No drain yet — we have no peer.
    expect(rig.transport.sentFrames.length).toBe(0);

    // The new group forms; this time we're the CLIENT (role changed) and
    // the peer is a completely different address. Drain must fire and the
    // frame must go to the NEW peer, not the old one.
    const newPeerAddress = '192.168.49.1';
    emit(rig.transport, {
      kind: 'connectionChanged',
      snapshot: {
        groupFormed: true,
        isGroupOwner: false,
        groupOwnerAddress: newPeerAddress,
      },
    });
    await flushMicrotasks();

    expect(rig.transport.sentFrames.length).toBe(1);
    const frameWritten = rig.events.find(
      e => e.kind === 'envelopeFrameWritten',
    );
    expect(frameWritten?.kind).toBe('envelopeFrameWritten');
    if (frameWritten?.kind === 'envelopeFrameWritten') {
      expect(frameWritten.toAddress).toBe(newPeerAddress);
      expect(frameWritten.envelope.id).toBe(inbound.id);
    }
    expect(rig.router.queueDepth()).toBe(0);

    await rig.dispose();
  });
});

interface PairRig {
  managerA: CommunicationManager;
  managerB: CommunicationManager;
  eventsA: CommunicationEvent[];
  eventsB: CommunicationEvent[];
  deviceA: DeviceId;
  deviceB: DeviceId;
  dbA: ReturnType<typeof createInMemoryDb>;
  dbB: ReturnType<typeof createInMemoryDb>;
  transportA: MockTransport;
  transportB: MockTransport;
  dispose(): Promise<void>;
}

async function buildPairRig(): Promise<PairRig> {
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
  managerA.on(e => eventsA.push(e));
  managerB.on(e => eventsB.push(e));
  await managerA.initialize();
  await managerB.initialize();
  await managerA.startDiscovery();
  await managerB.startDiscovery();
  await managerA.connectToPeer(transportB.deviceAddress);
  await flushMicrotasks();
  return {
    managerA,
    managerB,
    eventsA,
    eventsB,
    deviceA,
    deviceB,
    dbA,
    dbB,
    transportA,
    transportB,
    dispose: async () => {
      await managerA.dispose();
      await managerB.dispose();
      dbA.close();
      dbB.close();
    },
  };
}

describe('CommunicationManager — Phase 4B envelope co-existence', () => {
  it('silently ignores a valid MessageEnvelope frame (no payloadRejected)', async () => {
    // Router and manager share a transport; the manager must not treat an
    // envelope frame as a malformed ping. Otherwise every relay hop would
    // produce a misleading `payloadRejected` in the manager's log.
    const rig = await buildPairRig();

    const envelope = buildEnvelope({ originDeviceId: rig.deviceA });
    emit(rig.transportB, {
      kind: 'payloadReceived',
      fromAddress: rig.transportA.deviceAddress,
      bytes: encodeEnvelope(envelope),
    });
    await flushMicrotasks();

    const rejected = rig.eventsB.filter(e => e.kind === 'payloadRejected');
    expect(rejected).toHaveLength(0);
    const pings = rig.eventsB.filter(e => e.kind === 'pingReceived');
    expect(pings).toHaveLength(0);
    await rig.dispose();
  });

  it('still emits payloadRejected for genuinely malformed frames', async () => {
    const rig = await buildPairRig();

    const junk = new Uint8Array([0, 0, 0, 5, 65, 66, 67, 68, 69]);
    emit(rig.transportB, {
      kind: 'payloadReceived',
      fromAddress: rig.transportA.deviceAddress,
      bytes: junk,
    });
    await flushMicrotasks();

    const rejected = rig.eventsB.filter(e => e.kind === 'payloadRejected');
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.kind === 'payloadRejected') {
      expect(rejected[0].reason).toBe('not-a-test-ping-v1');
    }
    await rig.dispose();
  });
});
