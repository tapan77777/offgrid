jest.mock('react-native', () => {
  const NativeModules: Record<string, unknown> = {
    OffgridLocation: undefined,
  };
  return {
    NativeModules,
    Platform: { OS: 'android', Version: 34 },
    PermissionsAndroid: {
      PERMISSIONS: {
        ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
        ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
      },
      RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
      check: jest.fn(),
      request: jest.fn(),
    },
  };
});

import { NativeModules } from 'react-native';
import { createInMemoryDb } from '../../support/testDb';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { findLatestForUser } from '../../../src/database/repositories/locationRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type { UserId } from '../../../src/types/ids';
import {
  LOCATION_STALE_MS,
  getCurrentLocation,
  getLastKnownFromDb,
} from '../../../src/services/location';

const NOW_ISO = '2026-05-01T12:00:00Z';
const NOW_MS = Date.parse(NOW_ISO);

interface MockNativeFix {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  provider?: string;
  timestampMs: number;
  wasCached?: boolean;
}

function setNative(getCurrent: jest.Mock): void {
  (NativeModules as { OffgridLocation?: unknown }).OffgridLocation = {
    checkPermission: jest.fn(async () => ({ fine: true, coarse: true })),
    isLocationEnabled: jest.fn(async () => true),
    getCurrentLocation: getCurrent,
  };
}

function clearNative(): void {
  (NativeModules as { OffgridLocation?: unknown }).OffgridLocation = undefined;
}

describe('locationService.getCurrentLocation', () => {
  afterEach(clearNative);

  it('persists a valid fix and returns status=ok', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    const fix: MockNativeFix = {
      latitude: 46.5,
      longitude: 6.6,
      accuracy: 10,
      altitude: 300,
      heading: 45,
      speed: 1.5,
      provider: 'gps',
      timestampMs: NOW_MS,
      wasCached: false,
    };
    setNative(jest.fn(async () => fix));

    const result = await getCurrentLocation(
      { db, userId, now: () => NOW_MS, nowIso: () => NOW_ISO },
      { timeoutMs: 5000 },
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.location.latitude).toBe(46.5);
    expect(result.location.heading).toBe(45);
    expect(result.location.source).toBe('gps');
    const latest = findLatestForUser(db, userId);
    expect(latest?.id).toBe(result.location.id);
    db.close();
  });

  it('returns status=stale when native returns a cached fix older than the threshold', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    const oldTs = NOW_MS - (LOCATION_STALE_MS + 5000);
    setNative(
      jest.fn(async () => ({
        latitude: 1,
        longitude: 1,
        provider: 'gps',
        timestampMs: oldTs,
        wasCached: true,
      })),
    );
    const result = await getCurrentLocation({
      db,
      userId,
      now: () => NOW_MS,
      nowIso: () => NOW_ISO,
    });
    expect(result.status).toBe('stale');
    if (result.status !== 'stale') throw new Error('expected stale');
    expect(result.ageMs).toBeGreaterThan(LOCATION_STALE_MS);
    db.close();
  });

  it('translates E_PERMISSION_DENIED into status=permission-denied', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    const err = Object.assign(new Error('nope'), { code: 'E_PERMISSION_DENIED' });
    setNative(jest.fn(async () => { throw err; }));
    const result = await getCurrentLocation({ db, userId });
    expect(result).toEqual({ status: 'permission-denied' });
    db.close();
  });

  it('translates E_TIMEOUT into status=timeout', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    const err = Object.assign(new Error('no fix'), { code: 'E_TIMEOUT' });
    setNative(jest.fn(async () => { throw err; }));
    const result = await getCurrentLocation({ db, userId });
    expect(result).toEqual({ status: 'timeout' });
    db.close();
  });

  it('translates other native errors into status=unavailable', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    const err = Object.assign(new Error('no provider'), {
      code: 'E_NO_LOCATION_SERVICE',
    });
    setNative(jest.fn(async () => { throw err; }));
    const result = await getCurrentLocation({ db, userId });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toContain('no provider');
    }
    db.close();
  });

  it('returns unavailable when the native module is missing', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });
    clearNative();
    const result = await getCurrentLocation({ db, userId });
    expect(result.status).toBe('unavailable');
    db.close();
  });

  it('rejects an invalid fix from the native module without persisting', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    setNative(
      jest.fn(async () => ({
        latitude: 91,
        longitude: 0,
        provider: 'gps',
        timestampMs: NOW_MS,
      })),
    );
    const result = await getCurrentLocation({ db, userId });
    expect(result.status).toBe('unavailable');
    expect(findLatestForUser(db, userId)).toBeNull();
    db.close();
  });
});

describe('locationService.getLastKnownFromDb', () => {
  it('returns ok when a fresh row is in the DB', () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });
    setNative(
      jest.fn(async () => ({
        latitude: 1,
        longitude: 1,
        provider: 'gps',
        timestampMs: NOW_MS,
        wasCached: false,
      })),
    );
    return getCurrentLocation({ db, userId, nowIso: () => NOW_ISO }).then(() => {
      const cached = getLastKnownFromDb(db, userId, NOW_MS + 1000);
      expect(cached.status).toBe('ok');
      db.close();
    });
  });

  it('returns stale when the most recent DB row is older than the threshold', () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });
    setNative(
      jest.fn(async () => ({
        latitude: 1,
        longitude: 1,
        provider: 'gps',
        timestampMs: NOW_MS,
        wasCached: false,
      })),
    );
    return getCurrentLocation({ db, userId, nowIso: () => NOW_ISO }).then(() => {
      const cached = getLastKnownFromDb(
        db,
        userId,
        NOW_MS + LOCATION_STALE_MS + 5000,
      );
      expect(cached.status).toBe('stale');
      db.close();
    });
  });

  it('returns unavailable when no rows exist for the user', () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });
    const cached = getLastKnownFromDb(db, userId, NOW_MS);
    expect(cached.status).toBe('unavailable');
    db.close();
  });
});
