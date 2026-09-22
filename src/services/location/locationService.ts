import type { OffgridDb } from '../../database';
import { LocationRepo } from '../../database/repositories';
import type {
  Location as LocationEntity,
  LocationSource,
} from '../../types/entities';
import type {
  DeviceId,
  GroupId,
  LocationId,
  UserId,
} from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import {
  DEFAULT_GET_LOCATION_TIMEOUT_MS,
  LOCATION_STALE_MS,
} from './constants';
import {
  getNativeLocationModule,
  type NativeLocationFix,
} from './nativeBridge';

// A single-shot location read has four honest outcomes. Consumers pattern-
// match on `status` and never fabricate coordinates when the fix failed
// (CLAUDE.md §14 §20; D-023).
export type LocationReadResult =
  | { status: 'ok'; location: LocationEntity }
  | {
      status: 'stale';
      location: LocationEntity;
      ageMs: number;
    }
  | { status: 'permission-denied' }
  | { status: 'unavailable'; reason: string }
  | { status: 'timeout' };

export interface RequestLocationOptions {
  timeoutMs?: number;
  // If set and the last-known cached fix is at least this fresh, the
  // service returns it without hitting the GPS hardware.
  maxAgeMs?: number;
  // Optional group association for the persisted row. Purely local — no
  // network distribution happens here (that's a future phase).
  groupId?: GroupId | null;
}

export interface LocationServiceContext {
  db: OffgridDb;
  userId: UserId;
  deviceId?: DeviceId | null;
  nowIso?: () => string;
  generateId?: () => string;
  now?: () => number;
}

export async function getCurrentLocation(
  ctx: LocationServiceContext,
  options: RequestLocationOptions = {},
): Promise<LocationReadResult> {
  const module = getNativeLocationModule();
  if (!module) {
    return {
      status: 'unavailable',
      reason: 'Native location module not installed',
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_GET_LOCATION_TIMEOUT_MS;

  let fix: NativeLocationFix;
  try {
    const nativeOptions: { timeoutMs: number; maxAgeMs?: number } = {
      timeoutMs,
    };
    if (options.maxAgeMs !== undefined) {
      nativeOptions.maxAgeMs = options.maxAgeMs;
    }
    fix = await module.getCurrentLocation(nativeOptions);
  } catch (err) {
    return classifyNativeError(err);
  }

  if (!isValidFix(fix)) {
    return {
      status: 'unavailable',
      reason: 'Invalid fix from native module',
    };
  }

  const nowIso = (ctx.nowIso ?? (() => new Date().toISOString()))();
  const nowMs = (ctx.now ?? Date.now)();
  const generateId = ctx.generateId ?? newUuidV7;
  const source: LocationSource = 'gps';
  const location = LocationRepo.insertLocation(ctx.db, {
    id: generateId() as LocationId,
    userId: ctx.userId,
    deviceId: ctx.deviceId ?? null,
    groupId: options.groupId ?? null,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy ?? null,
    altitude: fix.altitude ?? null,
    heading: fix.heading ?? null,
    speed: fix.speed ?? null,
    source,
    createdAt: nowIso,
  });

  const ageMs = Math.max(0, nowMs - fix.timestampMs);
  if (fix.wasCached && ageMs > LOCATION_STALE_MS) {
    return { status: 'stale', location, ageMs };
  }
  return { status: 'ok', location };
}

export function getLastKnownFromDb(
  db: OffgridDb,
  userId: UserId,
  nowMs: number = Date.now(),
): LocationReadResult {
  const latest = LocationRepo.findLatestForUser(db, userId);
  if (!latest) {
    return { status: 'unavailable', reason: 'No prior location on device' };
  }
  const ageMs = Math.max(0, nowMs - Date.parse(latest.createdAt));
  if (ageMs > LOCATION_STALE_MS) {
    return { status: 'stale', location: latest, ageMs };
  }
  return { status: 'ok', location: latest };
}

function isValidFix(fix: NativeLocationFix): boolean {
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) {
    return false;
  }
  if (fix.latitude < -90 || fix.latitude > 90) return false;
  if (fix.longitude < -180 || fix.longitude > 180) return false;
  return true;
}

function classifyNativeError(err: unknown): LocationReadResult {
  const code = extractErrorCode(err);
  const message = extractErrorMessage(err);
  switch (code) {
    case 'E_PERMISSION_DENIED':
      return { status: 'permission-denied' };
    case 'E_TIMEOUT':
      return { status: 'timeout' };
    case 'E_NO_LOCATION_SERVICE':
    case 'E_LOCATION_REQUEST':
    default:
      return { status: 'unavailable', reason: message };
  }
}

function extractErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const raw = (err as { code?: unknown }).code;
    if (typeof raw === 'string') return raw;
  }
  return undefined;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
