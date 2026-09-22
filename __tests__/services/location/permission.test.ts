jest.mock('react-native', () => {
  const RESULTS = {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  } as const;
  return {
    NativeModules: {},
    Platform: { OS: 'android', Version: 34 as string | number },
    PermissionsAndroid: {
      PERMISSIONS: {
        ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
        ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
      },
      RESULTS,
      check: jest.fn(),
      request: jest.fn(),
    },
  };
});

import { PermissionsAndroid, Platform } from 'react-native';
import {
  checkLocationPermission,
  requestLocationPermission,
} from '../../../src/services/location/permission';

describe('location permission (D-071)', () => {
  beforeEach(() => {
    (PermissionsAndroid.check as jest.Mock).mockReset();
    (PermissionsAndroid.request as jest.Mock).mockReset();
    (Platform as { OS: string }).OS = 'android';
  });

  it('short-circuits to not-android on iOS', async () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(await checkLocationPermission()).toBe('not-android');
    expect(await requestLocationPermission('fine')).toBe('not-android');
  });

  it('reports granted-fine when fine is granted', async () => {
    (PermissionsAndroid.check as jest.Mock).mockResolvedValueOnce(true);
    expect(await checkLocationPermission()).toBe('granted-fine');
  });

  it('falls back to granted-coarse when only coarse is granted', async () => {
    (PermissionsAndroid.check as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    expect(await checkLocationPermission()).toBe('granted-coarse');
  });

  it('reports denied when neither is granted', async () => {
    (PermissionsAndroid.check as jest.Mock).mockResolvedValue(false);
    expect(await checkLocationPermission()).toBe('denied');
  });

  it('maps RESULTS.NEVER_ASK_AGAIN through requestLocationPermission', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
      PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    );
    expect(await requestLocationPermission('fine')).toBe('never-ask-again');
  });

  it('maps RESULTS.DENIED through requestLocationPermission', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
      PermissionsAndroid.RESULTS.DENIED,
    );
    expect(await requestLocationPermission('fine')).toBe('denied');
  });

  it('maps RESULTS.GRANTED and preserves the requested kind', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue(
      PermissionsAndroid.RESULTS.GRANTED,
    );
    expect(await requestLocationPermission('fine')).toBe('granted-fine');
    expect(await requestLocationPermission('coarse')).toBe('granted-coarse');
  });
});
