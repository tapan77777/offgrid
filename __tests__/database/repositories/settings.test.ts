import { createInMemoryDb } from '../../support/testDb';
import {
  getSetting,
  getSettingValue,
  upsertSetting,
} from '../../../src/database/repositories/settingsRepository';

describe('settingsRepository', () => {
  it('returns null for missing keys', () => {
    const db = createInMemoryDb();
    expect(getSetting(db, 'missing')).toBeNull();
    expect(getSettingValue(db, 'missing')).toBeNull();
    db.close();
  });

  it('upserts and reads back a value', () => {
    const db = createInMemoryDb();
    upsertSetting(db, 'k', 'v1', '2026-01-01T00:00:00Z');
    expect(getSettingValue(db, 'k')).toBe('v1');

    upsertSetting(db, 'k', 'v2', '2026-01-02T00:00:00Z');
    const setting = getSetting(db, 'k');
    expect(setting).toMatchObject({
      key: 'k',
      value: 'v2',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    db.close();
  });
});
