import type { OffgridDb } from '../sqlite/types';
import type { MessageRow } from '../models/rows';
import type {
  Message,
  MessageDeliveryStatus,
  MessageSyncStatus,
  MessageType,
} from '../../types/entities';
import type {
  DeviceId,
  GroupId,
  MessageId,
  UserId,
} from '../../types/ids';

function toDomain(row: MessageRow): Message {
  return {
    id: row.id as MessageId,
    groupId: row.group_id as GroupId,
    senderId: row.sender_id as UserId,
    senderDeviceId:
      row.sender_device_id === null ? null : (row.sender_device_id as DeviceId),
    messageType: row.message_type as MessageType,
    payload: row.payload,
    createdAt: row.created_at,
    receivedAt: row.received_at,
    ttl: row.ttl,
    hopCount: row.hop_count,
    deliveryStatus: row.delivery_status as MessageDeliveryStatus,
    syncStatus: row.sync_status as MessageSyncStatus,
  };
}

export interface InsertMessageInput {
  id: MessageId;
  groupId: GroupId;
  senderId: UserId;
  senderDeviceId?: DeviceId | null;
  messageType: MessageType;
  payload: string;
  createdAt: string;
  ttl?: number | null;
  deliveryStatus?: MessageDeliveryStatus;
}

export function insertMessage(db: OffgridDb, input: InsertMessageInput): Message {
  db.execute(
    `INSERT INTO messages
       (id, group_id, sender_id, sender_device_id, message_type, payload,
        created_at, received_at, ttl, hop_count, delivery_status, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, 'NOT_SYNCED')`,
    [
      input.id,
      input.groupId,
      input.senderId,
      input.senderDeviceId ?? null,
      input.messageType,
      input.payload,
      input.createdAt,
      input.ttl ?? null,
      input.deliveryStatus ?? 'LOCAL',
    ],
  );
  return requireById(db, input.id);
}

export function insertMessageIfAbsent(
  db: OffgridDb,
  input: InsertMessageInput,
): { inserted: boolean; message: Message } {
  const existing = findMessageById(db, input.id);
  if (existing) {
    return { inserted: false, message: existing };
  }
  const inserted = insertMessage(db, input);
  return { inserted: true, message: inserted };
}

export function findMessageById(db: OffgridDb, id: MessageId): Message | null {
  const { rows } = db.execute('SELECT * FROM messages WHERE id = ?', [id]);
  const row = rows[0];
  return row ? toDomain(row as unknown as MessageRow) : null;
}

export function listMessagesForGroup(db: OffgridDb, groupId: GroupId): Message[] {
  const { rows } = db.execute(
    'SELECT * FROM messages WHERE group_id = ? ORDER BY created_at ASC',
    [groupId],
  );
  return (rows as unknown as MessageRow[]).map(toDomain);
}

// Chat V1 (D-074). Return the most recent `limit` rows for the conversation
// in ASC order (oldest → newest). When `limit` is omitted, behaves the same
// as `listMessagesForGroup`. We do NOT paginate deeper than `limit` in V1 —
// the UI shows a fixed-size tail.
export function listConversation(
  db: OffgridDb,
  groupId: GroupId,
  limit?: number,
): Message[] {
  if (limit === undefined) {
    return listMessagesForGroup(db, groupId);
  }
  // Take the last N rows in DESC, then flip to ASC for rendering.
  const { rows } = db.execute(
    'SELECT * FROM messages WHERE group_id = ? ORDER BY created_at DESC LIMIT ?',
    [groupId, limit],
  );
  const messages = (rows as unknown as MessageRow[]).map(toDomain);
  return messages.reverse();
}

// Chat V1 outbox. LOCAL rows are the ones the sender has persisted but not
// yet handed to a live transport. The outbox scanner uses this to attempt a
// resend when a manager comes online, and to age out stale rows to FAILED
// after `CHAT_OUTBOX_LOCAL_TIMEOUT_MS`.
export function listOutbox(db: OffgridDb): Message[] {
  const { rows } = db.execute(
    `SELECT * FROM messages
     WHERE delivery_status = 'LOCAL'
     ORDER BY created_at ASC`,
  );
  return (rows as unknown as MessageRow[]).map(toDomain);
}

export function updateDeliveryStatus(
  db: OffgridDb,
  id: MessageId,
  status: MessageDeliveryStatus,
): Message {
  db.execute('UPDATE messages SET delivery_status = ? WHERE id = ?', [
    status,
    id,
  ]);
  return requireById(db, id);
}

function requireById(db: OffgridDb, id: MessageId): Message {
  const found = findMessageById(db, id);
  if (!found) {
    throw new Error(`Message ${id} not found after write`);
  }
  return found;
}
