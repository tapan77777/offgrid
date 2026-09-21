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
