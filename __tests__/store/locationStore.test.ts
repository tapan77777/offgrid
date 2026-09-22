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
import { createInMemoryDb } from '../support/testDb';
import { insertUser } from '../../src/database/repositories/userRepository';
import { newUuidV7 } from '../../src/utils/ids';
import type { UserId } from '../../src/types/ids';
import { useLocationStore } from '../../src/store/locationStore';

const NOW_ISO = '2026-05-01T12:00:00Z';

function setNativeGetCurrent(handler: jest.Mock): void {
  (NativeModules as { OffgridLocation?: unknown }).OffgridLocation = {
    checkPermission: jest.fn(async () => ({ fine: true, coarse: true })),
    isLocationEnabled: jest.fn(async () => true),
    getCurrentLocation: handler,
  };
}

function resetStore(): void {
  useLocationStore.getState().clear();
}

describe('locationStore', () => {
  beforeEach(() => {
    resetStore();
    (NativeModules as { OffgridLocation?: unknown }).OffgridLocation = undefined;
  });

  it('transitions requesting -> ok on a successful fix and caches location', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    setNativeGetCurrent(
      jest.fn(async () => ({
        latitude: 10,
        longitude: 20,
        provider: 'gps',
        timestampMs: Date.now(),
        wasCached: false,
      })),
    );
    const result = await useLocationStore
      .getState()
      .refresh(db, userId, null);
    expect(result.status).toBe('ok');
    const state = useLocationStore.getState();
    expect(state.status).toBe('ok');
    expect(state.currentLocation?.latitude).toBe(10);
    expect(state.currentLocation?.longitude).toBe(20);
    expect(state.lastError).toBeNull();
    db.close();
  });

  it('surfaces permission-denied and stores an error string', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    setNativeGetCurrent(
      jest.fn(async () => {
        throw Object.assign(new Error('denied'), { code: 'E_PERMISSION_DENIED' });
      }),
    );
    const result = await useLocationStore
      .getState()
      .refresh(db, userId, null);
    expect(result.status).toBe('permission-denied');
    const state = useLocationStore.getState();
    expect(state.status).toBe('permission-denied');
    expect(state.lastError).toBeTruthy();
    db.close();
  });

  it('surfaces timeout without wiping the previous location', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });

    setNativeGetCurrent(
      jest.fn(async () => ({
        latitude: 1,
        longitude: 1,
        provider: 'gps',
        timestampMs: Date.now(),
        wasCached: false,
      })),
    );
    await useLocationStore.getState().refresh(db, userId, null);
    const first = useLocationStore.getState().currentLocation;
    expect(first).not.toBeNull();

    setNativeGetCurrent(
      jest.fn(async () => {
        throw Object.assign(new Error('slow'), { code: 'E_TIMEOUT' });
      }),
    );
    const result = await useLocationStore
      .getState()
      .refresh(db, userId, null);
    expect(result.status).toBe('timeout');
    const state = useLocationStore.getState();
    expect(state.status).toBe('timeout');
    // Previous good location is preserved so the UI can still show a "last
    // known" hint while telling the user the new attempt failed.
    expect(state.currentLocation?.id).toBe(first?.id);
    db.close();
  });

  it('clear() resets to idle', async () => {
    const db = createInMemoryDb();
    const userId = newUuidV7() as UserId;
    insertUser(db, { id: userId, displayName: 'A', nowIso: NOW_ISO });
    setNativeGetCurrent(
      jest.fn(async () => ({
        latitude: 1,
        longitude: 1,
        provider: 'gps',
        timestampMs: Date.now(),
        wasCached: false,
      })),
    );
    await useLocationStore.getState().refresh(db, userId, null);
    expect(useLocationStore.getState().status).toBe('ok');
    useLocationStore.getState().clear();
    const state = useLocationStore.getState();
    expect(state.status).toBe('idle');
    expect(state.currentLocation).toBeNull();
    expect(state.ageMs).toBeNull();
    expect(state.lastError).toBeNull();
    db.close();
  });
});
