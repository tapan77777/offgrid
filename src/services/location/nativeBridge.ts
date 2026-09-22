import { NativeModules } from 'react-native';
import type {
  GetCurrentLocationOptions,
  NativeLocationFix,
  NativePermissionStatus,
} from '../../../specs/NativeOffgridLocation';

// The classic bridge exposes the module under this name (must match the
// Kotlin `MODULE_NAME` companion constant).
interface OffgridLocationNativeModule {
  checkPermission(): Promise<NativePermissionStatus>;
  isLocationEnabled(): Promise<boolean>;
  getCurrentLocation(
    options: GetCurrentLocationOptions | null,
  ): Promise<NativeLocationFix>;
}

// Read from NativeModules on every call so tests can inject / swap the
// module without needing to reload the JS module. If the module is missing
// (e.g. Jest, iOS, or a native package that failed to register), callers
// see `undefined` and surface an honest "unavailable" state.
export function getNativeLocationModule():
  | OffgridLocationNativeModule
  | undefined {
  return (NativeModules as unknown as Record<string, unknown>)
    .OffgridLocation as OffgridLocationNativeModule | undefined;
}

export type { NativeLocationFix, NativePermissionStatus };
