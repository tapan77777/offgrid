// Forward-looking spec for the OFFGRID GPS/Location native module.
//
// Like NativeOffgridP2p.ts, this file documents the intended TurboModule
// interface for React Native Codegen. It is NOT wired into Codegen yet —
// per D-063 the module ships as a classic bridged
// `ReactContextBaseJavaModule` via the New Architecture interop layer.
// This spec exists so the eventual Codegen migration has a clean start.
//
// Native rationale + permission model: see D-071.

export type NativePermissionStatus = {
  fine: boolean;
  coarse: boolean;
};

export type NativeLocationFix = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  provider: string;
  timestampMs: number;
  wasCached: boolean;
};

export interface GetCurrentLocationOptions {
  timeoutMs?: number;
  maxAgeMs?: number;
}

export interface IntendedSpec {
  checkPermission(): Promise<NativePermissionStatus>;
  isLocationEnabled(): Promise<boolean>;
  getCurrentLocation(
    options: GetCurrentLocationOptions | null,
  ): Promise<NativeLocationFix>;
}
