import type { OffgridDb } from '../sqlite/types';
import type { GroupRow } from '../models/rows';
import type { Group, GroupStatus } from '../../types/entities';
import type { GroupId, UserId } from '../../types/ids';

function toDomain(row: GroupRow): Group {
  return {
    id: row.id as GroupId,
    name: row.name,
    createdBy: row.created_by === null ? null : (row.created_by as UserId),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status as GroupStatus,
    isDirect: row.is_direct === 1,
  };
}

export interface InsertGroupInput {
  id: GroupId;
  name: string;
  createdBy?: UserId | null;
  nowIso: string;
  isDirect?: boolean;
}

export function insertGroup(db: OffgridDb, input: InsertGroupInput): Group {
  db.execute(
    `INSERT INTO groups (id, name, created_by, created_at, updated_at, status, is_direct)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [
      input.id,
      input.name,
      input.createdBy ?? null,
      input.nowIso,
      input.nowIso,
      input.isDirect ? 1 : 0,
    ],
  );
  return requireById(db, input.id);
}

export function findGroupById(db: OffgridDb, id: GroupId): Group | null {
  const { rows } = db.execute('SELECT * FROM groups WHERE id = ?', [id]);
  const row = rows[0];
  return row ? toDomain(row as unknown as GroupRow) : null;
}

// D-074: only returns a row when the group is flagged as a synthetic direct
// conversation. Callers that want a direct group specifically MUST use this,
// not `findGroupById`, so a regular group with a clashing id (impossible in
// practice given the derived namespace but defended anyway) cannot be
// mistaken for a DM.
export function findDirectGroupById(
  db: OffgridDb,
  id: GroupId,
): Group | null {
  const { rows } = db.execute(
    'SELECT * FROM groups WHERE id = ? AND is_direct = 1',
    [id],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as GroupRow) : null;
}

export function listGroups(db: OffgridDb): Group[] {
  const { rows } = db.execute('SELECT * FROM groups ORDER BY created_at ASC');
  return (rows as unknown as GroupRow[]).map(toDomain);
}

export function updateGroupName(
  db: OffgridDb,
  id: GroupId,
  name: string,
  nowIso: string,
): Group {
  db.execute('UPDATE groups SET name = ?, updated_at = ? WHERE id = ?', [
    name,
    nowIso,
    id,
  ]);
  return requireById(db, id);
}

function requireById(db: OffgridDb, id: GroupId): Group {
  const found = findGroupById(db, id);
  if (!found) {
    throw new Error(`Group ${id} not found after write`);
  }
  return found;
}
