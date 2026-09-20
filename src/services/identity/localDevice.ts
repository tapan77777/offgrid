import type { OffgridDb } from '../../database';
import {
  DeviceRepo,
  SettingsRepo,
} from '../../database/repositories';
import type { DevicePlatform } from '../../types/entities';
import type { DeviceId } from '../../types/ids';
import { isUuidV7, newUuidV7 } from '../../utils/ids';

export interface EnsureLocalDeviceOptions {
  readonly platform: DevicePlatform;
  readonly appVersion?: string | null;
  readonly deviceName?: string | null;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface LocalDevice {
  readonly deviceId: DeviceId;
  readonly wasCreated: boolean;
}

export function ensureLocalDevice(
  db: OffgridDb,
  options: EnsureLocalDeviceOptions,
): LocalDevice {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const generateId = options.generateId ?? newUuidV7;

  const existingId = SettingsRepo.getSettingValue(
    db,
    SettingsRepo.SETTING_LOCAL_DEVICE_ID,
  );

  if (existingId && isUuidV7(existingId)) {
    const device = DeviceRepo.findDeviceById(db, existingId as DeviceId);
    if (device) {
      DeviceRepo.touchDeviceLastSeen(db, device.id, nowIso());
      return { deviceId: device.id, wasCreated: false };
    }
  }

  const newId = generateId() as DeviceId;
  const created = nowIso();

  db.transaction(tx => {
    DeviceRepo.insertDevice(tx, {
      id: newId,
      userId: null,
      deviceName: options.deviceName ?? null,
      platform: options.platform,
      appVersion: options.appVersion ?? null,
      nowIso: created,
    });
    SettingsRepo.upsertSetting(
      tx,
      SettingsRepo.SETTING_LOCAL_DEVICE_ID,
      newId,
      created,
    );
  });

  return { deviceId: newId, wasCreated: true };
}

export function getLocalDeviceId(db: OffgridDb): DeviceId | null {
  const stored = SettingsRepo.getSettingValue(
    db,
    SettingsRepo.SETTING_LOCAL_DEVICE_ID,
  );
  return stored && isUuidV7(stored) ? (stored as DeviceId) : null;
}
