import type { OffgridDb } from '../sqlite/types';
import type { SettingRow } from '../models/rows';
import type { Setting } from '../../types/entities';

export const SETTING_LOCAL_DEVICE_ID = 'local_device_id';
export const SETTING_SCHEMA_BOOTSTRAPPED_AT = 'schema_bootstrapped_at';

function toDomain(row: SettingRow): Setting {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
  };
}

export function getSetting(db: OffgridDb, key: string): Setting | null {
  const { rows } = db.execute('SELECT * FROM settings WHERE key = ?', [key]);
  const row = rows[0];
  return row ? toDomain(row as unknown as SettingRow) : null;
}

export function getSettingValue(db: OffgridDb, key: string): string | null {
  return getSetting(db, key)?.value ?? null;
}

export function upsertSetting(
  db: OffgridDb,
  key: string,
  value: string | null,
  nowIso: string,
): Setting {
  db.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso],
  );
  const found = getSetting(db, key);
  if (!found) {
    throw new Error(`Setting ${key} missing after upsert`);
  }
  return found;
}
