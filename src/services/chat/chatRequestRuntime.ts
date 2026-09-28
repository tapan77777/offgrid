import type { OffgridDb } from '../../database';
import type { CommunicationManager } from '../communication/CommunicationManager';
import {
  getActiveCommunicationManager,
  subscribeToActiveCommunicationManager,
} from '../communication/commsRuntime';
import type { UserId } from '../../types/ids';
import { startChatRequestResponder } from './chatRequestResponder';

// Chat request V1 runtime lifecycle (D-076).
//
// Same pattern as chatRuntime / groupJoinRuntime: attach the responder to
// whichever CommunicationManager is currently registered. Idempotent —
// calling `startChatRequestRuntime` a second time is a no-op. Bootstrap
// invokes it once at app start.

export interface StartChatRequestRuntimeOptions {
  readonly db: OffgridDb;
  readonly localUserId: UserId;
}

let started = false;

// Exposed for tests only — allows resetting the singleton flag.
export function _resetChatRequestRuntimeForTests(): void {
  started = false;
}

export function startChatRequestRuntime(
  options: StartChatRequestRuntimeOptions,
): void {
  if (started) return;
  started = true;

  let unsubscribeResponder: (() => void) | null = null;

  const attach = (manager: CommunicationManager): void => {
    if (unsubscribeResponder) return;
    unsubscribeResponder = startChatRequestResponder({
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
