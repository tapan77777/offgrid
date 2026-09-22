import { Platform } from 'react-native';
import pkg from '../../package.json';
import type { OffgridDb } from '../database';

const appName: string = pkg.name;
const appVersion: string = pkg.version;
import { runMigrations } from '../database';
import { applyStartupPragmas, createOpSqliteDb } from '../database/sqlite';
import { ensureLocalDevice, ensureLocalUser } from './identity';
import { ensureDiagnosticGroup, isDiagnosticsEnabled } from './communication';
import { bootstrapMapProvider } from '../config/mapProviderBootstrap';
import type { DevicePlatform } from '../types/entities';
import type { DeviceId, UserId } from '../types/ids';

const DB_NAME = 'offgrid.db';

export interface AppBootstrapResult {
  readonly db: OffgridDb;
  readonly deviceId: DeviceId;
  readonly deviceWasCreated: boolean;
  readonly userId: UserId;
  readonly userWasCreated: boolean;
  readonly schemaVersion: number;
  readonly mapProviderId: string;
  readonly mapTilerConfigured: boolean;
}

let cached: AppBootstrapResult | null = null;

export function bootstrapApp(): AppBootstrapResult {
  if (cached) {
    return cached;
  }
  const db = createOpSqliteDb({ name: DB_NAME });
  applyStartupPragmas(db);
  const migration = runMigrations(db);
  const device = ensureLocalDevice(db, {
    platform: resolvePlatform(),
    appVersion,
    deviceName: appName,
  });
  const user = ensureLocalUser(db, { linkDeviceId: device.deviceId });
  if (isDiagnosticsEnabled(db)) {
    ensureDiagnosticGroup(db);
  }
  const map = bootstrapMapProvider();
  cached = {
    db,
    deviceId: device.deviceId,
    deviceWasCreated: device.wasCreated,
    userId: user.userId,
    userWasCreated: user.wasCreated,
    schemaVersion: migration.currentVersion,
    mapProviderId: map.providerId,
    mapTilerConfigured: map.mapTilerConfigured,
  };
  return cached;
}

function resolvePlatform(): DevicePlatform {
  switch (Platform.OS) {
    case 'android':
      return 'android';
    case 'ios':
      return 'ios';
    case 'web':
      return 'web';
    default:
      return 'other';
  }
}
