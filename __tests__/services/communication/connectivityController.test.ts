import { createInMemoryDb } from '../../support/testDb';
import { CommunicationManager } from '../../../src/services/communication/CommunicationManager';
import {
  MockTransport,
  createMockTransportPair,
} from '../../../src/services/communication/transports/mockTransport';
import {
  backoffDelayForAttempt,
  createConnectivityController,
  RECONNECT_BACKOFF_MS,
  type ConnectivityScheduler,
} from '../../../src/services/communication/connectivityController';
import { markLinked } from '../../../src/database/repositories/deviceRepository';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type { DeviceId, UserId } from '../../../src/types/ids';
import type { ConnectivitySnapshot } from '../../../src/store/connectivityStore';
import { findDeviceById } from '../../../src/database/repositories/deviceRepository';

// D-078 reconnect controller.

interface FakeScheduler extends ConnectivityScheduler {
  advance(ms: number): void;
  runNext(): void;
  pendingCount(): number;
}

function createFakeScheduler(startMs = 0): FakeScheduler {
  let currentMs = startMs;
  interface Entry {
    readonly handle: symbol;
    readonly fireAt: number;
    readonly fn: () => void;
  }
  const timers: Entry[] = [];
  return {
    setTimeout(fn, ms) {
      const handle = Symbol('timer');
      timers.push({ handle, fireAt: currentMs + ms, fn });
      timers.sort((a, b) => a.fireAt - b.fireAt);
      return handle;
    },
    clearTimeout(handle) {
      const idx = timers.findIndex(t => t.handle === handle);
      if (idx >= 0) timers.splice(idx, 1);
    },
    now: () => currentMs,
    advance(ms: number): void {
      const target = currentMs + ms;
      while (timers.length > 0) {
        const head = timers[0]!;
        if (head.fireAt > target) break;
        timers.shift();
        currentMs = head.fireAt;
        head.fn();
      }
      currentMs = target;
    },
    runNext(): void {
      const entry = timers.shift();
      if (!entry) return;
      currentMs = entry.fireAt;
      entry.fn();
    },
    pendingCount: () => timers.length,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
}

function mkUser(db: ReturnType<typeof createInMemoryDb>, nowIso: string): UserId {
  const id = newUuidV7() as UserId;
  insertUser(db, { id, displayName: 'peer', nowIso });
  return id;
}

describe('connectivityController — backoff constants (D-078)', () => {
  it('backoffDelayForAttempt returns the documented sequence', () => {
    expect(RECONNECT_BACKOFF_MS).toEqual([2000, 5000, 15000, 30000, 60000]);
    expect(backoffDelayForAttempt(0)).toBe(2000);
    expect(backoffDelayForAttempt(1)).toBe(5000);
    expect(backoffDelayForAttempt(4)).toBe(60000);
  });

  it('holds at the final delay past the end of the schedule', () => {
    expect(backoffDelayForAttempt(5)).toBe(60000);
    expect(backoffDelayForAttempt(100)).toBe(60000);
  });

  it('clamps negative indices to the first delay', () => {
    expect(backoffDelayForAttempt(-1)).toBe(2000);
  });
});

describe('connectivityController — lifecycle (D-078)', () => {
  const NOW = '2026-01-01T00:00:00.000Z';

  it('stays dormant when no linked peers exist', async () => {
    const db = createInMemoryDb();
    const { a: transportA } = createMockTransportPair();
    const manager = new CommunicationManager({
      transport: transportA,
      db,
      localDeviceId: newUuidV7() as DeviceId,
    });
    await manager.initialize();
    const startSpy = jest.spyOn(manager, 'startDiscovery');
    const scheduler = createFakeScheduler();
    const snapshots: ConnectivitySnapshot[] = [];
    const controller = createConnectivityController({
      db,
      manager,
      scheduler,
      publish: snapshot => snapshots.push(snapshot),
    });

    await controller.start();
    await flushMicrotasks();

    expect(startSpy).not.toHaveBeenCalled();
    expect(scheduler.pendingCount()).toBe(0);
    expect(snapshots[snapshots.length - 1]!.label).toBe('noConnection');

    await controller.stop();
    await manager.dispose();
    db.close();
  });

  it('starts discovery + schedules a reconnect when linked peers exist', async () => {
    const db = createInMemoryDb();
    const { a: transportA } = createMockTransportPair();
    const manager = new CommunicationManager({
      transport: transportA,
      db,
      localDeviceId: newUuidV7() as DeviceId,
    });
    await manager.initialize();
    const userId = mkUser(db, NOW);
    const linkedDeviceId = newUuidV7() as DeviceId;
    markLinked(db, { deviceId: linkedDeviceId, linkedUserId: userId, nowIso: NOW });
    const startSpy = jest.spyOn(manager, 'startDiscovery');
    const scheduler = createFakeScheduler();
    const snapshots: ConnectivitySnapshot[] = [];
    const controller = createConnectivityController({
      db,
      manager,
      scheduler,
      publish: snapshot => snapshots.push(snapshot),
    });

    await controller.start();
    await flushMicrotasks();

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(scheduler.pendingCount()).toBe(1);
    // Reflects the "connecting" state because a reconnect timer is pending.
    expect(snapshots[snapshots.length - 1]!.label).toBe('connecting');

    await controller.stop();
    await manager.dispose();
    db.close();
  });

  it('setInternetAvailable updates the published snapshot without side effects', async () => {
    const db = createInMemoryDb();
    const { a: transportA } = createMockTransportPair();
    const manager = new CommunicationManager({
      transport: transportA,
      db,
      localDeviceId: newUuidV7() as DeviceId,
    });
    await manager.initialize();
    const scheduler = createFakeScheduler();
    const snapshots: ConnectivitySnapshot[] = [];
    const controller = createConnectivityController({
      db,
      manager,
      scheduler,
      publish: snapshot => snapshots.push(snapshot),
    });
    await controller.start();
    await flushMicrotasks();

    controller.setInternetAvailable(true);
    expect(snapshots[snapshots.length - 1]!).toMatchObject({
      label: 'internet',
      internetAvailable: true,
    });

    // Setting the same value is idempotent — no extra publish.
    const beforeCount = snapshots.length;
    controller.setInternetAvailable(true);
    expect(snapshots.length).toBe(beforeCount);

    controller.setInternetAvailable(false);
    expect(snapshots[snapshots.length - 1]!.internetAvailable).toBe(false);

    await controller.stop();
    await manager.dispose();
    db.close();
  });

  it('stop() cancels pending timers and detaches listeners', async () => {
    const db = createInMemoryDb();
    const { a: transportA } = createMockTransportPair();
    const manager = new CommunicationManager({
      transport: transportA,
      db,
      localDeviceId: newUuidV7() as DeviceId,
    });
    await manager.initialize();
    const userId = mkUser(db, NOW);
    const linkedDeviceId = newUuidV7() as DeviceId;
    markLinked(db, { deviceId: linkedDeviceId, linkedUserId: userId, nowIso: NOW });
    const scheduler = createFakeScheduler();
    const controller = createConnectivityController({
      db,
      manager,
      scheduler,
      publish: () => {},
    });
    await controller.start();
    await flushMicrotasks();
    expect(scheduler.pendingCount()).toBe(1);

    await controller.stop();
    expect(scheduler.pendingCount()).toBe(0);

    await manager.dispose();
    db.close();
  });
});

describe('connectivityController — reconnect state machine (D-078)', () => {
  const NOW = '2026-01-01T00:00:00.000Z';

  it('paired transports: forms a session, drops it, and reconnects on backoff', async () => {
    const dbA = createInMemoryDb();
    const dbB = createInMemoryDb();
    const { a: transportA, b: transportB } = createMockTransportPair();
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
    await managerA.initialize();
    await managerB.initialize();

    // A has a linked peer for the remote user — B does not yet, so B stays
    // idle unless A drives the connection.
    const remoteUserId = mkUser(dbA, NOW);
    const linkedRemoteDeviceId = newUuidV7() as DeviceId;
    // Pre-record the last-known device address so pickTargetAddress finds it.
    markLinked(dbA, {
      deviceId: linkedRemoteDeviceId,
      linkedUserId: remoteUserId,
      lastKnownDeviceAddress: transportB.deviceAddress,
      nowIso: NOW,
    });

    const scheduler = createFakeScheduler();
    const snapshots: ConnectivitySnapshot[] = [];
    const controller = createConnectivityController({
      db: dbA,
      manager: managerA,
      scheduler,
      publish: snapshot => snapshots.push(snapshot),
    });

    await controller.start();
    await managerB.startDiscovery();
    await flushMicrotasks();

    // Fire the first backoff timer (2s) — it should call connectToPeer,
    // which pairs the mock transports and emits groupFormed=true.
    scheduler.advance(RECONNECT_BACKOFF_MS[0]!);
    await flushMicrotasks();

    const localConnected = snapshots.find(s => s.label === 'localConnected');
    expect(localConnected).toBeDefined();
    expect(localConnected?.nearbyCount).toBe(1);
    expect(controller.currentSnapshot().label).toBe('localConnected');
    // Successful connect resets backoff — no pending timer while connected.
    expect(scheduler.pendingCount()).toBe(0);

    // Drop the connection. Controller should re-arm the backoff timer.
    transportA.disconnect();
    await flushMicrotasks();
    expect(controller.currentSnapshot().label).not.toBe('localConnected');
    expect(scheduler.pendingCount()).toBe(1);

    // Fire the next backoff (2s again — attemptCount was reset on success).
    scheduler.advance(RECONNECT_BACKOFF_MS[0]!);
    await flushMicrotasks();
    expect(controller.currentSnapshot().label).toBe('localConnected');

    await controller.stop();
    await managerA.dispose();
    await managerB.dispose();
    dbA.close();
    dbB.close();
  });

  it('escalates backoff when consecutive attempts fail', async () => {
    const db = createInMemoryDb();
    // Solo transport — no peer paired, so connectToPeer will throw and
    // groupFormed never fires. Each failure should bump attemptCount and
    // schedule the next backoff step.
    const transport = new MockTransport({
      nodeName: 'solo',
      deviceAddress: '00:00:00:00:00:AA',
      peerId: 'peer:solo' as never,
    });
    const manager = new CommunicationManager({
      transport,
      db,
      localDeviceId: newUuidV7() as DeviceId,
    });
    await manager.initialize();
    const userId = mkUser(db, NOW);
    const linkedDeviceId = newUuidV7() as DeviceId;
    markLinked(db, {
      deviceId: linkedDeviceId,
      linkedUserId: userId,
      lastKnownDeviceAddress: '00:00:00:00:00:BB',
      nowIso: NOW,
    });

    const scheduler = createFakeScheduler();
    const controller = createConnectivityController({
      db,
      manager,
      scheduler,
      publish: () => {},
    });
    await controller.start();
    await flushMicrotasks();

    // First attempt: fires at 2s, fails, schedules a 5s retry.
    scheduler.advance(RECONNECT_BACKOFF_MS[0]!);
    await flushMicrotasks();
    expect(scheduler.pendingCount()).toBe(1);

    // Second attempt: fires at 5s from that point, fails, schedules 15s.
    scheduler.advance(RECONNECT_BACKOFF_MS[1]!);
    await flushMicrotasks();
    expect(scheduler.pendingCount()).toBe(1);

    // Third attempt: fires at 15s, fails, schedules 30s.
    scheduler.advance(RECONNECT_BACKOFF_MS[2]!);
    await flushMicrotasks();
    expect(scheduler.pendingCount()).toBe(1);

    // Snapshot should still show connecting (timer is armed) — never
    // localConnected because groupFormed never fired.
    expect(controller.currentSnapshot().label).toBe('connecting');

    await controller.stop();
    await manager.dispose();
    db.close();
  });

  it('records last_known_device_address for a linked peer after a confirmed session', async () => {
    const dbA = createInMemoryDb();
    const dbB = createInMemoryDb();
    const { a: transportA, b: transportB } = createMockTransportPair();
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
    await managerA.initialize();
    await managerB.initialize();

    const remoteUserId = mkUser(dbA, NOW);
    const linkedRemoteDeviceId = newUuidV7() as DeviceId;
    // Link without an address — controller should learn it after the session
    // forms and only one linked peer + one connected peer is unambiguous.
    markLinked(dbA, {
      deviceId: linkedRemoteDeviceId,
      linkedUserId: remoteUserId,
      nowIso: NOW,
    });
    expect(findDeviceById(dbA, linkedRemoteDeviceId)?.lastKnownDeviceAddress).toBeNull();

    const scheduler = createFakeScheduler();
    const controller = createConnectivityController({
      db: dbA,
      manager: managerA,
      scheduler,
      publish: () => {},
    });
    await controller.start();
    await managerB.startDiscovery();
    await flushMicrotasks();

    // First backoff fires: A has no address, so pickTargetAddress falls back
    // to the visible peer (B) and connects to it.
    scheduler.advance(RECONNECT_BACKOFF_MS[0]!);
    await flushMicrotasks();

    expect(controller.currentSnapshot().label).toBe('localConnected');
    const patched = findDeviceById(dbA, linkedRemoteDeviceId);
    expect(patched?.lastKnownDeviceAddress).toBe(transportB.deviceAddress);

    await controller.stop();
    await managerA.dispose();
    await managerB.dispose();
    dbA.close();
    dbB.close();
  });
});
