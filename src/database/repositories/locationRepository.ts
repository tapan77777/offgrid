import type { OffgridDb } from '../sqlite/types';
import type { LocationRow } from '../models/rows';
import type {
  Location,
  LocationSource,
  LocationSyncStatus,
} from '../../types/entities';
import type {
  DeviceId,
  GroupId,
  LocationId,
  UserId,
} from '../../types/ids';

function toDomain(row: LocationRow): Location {
  return {
    id: row.id as LocationId,
    userId: row.user_id as UserId,
    deviceId: row.device_id === null ? null : (row.device_id as DeviceId),
    groupId: row.group_id === null ? null : (row.group_id as GroupId),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    altitude: row.altitude,
    heading: row.heading,
    speed: row.speed,
    source: row.source as LocationSource,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    syncStatus: row.sync_status as LocationSyncStatus,
  };
}

export interface InsertLocationInput {
  id: LocationId;
  userId: UserId;
  deviceId?: DeviceId | null;
  groupId?: GroupId | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  source: LocationSource;
  createdAt: string;
  expiresAt?: string | null;
  syncStatus?: LocationSyncStatus;
}

export function insertLocation(
  db: OffgridDb,
  input: InsertLocationInput,
): Location {
  validateCoordinates(input.latitude, input.longitude);
  db.execute(
    `INSERT INTO locations
       (id, user_id, device_id, group_id, latitude, longitude,
        accuracy, altitude, heading, speed, source, created_at,
        expires_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.userId,
      input.deviceId ?? null,
      input.groupId ?? null,
      input.latitude,
      input.longitude,
      input.accuracy ?? null,
      input.altitude ?? null,
      input.heading ?? null,
      input.speed ?? null,
      input.source,
      input.createdAt,
      input.expiresAt ?? null,
      input.syncStatus ?? 'NOT_SYNCED',
    ],
  );
  return requireById(db, input.id);
}

// Idempotent variant used by the peer-receive path: if a row with this id
// already exists (same envelope re-delivered through discovery churn), keep
// the first-write and report inserted=false. Deduplication key is the
// application-level location id, which is the envelope id on the wire
// (D-060 UUIDv7).
export function insertLocationIfAbsent(
  db: OffgridDb,
  input: InsertLocationInput,
): { location: Location; inserted: boolean } {
  const existing = findLocationById(db, input.id);
  if (existing) {
    return { location: existing, inserted: false };
  }
  const location = insertLocation(db, input);
  return { location, inserted: true };
}

export function findLocationById(
  db: OffgridDb,
  id: LocationId,
): Location | null {
  const { rows } = db.execute('SELECT * FROM locations WHERE id = ?', [id]);
  const row = rows[0];
  return row ? toDomain(row as unknown as LocationRow) : null;
}

export function findLatestForUser(
  db: OffgridDb,
  userId: UserId,
): Location | null {
  const { rows } = db.execute(
    `SELECT * FROM locations
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as LocationRow) : null;
}

export function findLatestForGroup(
  db: OffgridDb,
  groupId: GroupId,
): Location | null {
  const { rows } = db.execute(
    `SELECT * FROM locations
     WHERE group_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [groupId],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as LocationRow) : null;
}

// Latest peer-received row for (group_id, user_id). Only rows with
// source='peer' are considered so that a user's own local GPS row (which
// carries the same user_id but source='gps') can never be surfaced as a
// "peer location" on the map.
export function findLatestPeerLocationForGroup(
  db: OffgridDb,
  groupId: GroupId,
  userId: UserId,
): Location | null {
  const { rows } = db.execute(
    `SELECT * FROM locations
     WHERE group_id = ? AND user_id = ? AND source = 'peer'
     ORDER BY created_at DESC
     LIMIT 1`,
    [groupId, userId],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as LocationRow) : null;
}

export function listRecentForUser(
  db: OffgridDb,
  userId: UserId,
  limit: number,
): Location[] {
  const { rows } = db.execute(
    `SELECT * FROM locations
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit],
  );
  return (rows as unknown as LocationRow[]).map(toDomain);
}

export function deleteExpired(db: OffgridDb, nowIso: string): number {
  const { rows: before } = db.execute(
    'SELECT COUNT(*) AS c FROM locations WHERE expires_at IS NOT NULL AND expires_at < ?',
    [nowIso],
  );
  const raw = (before[0] as { c?: number | string } | undefined)?.c ?? 0;
  const count = typeof raw === 'number' ? raw : parseInt(raw, 10);
  db.execute(
    'DELETE FROM locations WHERE expires_at IS NOT NULL AND expires_at < ?',
    [nowIso],
  );
  return count;
}

function validateCoordinates(latitude: number, longitude: number): void {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      `Invalid coordinates: latitude=${latitude}, longitude=${longitude}`,
    );
  }
}

function requireById(db: OffgridDb, id: LocationId): Location {
  const found = findLocationById(db, id);
  if (!found) {
    throw new Error(`Location ${id} not found after write`);
  }
  return found;
}
