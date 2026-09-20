jest.mock('react-native', () => {
  const Platform = { OS: 'android', Version: 33 as string | number };
  const RESULTS = {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  } as const;
  const PermissionsAndroid = {
    PERMISSIONS: {
      NEARBY_WIFI_DEVICES: 'android.permission.NEARBY_WIFI_DEVICES',
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
    RESULTS,
    check: jest.fn(async () => true),
    request: jest.fn(async () => RESULTS.GRANTED),
  };
  return { Platform, PermissionsAndroid };
});

import { Platform, PermissionsAndroid } from 'react-native';
import {
  ensureNearbyWifiPermission,
  hasNearbyWifiPermission,
  requiredNearbyWifiPermission,
} from '../../src/utils/permissions';

describe('nearby-devices permission (D-064)', () => {
  beforeEach(() => {
    (PermissionsAndroid.check as jest.Mock).mockReset();
    (PermissionsAndroid.request as jest.Mock).mockReset();
    (PermissionsAndroid.check as jest.Mock).mockResolvedValue(true);
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue(
      PermissionsAndroid.RESULTS.GRANTED,
    );
  });

  it('resolves NEARBY_WIFI_DEVICES on API 33+', () => {
    (Platform as { Version: number }).Version = 33;
    expect(requiredNearbyWifiPermission()).toBe(
      'android.permission.NEARBY_WIFI_DEVICES',
    );
  });

  it('resolves ACCESS_FINE_LOCATION on API 32 and below', () => {
    (Platform as { Version: number }).Version = 32;
    expect(requiredNearbyWifiPermission()).toBe(
      'android.permission.ACCESS_FINE_LOCATION',
    );
  });

  it('short-circuits to true when not on Android', async () => {
    (Platform as { OS: string }).OS = 'ios';
    try {
      expect(await hasNearbyWifiPermission()).toBe(true);
    } finally {
      (Platform as { OS: string }).OS = 'android';
    }
  });

  it('translates PermissionsAndroid RESULTS.NEVER_ASK_AGAIN through the union', async () => {
    (Platform as { Version: number }).Version = 33;
    (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
      PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    );
    expect(await ensureNearbyWifiPermission()).toBe('never_ask_again');
  });

  it('translates RESULTS.DENIED', async () => {
    (Platform as { Version: number }).Version = 33;
    (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
      PermissionsAndroid.RESULTS.DENIED,
    );
    expect(await ensureNearbyWifiPermission()).toBe('denied');
  });

  it('translates RESULTS.GRANTED', async () => {
    (Platform as { Version: number }).Version = 33;
    (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce(
      PermissionsAndroid.RESULTS.GRANTED,
    );
    expect(await ensureNearbyWifiPermission()).toBe('granted');
  });
});
