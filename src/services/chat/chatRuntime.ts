import type { OffgridDb } from '../../database';
import type { CommunicationManager } from '../communication/CommunicationManager';
import {
  getActiveCommunicationManager,
  subscribeToActiveCommunicationManager,
} from '../communication/commsRuntime';
import type { UserId } from '../../types/ids';
import { startChatMessageReceiver } from './chatMessageReceiver';
import { startChatOutbox, type ChatOutboxHandle } from './chatOutbox';

// Chat V1 runtime lifecycle (D-074).
//
// Bootstrap has no direct handle to a CommunicationManager — comms are set
// up by DiagnosticsScreen. This module subscribes to
// `subscribeToActiveCommunicationManager` and starts/stops the receiver and
// outbox in lockstep with whichever manager is currently registered.
//
// Idempotent: calling `startChatRuntime` a second time is a no-op. Bootstrap
// invokes it once at app start.

export interface StartChatRuntimeOptions {
  readonly db: OffgridDb;
  readonly localUserId: UserId;
  readonly tickIntervalMs?: number;
}

interface ActiveHandles {
  readonly unsubscribeReceiver: () => void;
  readonly outbox: ChatOutboxHandle;
}

let started = false;

// Exposed for tests only — allows resetting the singleton flag.
export function _resetChatRuntimeForTests(): void {
  started = false;
}

export function startChatRuntime(options: StartChatRuntimeOptions): void {
  if (started) return;
  started = true;

  let active: ActiveHandles | null = null;

  const attachToManager = (manager: CommunicationManager): void => {
    if (active) return;
    const unsubscribeReceiver = startChatMessageReceiver({
      db: options.db,
      manager,
      localUserId: options.localUserId,
    });
    const outbox = startChatOutbox({
      db: options.db,
      manager,
      ...(options.tickIntervalMs !== undefined
        ? { tickIntervalMs: options.tickIntervalMs }
        : {}),
    });
    active = { unsubscribeReceiver, outbox };
  };

  const detach = (): void => {
    if (!active) return;
    active.unsubscribeReceiver();
    active.outbox.stop();
    active = null;
  };

  // Attach to whatever is already registered before we subscribed.
  const initial = getActiveCommunicationManager();
  if (initial) attachToManager(initial);

  subscribeToActiveCommunicationManager(manager => {
    if (manager) {
      // The commsRuntime may swap managers; detach the old one before
      // attaching. In practice `setActiveCommunicationManager` early-returns
      // when the manager is unchanged, so we only enter this branch on a
      // real change.
      detach();
      attachToManager(manager);
    } else {
      detach();
    }
  });
}
