import type { OffgridDb } from '../sqlite/types';
import type { Migration } from './types';
import { initialSchema } from './0001_initial_schema';
import { phase3DiagnosticsFlag } from './0002_phase3_diagnostics_flag';
import { locationKinematics } from './0003_location_kinematics';
import { groupLocationSharing } from './0004_group_location_sharing';
import { directConversations } from './0005_direct_conversations';

export const allMigrations: readonly Migration[] = [
  initialSchema,
  phase3DiagnosticsFlag,
  locationKinematics,
  groupLocationSharing,
  directConversations,
];

const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

export interface MigrationReport {
  readonly appliedVersions: readonly number[];
  readonly currentVersion: number;
}

export function runMigrations(
  db: OffgridDb,
  migrations: readonly Migration[] = allMigrations,
  nowIso: () => string = () => new Date().toISOString(),
): MigrationReport {
  db.execute(CREATE_MIGRATIONS_TABLE);

  const appliedRows = db.execute(
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  ).rows;
  const applied = new Set<number>(
    appliedRows.map(r => Number(r.version)),
  );

  const pending = migrations
    .filter(m => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  const newlyApplied: number[] = [];
  for (const migration of pending) {
    db.transaction(tx => {
      for (const stmt of migration.statements) {
        tx.execute(stmt);
      }
      tx.execute(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        [migration.version, migration.name, nowIso()],
      );
    });
    newlyApplied.push(migration.version);
  }

  const currentVersion = migrations.reduce(
    (max, m) => (m.version > max ? m.version : max),
    0,
  );

  return { appliedVersions: newlyApplied, currentVersion };
}
