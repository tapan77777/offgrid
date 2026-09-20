import BetterSqlite from 'better-sqlite3';
import type { OffgridDb, QueryResult, SqlScalar } from './types';

export interface BetterSqliteOptions {
  readonly filename: string;
}

export function createBetterSqliteDb(options: BetterSqliteOptions): OffgridDb {
  const db = new BetterSqlite(options.filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return wrap(db);
}

function wrap(db: BetterSqlite.Database): OffgridDb {
  const self: OffgridDb = {
    execute(sql: string, params?: readonly SqlScalar[]): QueryResult {
      const stmt = db.prepare(sql);
      const args = (params ?? []) as SqlScalar[];
      if (stmt.reader) {
        const rows = (args.length ? stmt.all(...args) : stmt.all()) as QueryResult['rows'];
        return { rows, rowsAffected: 0 };
      }
      const info = args.length ? stmt.run(...args) : stmt.run();
      return { rows: [], rowsAffected: info.changes };
    },
    transaction(work: (tx: OffgridDb) => void): void {
      const wrapped = db.transaction(() => work(self));
      wrapped();
    },
    close(): void {
      db.close();
    },
  };
  return self;
}
