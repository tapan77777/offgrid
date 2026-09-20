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
  };
}

export interface InsertGroupInput {
  id: GroupId;
  name: string;
  createdBy?: UserId | null;
  nowIso: string;
}

export function insertGroup(db: OffgridDb, input: InsertGroupInput): Group {
  db.execute(
    `INSERT INTO groups (id, name, created_by, created_at, updated_at, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [input.id, input.name, input.createdBy ?? null, input.nowIso, input.nowIso],
  );
  return requireById(db, input.id);
}

export function findGroupById(db: OffgridDb, id: GroupId): Group | null {
  const { rows } = db.execute('SELECT * FROM groups WHERE id = ?', [id]);
  const row = rows[0];
  return row ? toDomain(row as unknown as GroupRow) : null;
}

export function listGroups(db: OffgridDb): Group[] {
  const { rows } = db.execute('SELECT * FROM groups ORDER BY created_at ASC');
  return (rows as unknown as GroupRow[]).map(toDomain);
}

function requireById(db: OffgridDb, id: GroupId): Group {
  const found = findGroupById(db, id);
  if (!found) {
    throw new Error(`Group ${id} not found after write`);
  }
  return found;
}
