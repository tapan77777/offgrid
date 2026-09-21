import { createFileBackedDb, createInMemoryDb } from '../../support/testDb';
import {
  ensureLocalUser,
  getLocalUserId,
} from '../../../src/services/identity/localUser';
import { ensureLocalDevice } from '../../../src/services/identity/localDevice';
import { findDeviceById } from '../../../src/database/repositories/deviceRepository';
import { findUserById } from '../../../src/database/repositories/userRepository';
import { isUuidV7 } from '../../../src/utils/ids';

describe('ensureLocalUser', () => {
  it('creates a UUIDv7 user row + settings entry on first launch', () => {
    const db = createInMemoryDb();
    const result = ensureLocalUser(db);
    expect(result.wasCreated).toBe(true);
    expect(isUuidV7(result.userId)).toBe(true);
    expect(findUserById(db, result.userId)).not.toBeNull();
    expect(getLocalUserId(db)).toBe(result.userId);
    db.close();
  });

  it('returns the same user id across close + reopen', () => {
    const handle = createFileBackedDb();
    const first = ensureLocalUser(handle.db);
    const reopened = handle.reopen();
    const second = ensureLocalUser(reopened);
    expect(second.wasCreated).toBe(false);
    expect(second.userId).toBe(first.userId);
    handle.cleanup();
  });

  it('links the local device to the local user when linkDeviceId is provided', () => {
    const db = createInMemoryDb();
    const device = ensureLocalDevice(db, { platform: 'android' });
    const user = ensureLocalUser(db, { linkDeviceId: device.deviceId });
    const stored = findDeviceById(db, device.deviceId);
    expect(stored?.userId).toBe(user.userId);
    db.close();
  });

  it('regenerates the user if the settings pointer is invalid', () => {
    const handle = createFileBackedDb();
    const first = ensureLocalUser(handle.db);
    handle.db.execute(
      "UPDATE settings SET value = 'not-a-uuid' WHERE key = 'local_user_id'",
    );
    const second = ensureLocalUser(handle.db);
    expect(second.wasCreated).toBe(true);
    expect(second.userId).not.toBe(first.userId);
    handle.cleanup();
  });
});
