import type { OffgridDb } from '../../database';
import { DeviceRepo } from '../../database/repositories';
import type { DeviceId } from '../../types/ids';
import { CommunicationManager } from './CommunicationManager';
import {
  getActiveCommunicationManager,
  setActiveCommunicationManager,
} from './commsRuntime';
import { WifiP2pTransport } from './transports/WifiP2pTransport';
import type { Transport } from './types';
import {
  createConnectivityController,
  type ConnectivityController,
} from './connectivityController';
import { getNetInfoAdapter } from './netinfoAdapter';

// D-078. App-owned CommunicationManager lifecycle. Lazy on purpose:
//
//   - We do NOT construct the WifiP2pTransport at cold boot when no linked
//     peers exist yet. That would trigger the Wi-Fi / Location permission
//     prompt on Android before the user has done anything that motivates
//     it (fresh install → sees a permission modal before ever tapping
//     "Message this nearby device" — bad UX, and CLAUDE.md §31).
//
//   - If linked peers already exist at boot (i.e. the user has completed at
//     least one D-076 handshake in a previous session), the runtime WILL
//     eagerly initialize the transport so the reconnect loop can start
//     immediately. The permission surface is expected in that case because
//     the app is a proven communication app for that user.
//
//   - Screens (NearbyScreen, DiagnosticsScreen, ScanJoinQrScreen, join
//     flows) call `ensureConnectivityRuntimeStarted()` before they need the
//     manager. That call is idempotent — the runtime brings the manager up
//     exactly once for the app's lifetime, then keeps it up.

export interface StartConnectivityRuntimeOptions {
  readonly db: OffgridDb;
  readonly localDeviceId: DeviceId;
  readonly transportFactory?: () => Transport;
}

interface RuntimeState {
  db: OffgridDb;
  localDeviceId: DeviceId;
  transportFactory: () => Transport;
  manager: CommunicationManager | null;
  controller: ConnectivityController | null;
  netInfoUnsub: (() => void) | null;
  ensuringPromise: Promise<CommunicationManager | null> | null;
}

let state: RuntimeState | null = null;

// Exposed for tests only.
export function _resetConnectivityRuntimeForTests(): void {
  if (state) {
    if (state.controller) {
      void state.controller.stop();
    }
    if (state.netInfoUnsub) state.netInfoUnsub();
    if (state.manager) {
      void state.manager.dispose();
    }
  }
  state = null;
  setActiveCommunicationManager(null);
}

export function startConnectivityRuntime(
  options: StartConnectivityRuntimeOptions,
): void {
  if (state !== null) return;
  state = {
    db: options.db,
    localDeviceId: options.localDeviceId,
    transportFactory:
      options.transportFactory ?? (() => new WifiP2pTransport()),
    manager: null,
    controller: null,
    netInfoUnsub: null,
    ensuringPromise: null,
  };

  // If the user has already linked at least one peer in a prior session,
  // spin up the transport eagerly so we can start listening for reconnects.
  // Otherwise stay dormant — a screen will trigger us on demand.
  const linked = DeviceRepo.listLinked(options.db);
  if (linked.length > 0) {
    // Fire-and-forget: any failure is logged and the runtime remains
    // available for a later screen-triggered ensure() call.
    void ensureConnectivityRuntimeStarted().catch(err => {
      console.warn(
        '[connectivity-runtime] eager start failed:',
        err instanceof Error ? err.message : err,
      );
    });
  }
}

// Bring the CommunicationManager + ConnectivityController up if they are
// not already up. Idempotent — repeat callers get back the same manager.
export async function ensureConnectivityRuntimeStarted(): Promise<CommunicationManager | null> {
  if (state === null) return getActiveCommunicationManager();
  if (state.manager) return state.manager;
  if (state.ensuringPromise) return state.ensuringPromise;
  const promise = (async (): Promise<CommunicationManager | null> => {
    if (state === null) return null;
    const transport = state.transportFactory();
    const manager = new CommunicationManager({
      transport,
      db: state.db,
      localDeviceId: state.localDeviceId,
    });
    try {
      await manager.initialize();
    } catch (err) {
      console.warn(
        '[connectivity-runtime] manager init failed:',
        err instanceof Error ? err.message : err,
      );
      await manager.dispose().catch(() => undefined);
      state.ensuringPromise = null;
      return null;
    }
    const controller = createConnectivityController({
      db: state.db,
      manager,
    });
    await controller.start();

    // Wire the NetInfo signal into the controller. Adapter no-ops if the
    // native module isn't linked (see netinfoAdapter.ts).
    const netInfo = getNetInfoAdapter();
    state.netInfoUnsub = netInfo.subscribe(available => {
      controller.setInternetAvailable(available);
    });
    const current = netInfo.currentAvailability();
    if (current !== null) controller.setInternetAvailable(current);

    state.manager = manager;
    state.controller = controller;
    setActiveCommunicationManager(manager);
    state.ensuringPromise = null;
    return manager;
  })();
  state.ensuringPromise = promise;
  return promise;
}

export function getConnectivityController(): ConnectivityController | null {
  return state?.controller ?? null;
}
