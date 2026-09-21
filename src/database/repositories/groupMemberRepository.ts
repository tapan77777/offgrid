import type { OffgridDb } from '../sqlite/types';
import type { GroupMemberRow } from '../models/rows';
import type {
  GroupMember,
  GroupMemberRole,
  GroupMemberStatus,
} from '../../types/entities';
import type { GroupId, GroupMemberId, UserId } from '../../types/ids';

function toDomain(row: GroupMemberRow): GroupMember {
  return {
    id: row.id as GroupMemberId,
    groupId: row.group_id as GroupId,
    userId: row.user_id as UserId,
    role: row.role as GroupMemberRole,
    status: row.status as GroupMemberStatus,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertGroupMemberInput {
  id: GroupMemberId;
  groupId: GroupId;
  userId: UserId;
  role: GroupMemberRole;
  nowIso: string;
}

export function insertGroupMember(
  db: OffgridDb,
  input: InsertGroupMemberInput,
): GroupMember {
  db.execute(
    `INSERT INTO group_members
       (id, group_id, user_id, role, status, joined_at, left_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, NULL, ?)`,
    [input.id, input.groupId, input.userId, input.role, input.nowIso, input.nowIso],
  );
  return requireById(db, input.id);
}

export function findGroupMemberById(
  db: OffgridDb,
  id: GroupMemberId,
): GroupMember | null {
  const { rows } = db.execute('SELECT * FROM group_members WHERE id = ?', [id]);
  const row = rows[0];
  return row ? toDomain(row as unknown as GroupMemberRow) : null;
}

export function findMembership(
  db: OffgridDb,
  groupId: GroupId,
  userId: UserId,
): GroupMember | null {
  const { rows } = db.execute(
    'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId],
  );
  const row = rows[0];
  return row ? toDomain(row as unknown as GroupMemberRow) : null;
}

export function listActiveMembersForGroup(
  db: OffgridDb,
  groupId: GroupId,
): GroupMember[] {
  const { rows } = db.execute(
    `SELECT * FROM group_members
     WHERE group_id = ? AND status = 'active'
     ORDER BY joined_at ASC`,
    [groupId],
  );
  return (rows as unknown as GroupMemberRow[]).map(toDomain);
}

export function listActiveMembershipsForUser(
  db: OffgridDb,
  userId: UserId,
): GroupMember[] {
  const { rows } = db.execute(
    `SELECT * FROM group_members
     WHERE user_id = ? AND status = 'active'
     ORDER BY joined_at ASC`,
    [userId],
  );
  return (rows as unknown as GroupMemberRow[]).map(toDomain);
}

export function countActiveMembersInGroup(
  db: OffgridDb,
  groupId: GroupId,
): number {
  const { rows } = db.execute(
    `SELECT COUNT(*) AS c FROM group_members
     WHERE group_id = ? AND status = 'active'`,
    [groupId],
  );
  const raw = (rows[0] as { c?: number | string } | undefined)?.c ?? 0;
  return typeof raw === 'number' ? raw : parseInt(raw, 10);
}

export function markMembershipLeft(
  db: OffgridDb,
  id: GroupMemberId,
  nowIso: string,
): GroupMember {
  db.execute(
    `UPDATE group_members
     SET status = 'left', left_at = ?, updated_at = ?
     WHERE id = ?`,
    [nowIso, nowIso, id],
  );
  return requireById(db, id);
}

export function markMembershipRemoved(
  db: OffgridDb,
  id: GroupMemberId,
  nowIso: string,
): GroupMember {
  db.execute(
    `UPDATE group_members
     SET status = 'removed', left_at = ?, updated_at = ?
     WHERE id = ?`,
    [nowIso, nowIso, id],
  );
  return requireById(db, id);
}

export function reactivateMembership(
  db: OffgridDb,
  id: GroupMemberId,
  role: GroupMemberRole,
  nowIso: string,
): GroupMember {
  db.execute(
    `UPDATE group_members
     SET status = 'active', role = ?, left_at = NULL, joined_at = ?, updated_at = ?
     WHERE id = ?`,
    [role, nowIso, nowIso, id],
  );
  return requireById(db, id);
}

export function setMembershipRole(
  db: OffgridDb,
  id: GroupMemberId,
  role: GroupMemberRole,
  nowIso: string,
): GroupMember {
  db.execute(
    'UPDATE group_members SET role = ?, updated_at = ? WHERE id = ?',
    [role, nowIso, id],
  );
  return requireById(db, id);
}

function requireById(db: OffgridDb, id: GroupMemberId): GroupMember {
  const found = findGroupMemberById(db, id);
  if (!found) {
    throw new Error(`GroupMember ${id} not found after write`);
  }
  return found;
}
