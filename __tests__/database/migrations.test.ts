import { createInMemoryDb, createFileBackedDb } from '../support/testDb';
import { runMigrations } from '../../src/database';

describe('runMigrations', () => {
  it('creates schema_migrations and applies all migrations on a fresh DB', () => {
    const db = createInMemoryDb();
    const { rows } = db.execute(
      'SELECT version, name FROM schema_migrations ORDER BY version',
    );
    expect(rows).toEqual([
      expect.objectContaining({ version: 1, name: '0001_initial_schema' }),
      expect.objectContaining({
        version: 2,
        name: '0002_phase3_diagnostics_flag',
      }),
      expect.objectContaining({
        version: 3,
        name: '0003_location_kinematics',
      }),
      expect.objectContaining({
        version: 4,
        name: '0004_group_location_sharing',
      }),
      expect.objectContaining({
        version: 5,
        name: '0005_direct_conversations',
      }),
    ]);
    db.close();
  });

  it('is idempotent — running again applies nothing', () => {
    const db = createInMemoryDb();
    const report = runMigrations(db);
    expect(report.appliedVersions).toEqual([]);
    expect(report.currentVersion).toBe(5);
    db.close();
  });

  it('creates all Phase 2+ tables including group_location_sharing', () => {
    const db = createInMemoryDb();
    const { rows } = db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const names = rows.map(r => r.name);
    expect(names).toEqual(
      [
        'devices',
        'group_location_sharing',
        'group_members',
        'groups',
        'locations',
        'map_downloads',
        'messages',
        'peers',
        'safety_checkins',
        'schema_migrations',
        'settings',
        'sos_events',
        'sync_queue',
        'users',
      ].sort(),
    );
    db.close();
  });

  it('enforces foreign keys (messages requires an existing group)', () => {
    const db = createInMemoryDb();
    expect(() =>
      db.execute(
        `INSERT INTO messages
           (id, group_id, sender_id, message_type, payload, created_at, hop_count, delivery_status, sync_status)
         VALUES ('a', 'no-such-group', 'no-such-user', 'text', '{}', '2026-01-01T00:00:00Z', 0, 'LOCAL', 'NOT_SYNCED')`,
      ),
    ).toThrow(/FOREIGN KEY/i);
    db.close();
  });

  it('persists across a database close/reopen', () => {
    const handle = createFileBackedDb();
    handle.db.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES ('boot_test', 'value', '2026-01-01T00:00:00Z')`,
    );
    const reopened = handle.reopen();
    const { rows } = reopened.execute(
      "SELECT value FROM settings WHERE key = 'boot_test'",
    );
    expect(rows[0]).toMatchObject({ value: 'value' });
    handle.cleanup();
  });
});
