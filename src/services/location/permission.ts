import { PermissionsAndroid, Platform } from 'react-native';

// Location-permission surface for the GPS foundation. This is intentionally
// distinct from `src/utils/permissions.ts` (which handles nearby-devices for
// Wi-Fi Direct) — see D-064 and D-071 for the split.

export type LocationPermissionState =
  | 'granted-fine'
  | 'granted-coarse'
  | 'denied'
  | 'never-ask-again'
  | 'not-android';

export type LocationPermissionKind = 'fine' | 'coarse';

export async function checkLocationPermission(): Promise<LocationPermissionState> {
  if (Platform.OS !== 'android') return 'not-android';
  const fine = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  if (fine) return 'granted-fine';
  const coarse = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  );
  if (coarse) return 'granted-coarse';
  return 'denied';
}

export async function requestLocationPermission(
  kind: LocationPermissionKind = 'fine',
): Promise<LocationPermissionState> {
  if (Platform.OS !== 'android') return 'not-android';
  const target =
    kind === 'fine'
      ? PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      : PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  const result = await PermissionsAndroid.request(target, {
    title: 'OFFGRID location',
    message:
      'OFFGRID uses your device GPS locally so you can see where you are and, later, share your position with your group when you choose to.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  switch (result) {
    case PermissionsAndroid.RESULTS.GRANTED:
      return kind === 'fine' ? 'granted-fine' : 'granted-coarse';
    case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
      return 'never-ask-again';
    default:
      return 'denied';
  }
}
