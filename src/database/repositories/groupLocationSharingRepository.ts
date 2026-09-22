import type { OffgridDb } from '../sqlite/types';
import type { GroupLocationSharingRow } from '../models/rows';
import type { GroupLocationSharing } from '../../types/entities';
import type {
  GroupId,
  GroupLocationSharingId,
  UserId,
} from '../../types/ids';

function toDomain(row: GroupLocationSharingRow): GroupLocationSharing {
  return {
    id: row.id as GroupLocationSharingId,
    groupId: row.group_id as GroupId,
    userId: row.user_id as UserId,
    // SQLite stores 0/1; adapters occasionally return this as string, so
    // normalise defensively before comparing.
    enabled: Number(row.enabled) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertSharingInput {
  id: GroupLocationSharingId;
  groupId: GroupId;
  userId: UserId;
  enabled: boolean;
  nowIso: string;
}

// UNIQUE(group_id, user_id) means a single (group, user) can have at most
// one row; the UPSERT below preserves that invariant and updates the
// `enabled` bit + `updated_at` on repeat calls (satisfies "no duplicate
// sharing state records").
export function upsertSharing(
  db: OffgridDb,
  input: UpsertSharingInput,
): GroupLocationSharing {
  db.execute(
    `INSERT INTO group_location_sharing
       (id, group_id, user_id, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_id, user_id) DO UPDATE SET
       enabled = excluded.enabled,
       updated_at = excluded.updated_at`,
    [
      input.id,
      input.groupId,
      input.userId,
      input.enabled ? 1 : 0,
      input.nowIso,
      input.nowIso,
    ],
  );
  const found = findSharing(db, input.groupId, input.userId);
  if (!found) {
    throw new Error(
      `GroupLocationSharing missing after upsert for (${input.groupId}, ${input.userId})`,
    );
  }
  return found;
}

export function findSharing(
  db: OffgridDb,
  groupId: GroupId,
  userId: UserId,
): GroupLocationSharing | null {
  const { rows } = db.execute(
    'SELECT * FROM group_location_sharing WHERE group_id = ? AND user_id = ?',
    [groupId, userId],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as GroupLocationSharingRow) : null;
}

export function listSharingForUser(
  db: OffgridDb,
  userId: UserId,
): GroupLocationSharing[] {
  const { rows } = db.execute(
    'SELECT * FROM group_location_sharing WHERE user_id = ? ORDER BY updated_at DESC',
    [userId],
  );
  return (rows as unknown as GroupLocationSharingRow[]).map(toDomain);
}

export function listSharingForGroup(
  db: OffgridDb,
  groupId: GroupId,
): GroupLocationSharing[] {
  const { rows } = db.execute(
    'SELECT * FROM group_location_sharing WHERE group_id = ? ORDER BY updated_at DESC',
    [groupId],
  );
  return (rows as unknown as GroupLocationSharingRow[]).map(toDomain);
}

export function countRows(db: OffgridDb): number {
  const { rows } = db.execute(
    'SELECT COUNT(*) AS c FROM group_location_sharing',
  );
  const raw = (rows[0] as { c?: number | string } | undefined)?.c ?? 0;
  return typeof raw === 'number' ? raw : parseInt(raw, 10);
}
