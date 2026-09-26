import type { Migration } from './types';

// Additive: adds a boolean marker to `groups` to distinguish the synthetic
// private groups created for direct 1-to-1 chat (D-074) from regular
// user-created groups. The column defaults to 0 so every existing row keeps
// its current meaning without a data migration.
//
// The direct-group id is derived deterministically from the sorted pair of
// userIds (see `src/utils/ids/directGroupId.ts`) so both devices can create
// or look up the same row without a handshake. The `is_direct` bit lets
// application code enforce the invariant that direct groups always have
// exactly two active members and are not editable like regular groups.
//
// Rollback safety: this migration only adds a column with a safe default and
// an index. Downgrading to schema v4 tolerates the extra column existing
// (SQLite ignores unknown columns in existing INSERT statements). No data
// deletion or column removal occurs on downgrade.
const statements: readonly string[] = [
  `ALTER TABLE groups ADD COLUMN is_direct INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX idx_groups_is_direct ON groups(is_direct)`,
];

export const directConversations: Migration = {
  version: 5,
  name: '0005_direct_conversations',
  statements,
};
