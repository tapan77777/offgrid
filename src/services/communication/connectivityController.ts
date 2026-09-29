import type { OffgridDb } from '../../database';
import { DeviceRepo } from '../../database/repositories';
import type {
  CommunicationEvent,
  CommunicationManager,
} from './CommunicationManager';
import type { PeerHandle } from '../../types/communication';
import type { Device } from '../../types/entities';
import {
  useConnectivityStore,
  type ConnectivitySnapshot,
} from '../../store/connectivityStore';

// D-078. Reconnect controller. Owns the reconnect state machine on top of a
// single CommunicationManager. Publishes a consumer-facing snapshot into
// `useConnectivityStore` so the ConnectionStatus component on HomeScreen +
// GroupScreen can render an honest label without knowing anything about the
// transport layer (CLAUDE.md §20).
//
// Behavior (approved decisions):
//   - Only starts discovery if at least one linked peer exists in the local
//     devices table. Merely-discovered (unlinked) peers do NOT motivate any
//     background radio activity.
//   - Backoff schedule per drop: 2s, 5s, 15s, 30s, 60s, then hold at 60s.
//     Reset to 0 on any confirmed session.
//   - Max 1 concurrent auto-connect attempt (Android WFD supports only one
//     P2P group at a time).
//   - Never optimistic: `localConnected` is only reported after the manager
//     observes `connectionChanged.snapshot.groupFormed === true`.

export const RECONNECT_BACKOFF_MS = [
  2_000,
  5_000,
  15_000,
  30_000,
  60_000,
] as const;

export function backoffDelayForAttempt(attemptIndex: number): number {
  const lastIndex = RECONNECT_BACKOFF_MS.length - 1;
  if (attemptIndex <= 0) return RECONNECT_BACKOFF_MS[0];
  if (attemptIndex >= lastIndex) return RECONNECT_BACKOFF_MS[lastIndex]!;
  return RECONNECT_BACKOFF_MS[attemptIndex]!;
}

export interface ConnectivityScheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

const defaultScheduler: ConnectivityScheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: h => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export interface ConnectivityControllerOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager;
  readonly scheduler?: ConnectivityScheduler;
  readonly nowIso?: () => string;
  // Callback used to publish snapshot updates. Defaults to the zustand
  // store. Injectable for tests that want to observe transitions without
  // pulling in React state.
  readonly publish?: (snapshot: ConnectivitySnapshot) => void;
}

export interface ConnectivityController {
  start(): Promise<void>;
  stop(): Promise<void>;
  currentSnapshot(): ConnectivitySnapshot;
  // Externally-fed signals — NetInfo is the only current input.
  setInternetAvailable(available: boolean): void;
}

interface InternalState {
  started: boolean;
  attemptCount: number;
  attemptInFlight: boolean;
  timer: unknown | null;
  groupFormed: boolean;
  connectedPeers: readonly PeerHandle[];
  lastSeenAtMs: number | null;
  unsubscribe: (() => void) | null;
  discoveryOn: boolean;
  internetAvailable: boolean;
  snapshot: ConnectivitySnapshot;
}

const INITIAL_SNAPSHOT: ConnectivitySnapshot = {
  label: 'noConnection',
  nearbyCount: 0,
  lastSeenMinutes: undefined,
  internetAvailable: false,
};

export function createConnectivityController(
  opts: ConnectivityControllerOptions,
): ConnectivityController {
  const scheduler = opts.scheduler ?? defaultScheduler;
  const publish =
    opts.publish ??
    ((snapshot: ConnectivitySnapshot) => {
      useConnectivityStore.getState().set(snapshot);
    });
  const nowIso = opts.nowIso ?? (() => new Date().toISOString());

  const state: InternalState = {
    started: false,
    attemptCount: 0,
    attemptInFlight: false,
    timer: null,
    groupFormed: false,
    connectedPeers: [],
    lastSeenAtMs: null,
    unsubscribe: null,
    discoveryOn: false,
    internetAvailable: false,
    snapshot: INITIAL_SNAPSHOT,
  };

  function hasLinkedPeers(): boolean {
    return DeviceRepo.listLinked(opts.db).length > 0;
  }

  function publishSnapshot(): void {
    const nowMs = scheduler.now();
    const lastSeenMinutes =
      state.lastSeenAtMs !== null && !state.groupFormed
        ? Math.max(0, Math.floor((nowMs - state.lastSeenAtMs) / 60_000))
        : undefined;
    const label: ConnectivitySnapshot['label'] = state.groupFormed
      ? 'localConnected'
      : state.attemptInFlight || state.timer !== null
        ? 'connecting'
        : state.lastSeenAtMs !== null
          ? 'lastSeen'
          : state.internetAvailable
            ? 'internet'
            : 'noConnection';
    const next: ConnectivitySnapshot = {
      label,
      nearbyCount: state.groupFormed ? state.connectedPeers.length : 0,
      lastSeenMinutes,
      internetAvailable: state.internetAvailable,
    };
    state.snapshot = next;
    publish(next);
  }

  function clearTimer(): void {
    if (state.timer !== null) {
      scheduler.clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function scheduleReconnect(): void {
    if (state.timer !== null) return;
    if (state.attemptInFlight) return;
    if (state.groupFormed) return;
    if (!hasLinkedPeers()) return;
    const delay = backoffDelayForAttempt(state.attemptCount);
    state.timer = scheduler.setTimeout(() => {
      state.timer = null;
      // Fire-and-forget: the attempt drives its own state transitions via
      // the manager event stream. Any thrown error is caught + logged.
      void runAttempt();
    }, delay);
    publishSnapshot();
  }

  async function runAttempt(): Promise<void> {
    if (state.attemptInFlight || state.groupFormed) return;
    if (!hasLinkedPeers()) return;
    state.attemptInFlight = true;
    publishSnapshot();
    try {
      // Prefer connecting to a currently-visible peer that matches a linked
      // device row (either by device address or by any visible peer if we
      // have no address at all). If nothing matches, refresh discovery so
      // the transport gets another chance to surface the peer.
      const linkedDevices = DeviceRepo.listLinked(opts.db);
      const target = pickTargetAddress(linkedDevices, state.connectedPeers);
      if (target !== null) {
        await opts.manager.connectToPeer(target);
        // We do not flip state here. The manager will emit
        // connectionChanged.groupFormed=true when the session actually
        // forms; that is the only signal that resets the backoff.
      } else if (!state.discoveryOn) {
        await opts.manager.startDiscovery();
        state.discoveryOn = true;
      }
    } catch (err) {
      console.warn(
        '[connectivity-controller] attempt failed:',
        err instanceof Error ? err.message : err,
      );
    } finally {
      state.attemptInFlight = false;
      if (!state.groupFormed) {
        // Only escalate backoff on a failed attempt. onConnectionFormed()
        // resets attemptCount to 0 when a session actually forms, and this
        // finally block must not undo that — otherwise the very next drop
        // would wait 5s instead of 2s.
        state.attemptCount += 1;
        scheduleReconnect();
      } else {
        publishSnapshot();
      }
    }
  }

  function pickTargetAddress(
    linked: readonly Device[],
    visible: readonly PeerHandle[],
  ): string | null {
    // First choice: a visible peer whose address matches a linked device's
    // last known address.
    const addressLookup = new Set(
      linked
        .map(d => d.lastKnownDeviceAddress)
        .filter((a): a is string => a !== null && a.length > 0),
    );
    for (const peer of visible) {
      if (addressLookup.has(peer.deviceAddress)) {
        return peer.deviceAddress;
      }
    }
    // Second choice: address recorded for the most-recently-linked device,
    // even if not currently visible — WFD may still be able to connect if
    // the peer is in range but hasn't been surfaced by discovery yet.
    for (const device of linked) {
      if (
        device.lastKnownDeviceAddress !== null &&
        device.lastKnownDeviceAddress.length > 0
      ) {
        return device.lastKnownDeviceAddress;
      }
    }
    // Third choice: if any visible peer exists at all, try it — after a
    // successful handshake we'll capture its address and future attempts
    // will be targeted.
    const first = visible[0];
    if (first) {
      return first.deviceAddress;
    }
    return null;
  }

  function refreshLinkedAddresses(): void {
    // For each currently-connected peer, if a linked device row exists that
    // does NOT yet have a last_known_device_address, patch it. We do this
    // opportunistically because there is no direct transport-layer
    // DeviceId ↔ deviceAddress correlation exposed today (D-078 §addressing).
    // If exactly one linked peer exists and exactly one peer is connected,
    // that pairing is unambiguous. Otherwise leave addresses alone rather
    // than guess.
    if (state.connectedPeers.length !== 1) return;
    const linked = DeviceRepo.listLinked(opts.db);
    if (linked.length !== 1) return;
    const device = linked[0];
    const peer = state.connectedPeers[0];
    if (!device || !peer) return;
    if (device.lastKnownDeviceAddress === peer.deviceAddress) return;
    DeviceRepo.updateLastKnownDeviceAddress(
      opts.db,
      device.id,
      peer.deviceAddress,
    );
  }

  function onConnectionFormed(): void {
    state.groupFormed = true;
    state.attemptCount = 0;
    state.lastSeenAtMs = scheduler.now();
    clearTimer();
    refreshLinkedAddresses();
    publishSnapshot();
  }

  function onConnectionLost(): void {
    if (state.groupFormed) {
      state.groupFormed = false;
      state.lastSeenAtMs = scheduler.now();
    }
    state.connectedPeers = [];
    publishSnapshot();
    scheduleReconnect();
  }

  function handleEvent(event: CommunicationEvent): void {
    switch (event.kind) {
      case 'peersChanged':
        state.connectedPeers = event.peers;
        refreshLinkedAddresses();
        publishSnapshot();
        return;
      case 'connectionChanged':
        if (event.snapshot.groupFormed) {
          onConnectionFormed();
        } else {
          onConnectionLost();
        }
        return;
      case 'stateChanged':
        // Nothing to do beyond snapshot refresh; groupFormed is the
        // authoritative signal.
        publishSnapshot();
        return;
      case 'error':
        console.warn(
          '[connectivity-controller] manager error:',
          event.message,
        );
        return;
      default:
        return;
    }
  }

  async function start(): Promise<void> {
    if (state.started) return;
    state.started = true;
    state.unsubscribe = opts.manager.on(handleEvent);
    if (hasLinkedPeers()) {
      try {
        if (opts.manager.currentState() === 'idle') {
          await opts.manager.initialize();
        }
        await opts.manager.startDiscovery();
        state.discoveryOn = true;
      } catch (err) {
        console.warn(
          '[connectivity-controller] initial discovery failed:',
          err instanceof Error ? err.message : err,
        );
      }
      scheduleReconnect();
    }
    publishSnapshot();
    // Silence unused-variable warning on nowIso — we use it only when
    // downstream persistence paths need it, which is currently limited to
    // markLinked in the responder (they receive nowIso separately).
    void nowIso;
  }

  async function stop(): Promise<void> {
    if (!state.started) return;
    state.started = false;
    clearTimer();
    if (state.unsubscribe) {
      state.unsubscribe();
      state.unsubscribe = null;
    }
    if (state.discoveryOn) {
      try {
        await opts.manager.stopDiscovery();
      } catch {
        // best-effort
      }
      state.discoveryOn = false;
    }
    state.connectedPeers = [];
    state.groupFormed = false;
    state.attemptCount = 0;
    state.attemptInFlight = false;
    publishSnapshot();
  }

  function setInternetAvailable(available: boolean): void {
    if (state.internetAvailable === available) return;
    state.internetAvailable = available;
    publishSnapshot();
  }

  function currentSnapshot(): ConnectivitySnapshot {
    return state.snapshot;
  }

  return { start, stop, currentSnapshot, setInternetAvailable };
}
