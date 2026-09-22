import { create } from 'zustand';
import type { OffgridDb } from '../database';
import {
  getCurrentLocation,
  type LocationReadResult,
  type RequestLocationOptions,
} from '../services/location';
import type { Location as LocationEntity } from '../types/entities';
import type { DeviceId, UserId } from '../types/ids';

// UI-facing cache for the current-location surface. The `locations` table
// remains the source of truth — this store only exists so screens can
// render synchronously without re-querying on every focus change.

export type LocationStatus =
  | 'idle'
  | 'requesting'
  | 'ok'
  | 'stale'
  | 'timeout'
  | 'permission-denied'
  | 'unavailable';

export interface LocationState {
  status: LocationStatus;
  currentLocation: LocationEntity | null;
  ageMs: number | null;
  lastError: string | null;
  refresh(
    db: OffgridDb,
    userId: UserId,
    deviceId: DeviceId | null,
    options?: RequestLocationOptions,
  ): Promise<LocationReadResult>;
  clear(): void;
}

export const useLocationStore = create<LocationState>(set => ({
  status: 'idle',
  currentLocation: null,
  ageMs: null,
  lastError: null,
  async refresh(db, userId, deviceId, options) {
    set({ status: 'requesting', lastError: null });
    try {
      const result = await getCurrentLocation(
        { db, userId, deviceId: deviceId ?? null },
        options,
      );
      applyResult(set, result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({
        status: 'unavailable',
        lastError: message,
      });
      return { status: 'unavailable', reason: message };
    }
  },
  clear() {
    set({
      status: 'idle',
      currentLocation: null,
      ageMs: null,
      lastError: null,
    });
  },
}));

function applyResult(
  set: (partial: Partial<LocationState>) => void,
  result: LocationReadResult,
): void {
  switch (result.status) {
    case 'ok':
      set({
        status: 'ok',
        currentLocation: result.location,
        ageMs: 0,
        lastError: null,
      });
      return;
    case 'stale':
      set({
        status: 'stale',
        currentLocation: result.location,
        ageMs: result.ageMs,
        lastError: null,
      });
      return;
    case 'permission-denied':
      set({
        status: 'permission-denied',
        lastError: 'Location permission not granted',
      });
      return;
    case 'timeout':
      set({
        status: 'timeout',
        lastError: 'No location fix in time',
      });
      return;
    case 'unavailable':
      set({
        status: 'unavailable',
        lastError: result.reason,
      });
  }
}
