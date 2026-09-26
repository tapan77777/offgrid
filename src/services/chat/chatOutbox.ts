import type { OffgridDb } from '../../database';
import { MessageRepo } from '../../database/repositories';
import type { CommunicationManager } from '../communication/CommunicationManager';
import type { MsgTextBody } from '../../types/communication';
import type { Message } from '../../types/entities';
import type { GroupId, MessageId, UserId } from '../../types/ids';

// Chat V1 outbox (D-074).
//
// Behavior on each tick:
//   1. Read all LOCAL messages via `MessageRepo.listOutbox()`.
//   2. For each row:
//        - If age exceeds `CHAT_OUTBOX_LOCAL_TIMEOUT_MS`, mark FAILED. The
//          user's data is preserved (payload untouched), only the delivery
//          state changes so the UI can be honest (CLAUDE.md §14).
//        - Otherwise, if a live CommunicationManager is available and in a
//          connected state, reconstruct the envelope body from the row and
//          attempt a send. On success flip LOCAL → SENT.
//        - Otherwise leave the row LOCAL; the next tick tries again.
//
// The outbox NEVER upgrades a message to DELIVERED. There is no
// application-level ACK in V1.

export const CHAT_OUTBOX_LOCAL_TIMEOUT_MS = 60_000;

export interface StartChatOutboxOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager | null;
  readonly tickIntervalMs?: number;
  readonly now?: () => number;
}

export interface ChatOutboxHandle {
  stop(): void;
}

const DEFAULT_TICK_MS = 5000;

export function startChatOutbox(
  options: StartChatOutboxOptions,
): ChatOutboxHandle {
  const tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_MS;
  const now = options.now ?? (() => Date.now());

  // Latest reference to the manager. We accept null at start; a runtime
  // owner (chatRuntime) can call `updateManager` between ticks in future
  // work, but in V1 we simply capture what was passed in.
  let manager: CommunicationManager | null = options.manager;

  const runOnce = async (): Promise<void> => {
    try {
      await tick(options.db, manager, now);
    } catch {
      // Never let outbox errors crash the runtime. The tick is best-effort
      // and idempotent — the next tick will re-scan.
    }
  };

  const handle = setInterval(() => {
    void runOnce();
  }, tickIntervalMs);

  return {
    stop(): void {
      clearInterval(handle);
      manager = null;
    },
  };
}

async function tick(
  db: OffgridDb,
  manager: CommunicationManager | null,
  now: () => number,
): Promise<void> {
  const rows = MessageRepo.listOutbox(db);
  const currentMs = now();
  for (const row of rows) {
    if (row.messageType !== 'text') {
      // The outbox is chat-scoped in V1. Non-text LOCAL rows belong to
      // other pipelines; leave them alone.
      continue;
    }
    const createdAt = Date.parse(row.createdAt);
    if (Number.isFinite(createdAt) && currentMs - createdAt > CHAT_OUTBOX_LOCAL_TIMEOUT_MS) {
      MessageRepo.updateDeliveryStatus(db, row.id, 'FAILED');
      continue;
    }
    if (!manager) continue;
    if (manager.currentState() !== 'connected') continue;
    const body = reconstructMsgTextBody(row);
    if (!body) continue;
    try {
      await manager.sendChatTextEnvelope(body);
      MessageRepo.updateDeliveryStatus(db, row.id, 'SENT');
    } catch {
      // Leave LOCAL. Next tick will retry, or the age-out branch will
      // mark FAILED once we cross the timeout.
    }
  }
}

function reconstructMsgTextBody(row: Message): MsgTextBody | null {
  const text = row.payload;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }
  return {
    kind: 'msg.text',
    payload: {
      groupId: row.groupId as GroupId,
      senderUserId: row.senderId as UserId,
      messageId: row.id as MessageId,
      text,
      createdAt: row.createdAt,
    },
  };
}
