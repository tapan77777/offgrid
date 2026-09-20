import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBetterSqliteDb } from '../../src/database/sqlite/betterSqliteAdapter';
import { runMigrations } from '../../src/database';
import type { OffgridDb } from '../../src/database';

export interface TestDbHandle {
  readonly db: OffgridDb;
  readonly filename: string;
  reopen(): OffgridDb;
  cleanup(): void;
}

export function createInMemoryDb(): OffgridDb {
  const db = createBetterSqliteDb({ filename: ':memory:' });
  runMigrations(db);
  return db;
}

export function createFileBackedDb(): TestDbHandle {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offgrid-test-'));
  const filename = path.join(dir, 'offgrid.db');
  let db = createBetterSqliteDb({ filename });
  runMigrations(db);

  return {
    get db(): OffgridDb {
      return db;
    },
    filename,
    reopen(): OffgridDb {
      db.close();
      db = createBetterSqliteDb({ filename });
      runMigrations(db);
      return db;
    },
    cleanup(): void {
      try {
        db.close();
      } catch {
        // already closed
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
