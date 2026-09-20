import type { OffgridDb } from '../sqlite/types';
import type { UserRow } from '../models/rows';
import type { User } from '../../types/entities';
import type { UserId } from '../../types/ids';

function toDomain(row: UserRow): User {
  return {
    id: row.id as UserId,
    displayName: row.display_name,
    avatarUri: row.avatar_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertUserInput {
  id: UserId;
  displayName: string;
  avatarUri?: string | null;
  nowIso: string;
}

export function insertUser(db: OffgridDb, input: InsertUserInput): User {
  db.execute(
    `INSERT INTO users (id, display_name, avatar_uri, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.id,
      input.displayName,
      input.avatarUri ?? null,
      input.nowIso,
      input.nowIso,
    ],
  );
  const row = requireById(db, input.id);
  return row;
}

export function findUserById(db: OffgridDb, id: UserId): User | null {
  const { rows } = db.execute('SELECT * FROM users WHERE id = ?', [id]);
  const row = rows[0];
  return row ? toDomain(row as unknown as UserRow) : null;
}

export function listUsers(db: OffgridDb): User[] {
  const { rows } = db.execute('SELECT * FROM users ORDER BY created_at ASC');
  return (rows as unknown as UserRow[]).map(toDomain);
}

export function updateUserDisplayName(
  db: OffgridDb,
  id: UserId,
  displayName: string,
  nowIso: string,
): User {
  db.execute(
    'UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?',
    [displayName, nowIso, id],
  );
  return requireById(db, id);
}

function requireById(db: OffgridDb, id: UserId): User {
  const found = findUserById(db, id);
  if (!found) {
    throw new Error(`User ${id} not found after write`);
  }
  return found;
}
