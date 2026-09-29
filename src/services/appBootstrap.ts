import { Platform } from 'react-native';
import pkg from '../../package.json';
import type { OffgridDb } from '../database';

const appName: string = pkg.name;
const appVersion: string = pkg.version;
import { runMigrations } from '../database';
import { applyStartupPragmas, createOpSqliteDb } from '../database/sqlite';
import { ensureLocalDevice, ensureLocalUser } from './identity';
import { ensureDiagnosticGroup, isDiagnosticsEnabled } from './communication';
import { startConnectivityRuntime } from './communication/connectivityRuntime';
import { startChatRequestRuntime, startChatRuntime } from './chat';
import { startGroupJoinRuntime } from './groups';
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
  // Chat V1 (D-074). The chat runtime is idempotent — it attaches receivers and
  // the outbox tick when a CommunicationManager becomes active and detaches
  // when it goes away. Safe to call on every bootstrap; the first call wins.
  startChatRuntime({ db, localUserId: user.userId });
  // Group join V1 (D-075). Attaches the responder that answers nearby
  // `group.join.request` envelopes with an invite for any group the local
  // user hosts. Same idempotent lifecycle pattern as chatRuntime.
  startGroupJoinRuntime({ db, localUserId: user.userId });
  // Chat request V1 (D-076). Attaches the responder that persists incoming
  // chat.request envelopes addressed to the local user, plus incoming
  // accept/decline replies for our outgoing requests. Same idempotent
  // lifecycle pattern as chatRuntime.
  startChatRequestRuntime({ db, localUserId: user.userId });
  // D-078 seamless connection. App-owned CommunicationManager with LAZY
  // init — the transport is only created on demand OR eagerly if the user
  // already has at least one linked peer from a prior session. See
  // connectivityRuntime.ts for the full rationale.
  startConnectivityRuntime({ db, localDeviceId: device.deviceId });
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
