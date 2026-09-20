import type { OffgridDb } from '../../database';
import {
  DeviceRepo,
  GroupRepo,
  SettingsRepo,
  UserRepo,
} from '../../database/repositories';
import type { DeviceId, GroupId, UserId } from '../../types/ids';
import { isUuidV7 } from '../../utils/ids';

export const DIAGNOSTIC_GROUP_ID =
  '00000000-0000-7000-8000-000000000003' as GroupId;

export const DIAGNOSTIC_GROUP_NAME = '__phase3_diagnostics';

export const DIAGNOSTIC_USER_ID =
  '00000000-0000-7000-8000-000000000004' as UserId;

export const DIAGNOSTIC_USER_NAME = '__phase3_diagnostic_user';

export const SETTING_PHASE3_DIAGNOSTICS_ENABLED =
  'phase3.diagnostics.enabled';

if (!isUuidV7(DIAGNOSTIC_GROUP_ID) || !isUuidV7(DIAGNOSTIC_USER_ID)) {
  throw new Error('Phase 3 diagnostic reserved IDs must be valid UUIDv7');
}

export function isDiagnosticsEnabled(db: OffgridDb): boolean {
  const value = SettingsRepo.getSettingValue(
    db,
    SETTING_PHASE3_DIAGNOSTICS_ENABLED,
  );
  return value === 'true';
}

export function setDiagnosticsEnabled(
  db: OffgridDb,
  enabled: boolean,
  nowIso: string = new Date().toISOString(),
): void {
  SettingsRepo.upsertSetting(
    db,
    SETTING_PHASE3_DIAGNOSTICS_ENABLED,
    enabled ? 'true' : 'false',
    nowIso,
  );
}

export function ensureDiagnosticGroup(
  db: OffgridDb,
  nowIso: string = new Date().toISOString(),
): void {
  db.transaction(tx => {
    if (!UserRepo.findUserById(tx, DIAGNOSTIC_USER_ID)) {
      UserRepo.insertUser(tx, {
        id: DIAGNOSTIC_USER_ID,
        displayName: DIAGNOSTIC_USER_NAME,
        avatarUri: null,
        nowIso,
      });
    }
    if (!GroupRepo.findGroupById(tx, DIAGNOSTIC_GROUP_ID)) {
      GroupRepo.insertGroup(tx, {
        id: DIAGNOSTIC_GROUP_ID,
        name: DIAGNOSTIC_GROUP_NAME,
        createdBy: null,
        nowIso,
      });
    }
  });
}

export function ensureRemoteDeviceRow(
  db: OffgridDb,
  deviceId: DeviceId,
  nowIso: string = new Date().toISOString(),
): void {
  if (DeviceRepo.findDeviceById(db, deviceId)) {
    return;
  }
  DeviceRepo.insertDevice(db, {
    id: deviceId,
    userId: null,
    deviceName: null,
    platform: 'other',
    appVersion: null,
    nowIso,
  });
}
