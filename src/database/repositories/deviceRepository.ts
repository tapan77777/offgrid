import type { OffgridDb } from '../sqlite/types';
import type { DeviceRow } from '../models/rows';
import type { Device, DevicePlatform } from '../../types/entities';
import type { DeviceId, UserId } from '../../types/ids';

function toDomain(row: DeviceRow): Device {
  return {
    id: row.id as DeviceId,
    userId: row.user_id === null ? null : (row.user_id as UserId),
    deviceName: row.device_name,
    platform: row.platform as DevicePlatform,
    appVersion: row.app_version,
    publicKey: row.public_key,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    linkedUserId:
      row.linked_user_id === null ? null : (row.linked_user_id as UserId),
    linkedAt: row.linked_at,
    lastKnownDeviceAddress: row.last_known_device_address,
  };
}

export interface InsertDeviceInput {
  id: DeviceId;
  userId?: UserId | null;
  deviceName?: string | null;
  platform: DevicePlatform;
  appVersion?: string | null;
  nowIso: string;
}

export function insertDevice(db: OffgridDb, input: InsertDeviceInput): Device {
  db.execute(
    `INSERT INTO devices
       (id, user_id, device_name, platform, app_version, public_key, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      input.id,
      input.userId ?? null,
      input.deviceName ?? null,
      input.platform,
      input.appVersion ?? null,
      input.nowIso,
      input.nowIso,
    ],
  );
  return requireById(db, input.id);
}

export function findDeviceById(db: OffgridDb, id: DeviceId): Device | null {
  const { rows } = db.execute('SELECT * FROM devices WHERE id = ?', [id]);
  const row = rows[0];
  return row ? toDomain(row as unknown as DeviceRow) : null;
}

export function touchDeviceLastSeen(
  db: OffgridDb,
  id: DeviceId,
  nowIso: string,
): void {
  db.execute('UPDATE devices SET last_seen_at = ? WHERE id = ?', [nowIso, id]);
}

export function setDeviceUserId(
  db: OffgridDb,
  id: DeviceId,
  userId: UserId | null,
): void {
  db.execute('UPDATE devices SET user_id = ? WHERE id = ?', [userId, id]);
}

function requireById(db: OffgridDb, id: DeviceId): Device {
  const found = findDeviceById(db, id);
  if (!found) {
    throw new Error(`Device ${id} not found after write`);
  }
  return found;
}

// ---- D-078 seamless connection: linked-peer helpers -----------------------

export interface MarkLinkedInput {
  deviceId: DeviceId;
  linkedUserId: UserId;
  lastKnownDeviceAddress?: string | null;
  nowIso: string;
}

// Marks a device as a linked peer. If the row does not exist yet we
// materialise a minimal placeholder so a later discovery event can enrich
// it. Existing linked_at is preserved on re-link — we only refresh
// last_seen_at and (optionally) last_known_device_address, otherwise a
// user who re-accepts a chat request would look like a brand-new link.
export function markLinked(db: OffgridDb, input: MarkLinkedInput): Device {
  const existing = findDeviceById(db, input.deviceId);
  if (existing === null) {
    db.execute(
      `INSERT INTO devices
         (id, user_id, device_name, platform, app_version, public_key,
          created_at, last_seen_at,
          linked_user_id, linked_at, last_known_device_address)
       VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
      [
        input.deviceId,
        input.linkedUserId,
        'other',
        input.nowIso,
        input.nowIso,
        input.linkedUserId,
        input.nowIso,
        input.lastKnownDeviceAddress ?? null,
      ],
    );
    return requireById(db, input.deviceId);
  }

  const preservedLinkedAt = existing.linkedAt ?? input.nowIso;
  const nextAddress =
    input.lastKnownDeviceAddress !== undefined
      ? input.lastKnownDeviceAddress
      : existing.lastKnownDeviceAddress;
  db.execute(
    `UPDATE devices
        SET user_id = COALESCE(user_id, ?),
            linked_user_id = ?,
            linked_at = ?,
            last_known_device_address = ?,
            last_seen_at = ?
      WHERE id = ?`,
    [
      input.linkedUserId,
      input.linkedUserId,
      preservedLinkedAt,
      nextAddress,
      input.nowIso,
      input.deviceId,
    ],
  );
  return requireById(db, input.deviceId);
}

export function unlink(db: OffgridDb, id: DeviceId): void {
  db.execute(
    `UPDATE devices
        SET linked_user_id = NULL,
            linked_at = NULL
      WHERE id = ?`,
    [id],
  );
}

export function updateLastKnownDeviceAddress(
  db: OffgridDb,
  id: DeviceId,
  deviceAddress: string | null,
): void {
  db.execute(
    'UPDATE devices SET last_known_device_address = ? WHERE id = ?',
    [deviceAddress, id],
  );
}

export function listLinked(db: OffgridDb): Device[] {
  const { rows } = db.execute(
    `SELECT * FROM devices
      WHERE linked_user_id IS NOT NULL
      ORDER BY linked_at DESC`,
  );
  return rows.map(r => toDomain(r as unknown as DeviceRow));
}

export function findLinkedByDeviceAddress(
  db: OffgridDb,
  deviceAddress: string,
): Device | null {
  const { rows } = db.execute(
    `SELECT * FROM devices
      WHERE linked_user_id IS NOT NULL
        AND last_known_device_address = ?
      LIMIT 1`,
    [deviceAddress],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as DeviceRow) : null;
}

export function findLinkedByUserId(
  db: OffgridDb,
  userId: UserId,
): Device | null {
  const { rows } = db.execute(
    `SELECT * FROM devices
      WHERE linked_user_id = ?
      ORDER BY linked_at DESC
      LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as DeviceRow) : null;
}
