export type SqlScalar = string | number | boolean | null | Uint8Array;

export type QueryRow = Record<string, SqlScalar>;

export interface QueryResult {
  rows: QueryRow[];
  rowsAffected: number;
}

export interface OffgridDb {
  execute(sql: string, params?: readonly SqlScalar[]): QueryResult;
  transaction(work: (tx: OffgridDb) => void): void;
  close(): void;
}
