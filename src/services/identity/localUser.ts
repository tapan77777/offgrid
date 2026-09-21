import type { OffgridDb } from '../../database';
import {
  DeviceRepo,
  SettingsRepo,
  UserRepo,
} from '../../database/repositories';
import type { DeviceId, UserId } from '../../types/ids';
import { isUuidV7, newUuidV7 } from '../../utils/ids';

export interface EnsureLocalUserOptions {
  readonly displayName?: string;
  readonly linkDeviceId?: DeviceId | null;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface LocalUser {
  readonly userId: UserId;
  readonly wasCreated: boolean;
}

const DEFAULT_DISPLAY_NAME = 'You';

// Establishes the single local user identity that owns groups and memberships
// on this device. Kept intentionally minimal — no auth, no cloud (D-045). If
// a device row is passed in, its user_id is linked so future messages have a
// valid FK target.
export function ensureLocalUser(
  db: OffgridDb,
  options: EnsureLocalUserOptions = {},
): LocalUser {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const generateId = options.generateId ?? newUuidV7;
  const displayName = options.displayName ?? DEFAULT_DISPLAY_NAME;

  const existingId = SettingsRepo.getSettingValue(
    db,
    SettingsRepo.SETTING_LOCAL_USER_ID,
  );

  if (existingId && isUuidV7(existingId)) {
    const user = UserRepo.findUserById(db, existingId as UserId);
    if (user) {
      if (options.linkDeviceId) {
        DeviceRepo.setDeviceUserId(db, options.linkDeviceId, user.id);
      }
      return { userId: user.id, wasCreated: false };
    }
  }

  const newId = generateId() as UserId;
  const created = nowIso();

  db.transaction(tx => {
    UserRepo.insertUser(tx, {
      id: newId,
      displayName,
      avatarUri: null,
      nowIso: created,
    });
    SettingsRepo.upsertSetting(
      tx,
      SettingsRepo.SETTING_LOCAL_USER_ID,
      newId,
      created,
    );
    if (options.linkDeviceId) {
      DeviceRepo.setDeviceUserId(tx, options.linkDeviceId, newId);
    }
  });

  return { userId: newId, wasCreated: true };
}

export function getLocalUserId(db: OffgridDb): UserId | null {
  const stored = SettingsRepo.getSettingValue(
    db,
    SettingsRepo.SETTING_LOCAL_USER_ID,
  );
  return stored && isUuidV7(stored) ? (stored as UserId) : null;
}
