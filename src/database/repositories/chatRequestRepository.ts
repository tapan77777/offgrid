import type { OffgridDb } from '../sqlite/types';
import type { ChatRequestRow } from '../models/rows';
import type {
  ChatRequest,
  ChatRequestDirection,
  ChatRequestStatus,
} from '../../types/entities';
import type { MessageId, UserId } from '../../types/ids';

// D-076. Persistence for the 1-to-1 chat request handshake.
//
// The row `id` equals the wire-level `requestId` so both peers converge on
// the same row without a handshake token. Callers are responsible for
// ensuring the users referenced by requesterUserId / recipientUserId exist —
// the responder does this before inserting an incoming row.

function toDomain(row: ChatRequestRow): ChatRequest {
  return {
    id: row.id as MessageId,
    requesterUserId: row.requester_user_id as UserId,
    recipientUserId: row.recipient_user_id as UserId,
    requesterDisplayName: row.requester_display_name,
    direction: row.direction as ChatRequestDirection,
    status: row.status as ChatRequestStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertChatRequestInput {
  id: MessageId;
  requesterUserId: UserId;
  recipientUserId: UserId;
  requesterDisplayName: string;
  direction: ChatRequestDirection;
  nowIso: string;
}

export function insertChatRequest(
  db: OffgridDb,
  input: InsertChatRequestInput,
): ChatRequest {
  db.execute(
    `INSERT INTO chat_requests
       (id, requester_user_id, recipient_user_id, requester_display_name,
        direction, status, created_at, resolved_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, ?)`,
    [
      input.id,
      input.requesterUserId,
      input.recipientUserId,
      input.requesterDisplayName,
      input.direction,
      input.nowIso,
      input.nowIso,
    ],
  );
  return requireById(db, input.id);
}

export function findChatRequestById(
  db: OffgridDb,
  id: MessageId,
): ChatRequest | null {
  const { rows } = db.execute('SELECT * FROM chat_requests WHERE id = ?', [id]);
  const row = rows[0];
  return row ? toDomain(row as unknown as ChatRequestRow) : null;
}

export function findPendingBetween(
  db: OffgridDb,
  requesterUserId: UserId,
  recipientUserId: UserId,
): ChatRequest | null {
  const { rows } = db.execute(
    `SELECT * FROM chat_requests
     WHERE requester_user_id = ? AND recipient_user_id = ? AND status = 'pending'
     LIMIT 1`,
    [requesterUserId, recipientUserId],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as ChatRequestRow) : null;
}

export function listIncomingPending(
  db: OffgridDb,
  recipientUserId: UserId,
): ChatRequest[] {
  const { rows } = db.execute(
    `SELECT * FROM chat_requests
     WHERE recipient_user_id = ? AND direction = 'incoming' AND status = 'pending'
     ORDER BY created_at ASC`,
    [recipientUserId],
  );
  return (rows as unknown as ChatRequestRow[]).map(toDomain);
}

export function listOutgoingPending(
  db: OffgridDb,
  requesterUserId: UserId,
): ChatRequest[] {
  const { rows } = db.execute(
    `SELECT * FROM chat_requests
     WHERE requester_user_id = ? AND direction = 'outgoing' AND status = 'pending'
     ORDER BY created_at ASC`,
    [requesterUserId],
  );
  return (rows as unknown as ChatRequestRow[]).map(toDomain);
}

export function updateChatRequestStatus(
  db: OffgridDb,
  id: MessageId,
  status: ChatRequestStatus,
  nowIso: string,
): ChatRequest {
  const resolvedAt = status === 'pending' ? null : nowIso;
  db.execute(
    `UPDATE chat_requests
     SET status = ?, resolved_at = ?, updated_at = ?
     WHERE id = ?`,
    [status, resolvedAt, nowIso, id],
  );
  return requireById(db, id);
}

function requireById(db: OffgridDb, id: MessageId): ChatRequest {
  const found = findChatRequestById(db, id);
  if (!found) {
    throw new Error(`ChatRequest ${id} not found after write`);
  }
  return found;
}
