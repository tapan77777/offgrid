import { PermissionsAndroid, Platform } from 'react-native';

export type NearbyWifiPermissionResult =
  | 'granted'
  | 'denied'
  | 'never_ask_again'
  | 'not-android';

export function requiredNearbyWifiPermission():
  | 'android.permission.NEARBY_WIFI_DEVICES'
  | 'android.permission.ACCESS_FINE_LOCATION'
  | null {
  if (Platform.OS !== 'android') return null;
  const version = typeof Platform.Version === 'number'
    ? Platform.Version
    : parseInt(String(Platform.Version), 10);
  if (Number.isFinite(version) && version >= 33) {
    return 'android.permission.NEARBY_WIFI_DEVICES';
  }
  return 'android.permission.ACCESS_FINE_LOCATION';
}

export async function hasNearbyWifiPermission(): Promise<boolean> {
  const perm = requiredNearbyWifiPermission();
  if (!perm) return true;
  return PermissionsAndroid.check(
    perm as (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS],
  );
}

export async function ensureNearbyWifiPermission(): Promise<NearbyWifiPermissionResult> {
  const perm = requiredNearbyWifiPermission();
  if (!perm) return 'not-android';
  const result = await PermissionsAndroid.request(
    perm as (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS],
    {
      title: 'OFFGRID nearby devices',
      message:
        'OFFGRID needs nearby-devices access to discover and talk to your group without Internet.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  switch (result) {
    case PermissionsAndroid.RESULTS.GRANTED:
      return 'granted';
    case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
      return 'never_ask_again';
    default:
      return 'denied';
  }
}
