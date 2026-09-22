import type { Migration } from './types';

// Additive, non-destructive: adds a new `group_location_sharing` table so
// each (group, user) has an explicit opt-in flag for local-first group
// location sharing (D-023 privacy + D-072 group sharing foundation).
//
// - UNIQUE(group_id, user_id) makes duplicate rows impossible; enable is an
//   idempotent UPSERT keyed on that pair.
// - Cascading deletes tie the row's lifetime to the group and the user, so
//   removing either cleans up cleanly.
// - Nothing in this milestone transmits location. This table is a *local*
//   authorization record that a future transport will consult before it
//   ever puts a coordinate on the wire.
const statements: readonly string[] = [
  `CREATE TABLE group_location_sharing (
    id TEXT NOT NULL PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(group_id, user_id)
  )`,
  'CREATE INDEX idx_group_location_sharing_group ON group_location_sharing(group_id)',
  'CREATE INDEX idx_group_location_sharing_user ON group_location_sharing(user_id)',
];

export const groupLocationSharing: Migration = {
  version: 4,
  name: '0004_group_location_sharing',
  statements,
};
