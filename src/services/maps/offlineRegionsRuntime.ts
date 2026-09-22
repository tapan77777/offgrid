// Runtime construction of the offline-region service backed by MapLibre.
// Kept in its own tiny module so tests import `offlineRegions.ts` (pure
// contract + in-memory driver) without pulling MapLibre native code in.

import { MapLibreOfflineRegionDriver } from './maplibreOfflineDriver';
import { OfflineRegionsService } from './offlineRegions';

let cached: OfflineRegionsService | null = null;

export function getOfflineRegionsService(): OfflineRegionsService {
  if (!cached) {
    cached = new OfflineRegionsService(new MapLibreOfflineRegionDriver());
  }
  return cached;
}

export function __resetOfflineRegionsServiceForTests(): void {
  cached = null;
}
