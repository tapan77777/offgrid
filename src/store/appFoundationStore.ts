import { create } from 'zustand';
import type { DeviceId, UserId } from '../types/ids';

export type BootStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AppFoundationState {
  status: BootStatus;
  schemaVersion: number | null;
  localDeviceId: DeviceId | null;
  deviceWasCreated: boolean;
  localUserId: UserId | null;
  userWasCreated: boolean;
  error: string | null;
  setLoading: () => void;
  setReady: (payload: {
    schemaVersion: number;
    localDeviceId: DeviceId;
    deviceWasCreated: boolean;
    localUserId: UserId;
    userWasCreated: boolean;
  }) => void;
  setError: (message: string) => void;
}

export const useAppFoundationStore = create<AppFoundationState>(set => ({
  status: 'idle',
  schemaVersion: null,
  localDeviceId: null,
  deviceWasCreated: false,
  localUserId: null,
  userWasCreated: false,
  error: null,
  setLoading: () =>
    set({ status: 'loading', error: null }),
  setReady: payload =>
    set({
      status: 'ready',
      schemaVersion: payload.schemaVersion,
      localDeviceId: payload.localDeviceId,
      deviceWasCreated: payload.deviceWasCreated,
      localUserId: payload.localUserId,
      userWasCreated: payload.userWasCreated,
      error: null,
    }),
  setError: message =>
    set({ status: 'error', error: message }),
}));
