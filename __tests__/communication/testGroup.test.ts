import { createInMemoryDb } from '../support/testDb';
import {
  DIAGNOSTIC_GROUP_ID,
  DIAGNOSTIC_GROUP_NAME,
  DIAGNOSTIC_USER_ID,
  ensureDiagnosticGroup,
  ensureRemoteDeviceRow,
  isDiagnosticsEnabled,
  setDiagnosticsEnabled,
} from '../../src/services/communication/testGroup';
import { findGroupById } from '../../src/database/repositories/groupRepository';
import { findUserById } from '../../src/database/repositories/userRepository';
import { findDeviceById } from '../../src/database/repositories/deviceRepository';
import { isUuidV7, newUuidV7 } from '../../src/utils/ids';
import type { DeviceId } from '../../src/types/ids';

describe('Phase 3 diagnostic group + settings', () => {
  it('reserved ids are valid uuidv7 values', () => {
    expect(isUuidV7(DIAGNOSTIC_GROUP_ID)).toBe(true);
    expect(isUuidV7(DIAGNOSTIC_USER_ID)).toBe(true);
  });

  it('ensureDiagnosticGroup creates the user + group idempotently', () => {
    const db = createInMemoryDb();
    ensureDiagnosticGroup(db, '2026-09-20T00:00:00Z');
    ensureDiagnosticGroup(db, '2026-09-20T00:00:01Z'); // second call must not error
    const group = findGroupById(db, DIAGNOSTIC_GROUP_ID);
    expect(group?.name).toBe(DIAGNOSTIC_GROUP_NAME);
    expect(findUserById(db, DIAGNOSTIC_USER_ID)).not.toBeNull();
    db.close();
  });

  it('setDiagnosticsEnabled flips the setting and isDiagnosticsEnabled reads it back', () => {
    const db = createInMemoryDb();
    expect(isDiagnosticsEnabled(db)).toBe(false);
    setDiagnosticsEnabled(db, true, '2026-09-20T00:00:00Z');
    expect(isDiagnosticsEnabled(db)).toBe(true);
    setDiagnosticsEnabled(db, false, '2026-09-20T00:00:01Z');
    expect(isDiagnosticsEnabled(db)).toBe(false);
    db.close();
  });

  it('ensureRemoteDeviceRow inserts once and no-ops on repeat', () => {
    const db = createInMemoryDb();
    const deviceId = newUuidV7() as DeviceId;
    ensureRemoteDeviceRow(db, deviceId, '2026-09-20T00:00:00Z');
    ensureRemoteDeviceRow(db, deviceId, '2026-09-20T00:00:01Z');
    const row = findDeviceById(db, deviceId);
    expect(row?.platform).toBe('other');
    expect(row?.userId).toBeNull();
    db.close();
  });
});
