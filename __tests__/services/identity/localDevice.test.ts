import { createFileBackedDb } from '../../support/testDb';
import {
  ensureLocalDevice,
  getLocalDeviceId,
} from '../../../src/services/identity/localDevice';
import { findDeviceById } from '../../../src/database/repositories/deviceRepository';
import { isUuidV7 } from '../../../src/utils/ids';

describe('ensureLocalDevice', () => {
  it('creates a UUIDv7 device row + settings entry on first launch', () => {
    const handle = createFileBackedDb();
    const result = ensureLocalDevice(handle.db, { platform: 'android' });
    expect(result.wasCreated).toBe(true);
    expect(isUuidV7(result.deviceId)).toBe(true);

    const stored = findDeviceById(handle.db, result.deviceId);
    expect(stored).not.toBeNull();
    expect(stored?.platform).toBe('android');
    expect(getLocalDeviceId(handle.db)).toBe(result.deviceId);
    handle.cleanup();
  });

  it('returns the same device id across close + reopen (survives app restart)', () => {
    const handle = createFileBackedDb();
    const first = ensureLocalDevice(handle.db, { platform: 'android' });

    const reopened = handle.reopen();
    const second = ensureLocalDevice(reopened, { platform: 'android' });

    expect(second.wasCreated).toBe(false);
    expect(second.deviceId).toBe(first.deviceId);
    handle.cleanup();
  });

  it('regenerates the device row if the settings pointer is invalid', () => {
    const handle = createFileBackedDb();
    const first = ensureLocalDevice(handle.db, { platform: 'android' });

    handle.db.execute(
      "UPDATE settings SET value = 'not-a-uuid' WHERE key = 'local_device_id'",
    );

    const second = ensureLocalDevice(handle.db, { platform: 'android' });
    expect(second.wasCreated).toBe(true);
    expect(second.deviceId).not.toBe(first.deviceId);
    handle.cleanup();
  });
});
