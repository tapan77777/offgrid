import { open, type DB } from '@op-engineering/op-sqlite';
import type { OffgridDb, QueryResult, SqlScalar } from './types';

export interface OpSqliteOptions {
  readonly name: string;
  readonly location?: string;
}

export function createOpSqliteDb(options: OpSqliteOptions): OffgridDb {
  const db: DB = options.location
    ? open({ name: options.name, location: options.location })
    : open({ name: options.name });

  return wrap(db);
}

function wrap(db: DB): OffgridDb {
  const self: OffgridDb = {
    execute(sql: string, params?: readonly SqlScalar[]): QueryResult {
      const result = params
        ? db.executeSync(sql, params as SqlScalar[])
        : db.executeSync(sql);
      return {
        rows: (result.rows ?? []) as QueryResult['rows'],
        rowsAffected: result.rowsAffected ?? 0,
      };
    },
    transaction(work: (tx: OffgridDb) => void): void {
      db.executeSync('BEGIN');
      try {
        work(self);
        db.executeSync('COMMIT');
      } catch (err) {
        db.executeSync('ROLLBACK');
        throw err;
      }
    },
    close(): void {
      db.close();
    },
  };
  return self;
}

export function applyStartupPragmas(db: OffgridDb): void {
  db.execute('PRAGMA journal_mode = WAL');
  db.execute('PRAGMA foreign_keys = ON');
  db.execute('PRAGMA synchronous = NORMAL');
}
