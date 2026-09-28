import type { OffgridDb } from '../../database';
import type { CommunicationManager } from '../communication/CommunicationManager';
import {
  getActiveCommunicationManager,
  subscribeToActiveCommunicationManager,
} from '../communication/commsRuntime';
import type { UserId } from '../../types/ids';
import { startGroupJoinResponder } from './groupJoinResponder';

// Group join V1 runtime lifecycle (D-075).
//
// Mirrors chatRuntime.ts: subscribe to whichever CommunicationManager is
// currently registered via commsRuntime and attach the responder to it.
// Idempotent — calling `startGroupJoinRuntime` a second time is a no-op.
// Bootstrap invokes it once at app start.

export interface StartGroupJoinRuntimeOptions {
  readonly db: OffgridDb;
  readonly localUserId: UserId;
}

let started = false;

// Exposed for tests only — allows resetting the singleton flag.
export function _resetGroupJoinRuntimeForTests(): void {
  started = false;
}

export function startGroupJoinRuntime(
  options: StartGroupJoinRuntimeOptions,
): void {
  if (started) return;
  started = true;

  let unsubscribeResponder: (() => void) | null = null;

  const attach = (manager: CommunicationManager): void => {
    if (unsubscribeResponder) return;
    unsubscribeResponder = startGroupJoinResponder({
      db: options.db,
      manager,
      localUserId: options.localUserId,
    });
  };

  const detach = (): void => {
    if (!unsubscribeResponder) return;
    unsubscribeResponder();
    unsubscribeResponder = null;
  };

  const initial = getActiveCommunicationManager();
  if (initial) attach(initial);

  subscribeToActiveCommunicationManager(manager => {
    if (manager) {
      detach();
      attach(manager);
    } else {
      detach();
    }
  });
}
