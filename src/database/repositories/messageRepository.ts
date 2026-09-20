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

function requireById(db: OffgridDb, id: MessageId): Message {
  const found = findMessageById(db, id);
  if (!found) {
    throw new Error(`Message ${id} not found after write`);
  }
  return found;
}
