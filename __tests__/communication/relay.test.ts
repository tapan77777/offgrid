import { createInMemoryDb } from '../support/testDb';
import { RelayRouter } from '../../src/services/communication/RelayRouter';
import type { RelayRouterEvent } from '../../src/services/communication/RelayRouter';
import {
  createTriangleNetwork,
  MockTransport,
} from '../../src/services/communication/transports/mockTransport';
import {
  decodeEnvelope,
  encodeEnvelope,
} from '../../src/services/communication/codec';
import {
  DIAGNOSTIC_GROUP_ID,
} from '../../src/services/communication/testGroup';
import { listMessagesForGroup } from '../../src/database/repositories/messageRepository';
import { newUuidV7 } from '../../src/utils/ids';
import type { DeviceId, MessageId } from '../../src/types/ids';
import type {
  MessageEnvelope,
  TestPingBody,
} from '../../src/types/communication';
import { MAX_ENVELOPE_TTL } from '../../src/types/communication';

interface TriangleRig {
  readonly transportA: MockTransport;
  readonly transportB: MockTransport;
  readonly transportC: MockTransport;
  readonly routerA: RelayRouter;
  readonly routerB: RelayRouter;
  readonly routerC: RelayRouter;
  readonly deviceA: DeviceId;
  readonly deviceB: DeviceId;
  readonly deviceC: DeviceId;
  readonly dbA: ReturnType<typeof createInMemoryDb>;
  readonly dbB: ReturnType<typeof createInMemoryDb>;
  readonly dbC: ReturnType<typeof createInMemoryDb>;
  readonly eventsA: RelayRouterEvent[];
  readonly eventsB: RelayRouterEvent[];
  readonly eventsC: RelayRouterEvent[];
  readonly connect: (nameA: string, nameB: string) => Promise<void>;
  readonly disconnect: (nameA: string, nameB: string) => void;
  dispose(): Promise<void>;
}

async function buildTriangleRig(): Promise<TriangleRig> {
  const { network, a, b, c } = createTriangleNetwork();
  const dbA = createInMemoryDb();
  const dbB = createInMemoryDb();
  const dbC = createInMemoryDb();
  const deviceA = newUuidV7() as DeviceId;
  const deviceB = newUuidV7() as DeviceId;
  const deviceC = newUuidV7() as DeviceId;
  const routerA = new RelayRouter({
    transport: a,
    db: dbA,
    localDeviceId: deviceA,
  });
  const routerB = new RelayRouter({
    transport: b,
    db: dbB,
    localDeviceId: deviceB,
  });
  const routerC = new RelayRouter({
    transport: c,
    db: dbC,
    localDeviceId: deviceC,
  });
  const eventsA: RelayRouterEvent[] = [];
  const eventsB: RelayRouterEvent[] = [];
  const eventsC: RelayRouterEvent[] = [];
  routerA.on(e => eventsA.push(e));
  routerB.on(e => eventsB.push(e));
  routerC.on(e => eventsC.push(e));
  routerA.attach();
  routerB.attach();
  routerC.attach();
  await a.initialize();
  await b.initialize();
  await c.initialize();
  return {
    transportA: a,
    transportB: b,
    transportC: c,
    routerA,
    routerB,
    routerC,
    deviceA,
    deviceB,
    deviceC,
    dbA,
    dbB,
    dbC,
    eventsA,
    eventsB,
    eventsC,
    connect: (x, y) => network.connect(x, y),
    disconnect: (x, y) => network.disconnect(x, y),
    dispose: async () => {
      routerA.detach();
      routerB.detach();
      routerC.detach();
      await a.dispose();
      await b.dispose();
      await c.dispose();
      dbA.close();
      dbB.close();
      dbC.close();
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function pingBody(text: string): TestPingBody {
  return { kind: 'test.ping', payload: { textPreview: text } };
}

function sampleEnvelope(overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    v: 1,
    kind: 'msg.envelope',
    id: newUuidV7() as MessageId,
    originDeviceId: newUuidV7() as DeviceId,
    destinationDeviceId: null,
    ttl: MAX_ENVELOPE_TTL,
    hopCount: 0,
    sentAt: '2026-09-21T00:00:00.000Z',
    body: pingBody('hello'),
    ...overrides,
  };
}

describe('MessageEnvelope codec', () => {
  it('round-trips a well-formed envelope (behavior #1a)', () => {
    const envelope = sampleEnvelope();
    const frame = encodeEnvelope(envelope);
    expect(decodeEnvelope(frame)).toEqual(envelope);
  });

  it('length prefix matches JSON body length', () => {
    const envelope = sampleEnvelope();
    const frame = encodeEnvelope(envelope);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    expect(view.getUint32(0, false)).toBe(frame.byteLength - 4);
  });

  it('rejects wrong wire version', () => {
    const envelope = sampleEnvelope();
    const bad = { ...envelope, v: 2 } as unknown as MessageEnvelope;
    const body = new TextEncoder().encode(JSON.stringify(bad));
    const frame = new Uint8Array(4 + body.byteLength);
    new DataView(frame.buffer).setUint32(0, body.byteLength, false);
    frame.set(body, 4);
    expect(decodeEnvelope(frame)).toBeNull();
  });

  it('rejects a non-uuidv7 id', () => {
    const bad = { ...sampleEnvelope(), id: 'not-a-uuid' } as unknown as MessageEnvelope;
    const body = new TextEncoder().encode(JSON.stringify(bad));
    const frame = new Uint8Array(4 + body.byteLength);
    new DataView(frame.buffer).setUint32(0, body.byteLength, false);
    frame.set(body, 4);
    expect(decodeEnvelope(frame)).toBeNull();
  });

  it('rejects a ttl above the max', () => {
    const bad = { ...sampleEnvelope(), ttl: MAX_ENVELOPE_TTL + 1 };
    const body = new TextEncoder().encode(JSON.stringify(bad));
    const frame = new Uint8Array(4 + body.byteLength);
    new DataView(frame.buffer).setUint32(0, body.byteLength, false);
    frame.set(body, 4);
    expect(decodeEnvelope(frame)).toBeNull();
  });

  it('rejects malformed JSON', () => {
    const body = new TextEncoder().encode('{');
    const frame = new Uint8Array(4 + body.byteLength);
    new DataView(frame.buffer).setUint32(0, body.byteLength, false);
    frame.set(body, 4);
    expect(decodeEnvelope(frame)).toBeNull();
  });

  it('rejects a truncated frame', () => {
    const frame = encodeEnvelope(sampleEnvelope());
    const truncated = frame.subarray(0, frame.byteLength - 5);
    expect(decodeEnvelope(truncated)).toBeNull();
  });

  it('rejects an unknown body kind', () => {
    const bad = {
      ...sampleEnvelope(),
      body: { kind: 'unknown.kind', payload: {} },
    } as unknown as MessageEnvelope;
    const body = new TextEncoder().encode(JSON.stringify(bad));
    const frame = new Uint8Array(4 + body.byteLength);
    new DataView(frame.buffer).setUint32(0, body.byteLength, false);
    frame.set(body, 4);
    expect(decodeEnvelope(frame)).toBeNull();
  });
});

describe('RelayRouter — 3-node triangle (A → B → C)', () => {
  it('behavior #2: A.sendEnvelope inserts exactly one row on A with SENT status', async () => {
    const rig = await buildTriangleRig();
    const envelope = await rig.routerA.sendEnvelope(
      rig.deviceC,
      pingBody('to C'),
    );
    await flushMicrotasks();
    const rowsA = listMessagesForGroup(rig.dbA, DIAGNOSTIC_GROUP_ID);
    expect(rowsA.map(m => m.id)).toEqual([envelope.id]);
    expect(rowsA[0]?.deliveryStatus).toBe('SENT');
    const sentEvents = rig.eventsA.filter(e => e.kind === 'envelopeSent');
    expect(sentEvents).toHaveLength(1);
    await rig.dispose();
  });

  it('behavior #3+#4: B receives, does not treat as own destination, decrements TTL and increments hopCount on forward', async () => {
    const rig = await buildTriangleRig();
    await rig.connect('A', 'B');
    await flushMicrotasks();

    // Connect B↔C first so B can forward immediately without queueing —
    // this test focuses on the TTL/hopCount math, not the sequential
    // handoff timing (behavior #5 covers that).
    // But B can only be connected to one peer at a time; so instead we
    // inspect the queued forward and verify its TTL/hopCount there.
    const originalTtl = MAX_ENVELOPE_TTL;
    const envelope = await rig.routerA.sendEnvelope(
      rig.deviceC,
      pingBody('for C'),
    );
    await flushMicrotasks();

    const receivedOnB = rig.eventsB.find(e => e.kind === 'envelopeReceived');
    expect(receivedOnB?.kind).toBe('envelopeReceived');
    if (receivedOnB?.kind === 'envelopeReceived') {
      expect(receivedOnB.wasForMe).toBe(false);
      expect(receivedOnB.envelope.id).toBe(envelope.id);
    }
    const deliveredOnB = rig.eventsB.find(
      e => e.kind === 'envelopeDelivered',
    );
    expect(deliveredOnB).toBeUndefined();

    const queuedOnB = rig.eventsB.find(e => e.kind === 'envelopeQueued');
    expect(queuedOnB?.kind).toBe('envelopeQueued');
    if (queuedOnB?.kind === 'envelopeQueued') {
      expect(queuedOnB.envelope.ttl).toBe(originalTtl - 1);
      expect(queuedOnB.envelope.hopCount).toBe(1);
      expect(queuedOnB.envelope.id).toBe(envelope.id);
      expect(queuedOnB.envelope.originDeviceId).toBe(rig.deviceA);
      expect(queuedOnB.envelope.destinationDeviceId).toBe(rig.deviceC);
    }
    await rig.dispose();
  });

  it('behavior #5+#6+#7: sequential handoff forwards to C; C receives same id and persists exactly one row', async () => {
    const rig = await buildTriangleRig();
    await rig.connect('A', 'B');
    await flushMicrotasks();
    const envelope = await rig.routerA.sendEnvelope(
      rig.deviceC,
      pingBody('for C'),
    );
    await flushMicrotasks();
    expect(rig.routerB.queueDepth()).toBe(1);

    // Sequential handoff: B leaves A's group, joins C's.
    rig.disconnect('A', 'B');
    await flushMicrotasks();
    await rig.connect('B', 'C');
    await flushMicrotasks();

    expect(rig.routerB.queueDepth()).toBe(0);

    const rowsC = listMessagesForGroup(rig.dbC, DIAGNOSTIC_GROUP_ID);
    expect(rowsC.map(m => m.id)).toEqual([envelope.id]);
    const rowC = rowsC[0];
    expect(rowC).toBeDefined();
    if (rowC) {
      expect(rowC.deliveryStatus).toBe('DELIVERED');
      const parsedOnC = JSON.parse(rowC.payload) as MessageEnvelope;
      expect(parsedOnC.id).toBe(envelope.id);
      expect(parsedOnC.hopCount).toBe(1);
      expect(parsedOnC.ttl).toBe(MAX_ENVELOPE_TTL - 1);
    }

    const deliveredOnC = rig.eventsC.find(
      e => e.kind === 'envelopeDelivered',
    );
    expect(deliveredOnC?.kind).toBe('envelopeDelivered');
    if (deliveredOnC?.kind === 'envelopeDelivered') {
      expect(deliveredOnC.envelope.id).toBe(envelope.id);
    }
    await rig.dispose();
  });

  it('behavior #8: duplicate delivery to C does not create another DB row', async () => {
    const rig = await buildTriangleRig();
    await rig.connect('A', 'B');
    await flushMicrotasks();
    const envelope = await rig.routerA.sendEnvelope(
      rig.deviceC,
      pingBody('once'),
    );
    await flushMicrotasks();
    rig.disconnect('A', 'B');
    await rig.connect('B', 'C');
    await flushMicrotasks();

    const rowsAfterFirst = listMessagesForGroup(
      rig.dbC,
      DIAGNOSTIC_GROUP_ID,
    );
    expect(rowsAfterFirst).toHaveLength(1);

    // Manually re-inject the same on-the-wire envelope bytes into C.
    // The forwarded envelope on the wire has ttl-1, hopCount+1 vs the origin.
    const relayedEnvelope: MessageEnvelope = {
      ...envelope,
      ttl: envelope.ttl - 1,
      hopCount: envelope.hopCount + 1,
    };
    const bytes = encodeEnvelope(relayedEnvelope);
    (rig.transportC as unknown as {
      emit(event: { kind: string; fromAddress: string; bytes: Uint8Array }): void;
    }).emit({
      kind: 'payloadReceived',
      fromAddress: rig.transportB.deviceAddress,
      bytes,
    });
    await flushMicrotasks();

    const rowsAfterReplay = listMessagesForGroup(
      rig.dbC,
      DIAGNOSTIC_GROUP_ID,
    );
    expect(rowsAfterReplay).toHaveLength(1);

    const duplicateEvents = rig.eventsC.filter(
      e => e.kind === 'envelopeReceived',
    );
    // First delivery + second (duplicate) delivery = 2 events; second must be marked duplicate.
    expect(duplicateEvents.length).toBe(2);
    if (duplicateEvents[1]?.kind === 'envelopeReceived') {
      expect(duplicateEvents[1].wasDuplicate).toBe(true);
    }
    await rig.dispose();
  });

  it('behavior #9: TTL=1 at origin means B receives but does not forward; C never receives', async () => {
    const rig = await buildTriangleRig();
    await rig.connect('A', 'B');
    await flushMicrotasks();

    // Custom envelope with ttl=1 — bypass sendEnvelope so we can set the field.
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: newUuidV7() as MessageId,
      originDeviceId: rig.deviceA,
      destinationDeviceId: rig.deviceC,
      ttl: 1,
      hopCount: 0,
      sentAt: new Date().toISOString(),
      body: pingBody('short-lived'),
    };
    await rig.transportA.sendPayload(encodeEnvelope(envelope));
    await flushMicrotasks();

    const receivedOnB = rig.eventsB.find(e => e.kind === 'envelopeReceived');
    expect(receivedOnB?.kind).toBe('envelopeReceived');

    const ttlExpiredOnB = rig.eventsB.find(
      e => e.kind === 'envelopeTtlExpired',
    );
    expect(ttlExpiredOnB?.kind).toBe('envelopeTtlExpired');

    const forwardedOnB = rig.eventsB.find(
      e => e.kind === 'envelopeFrameWritten',
    );
    expect(forwardedOnB).toBeUndefined();
    expect(rig.routerB.queueDepth()).toBe(0);

    // Even if B later connects to C, nothing is delivered.
    rig.disconnect('A', 'B');
    await rig.connect('B', 'C');
    await flushMicrotasks();
    expect(
      listMessagesForGroup(rig.dbC, DIAGNOSTIC_GROUP_ID),
    ).toHaveLength(0);
    await rig.dispose();
  });

  it('behavior #10: an envelope looped back to origin A is rejected as duplicate and not forwarded again', async () => {
    const rig = await buildTriangleRig();
    await rig.connect('A', 'B');
    await flushMicrotasks();
    const envelope = await rig.routerA.sendEnvelope(
      rig.deviceC,
      pingBody('loop-test'),
    );
    await flushMicrotasks();

    // Simulate B forwarding the envelope back to A (loop) with the mutated
    // hopCount/ttl. This bypasses the receivedFromAddress exclusion by
    // injecting directly into A's transport.
    const loopEnvelope: MessageEnvelope = {
      ...envelope,
      ttl: envelope.ttl - 1,
      hopCount: envelope.hopCount + 1,
    };
    const forwardsBeforeLoop = rig.eventsA.filter(
      e => e.kind === 'envelopeFrameWritten',
    ).length;

    (rig.transportA as unknown as {
      emit(event: { kind: string; fromAddress: string; bytes: Uint8Array }): void;
    }).emit({
      kind: 'payloadReceived',
      fromAddress: rig.transportB.deviceAddress,
      bytes: encodeEnvelope(loopEnvelope),
    });
    await flushMicrotasks();

    const rowsA = listMessagesForGroup(rig.dbA, DIAGNOSTIC_GROUP_ID);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]?.id).toBe(envelope.id);

    const duplicateEvents = rig.eventsA.filter(
      e => e.kind === 'envelopeReceived',
    );
    expect(duplicateEvents).toHaveLength(1);
    if (duplicateEvents[0]?.kind === 'envelopeReceived') {
      expect(duplicateEvents[0].wasDuplicate).toBe(true);
    }

    // The loop attempt must not have caused any additional forward.
    const forwardsAfterLoop = rig.eventsA.filter(
      e => e.kind === 'envelopeFrameWritten',
    ).length;
    expect(forwardsAfterLoop).toBe(forwardsBeforeLoop);
    await rig.dispose();
  });

  it('rejects invalid envelope bytes with an envelopeRejected event and no DB write', async () => {
    const rig = await buildTriangleRig();
    await rig.connect('A', 'B');
    await flushMicrotasks();

    const junk = new Uint8Array([0, 0, 0, 5, 65, 66, 67, 68, 69]); // "ABCDE" not JSON
    (rig.transportB as unknown as {
      emit(event: { kind: string; fromAddress: string; bytes: Uint8Array }): void;
    }).emit({
      kind: 'payloadReceived',
      fromAddress: rig.transportA.deviceAddress,
      bytes: junk,
    });
    await flushMicrotasks();

    const rejected = rig.eventsB.find(e => e.kind === 'envelopeRejected');
    expect(rejected?.kind).toBe('envelopeRejected');
    expect(listMessagesForGroup(rig.dbB, DIAGNOSTIC_GROUP_ID)).toHaveLength(0);
    await rig.dispose();
  });

  it('broadcast (destinationDeviceId=null) both delivers locally on B and forwards onward', async () => {
    const rig = await buildTriangleRig();
    await rig.connect('A', 'B');
    await flushMicrotasks();
    const envelope = await rig.routerA.sendEnvelope(
      null,
      pingBody('to everyone'),
    );
    await flushMicrotasks();

    const receivedOnB = rig.eventsB.find(e => e.kind === 'envelopeReceived');
    if (receivedOnB?.kind === 'envelopeReceived') {
      expect(receivedOnB.wasForMe).toBe(true);
    }
    expect(rig.eventsB.some(e => e.kind === 'envelopeDelivered')).toBe(true);
    // B is not the direct-addressed destination (null = broadcast), so it
    // MUST also forward. Since C is not yet connected, the forward queues.
    expect(rig.routerB.queueDepth()).toBe(1);

    rig.disconnect('A', 'B');
    await rig.connect('B', 'C');
    await flushMicrotasks();
    expect(rig.routerB.queueDepth()).toBe(0);

    const rowsC = listMessagesForGroup(rig.dbC, DIAGNOSTIC_GROUP_ID);
    expect(rowsC.map(m => m.id)).toEqual([envelope.id]);
    await rig.dispose();
  });
});

