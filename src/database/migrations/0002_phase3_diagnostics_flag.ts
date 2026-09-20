import type { Migration } from './types';

const statements: readonly string[] = [
  `INSERT OR IGNORE INTO settings (key, value, updated_at)
     VALUES ('phase3.diagnostics.enabled', 'false', '2026-09-20T00:00:00Z')`,
];

export const phase3DiagnosticsFlag: Migration = {
  version: 2,
  name: '0002_phase3_diagnostics_flag',
  statements,
};
