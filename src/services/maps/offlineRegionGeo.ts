// Small geographic helpers for defining offline map regions from
// human-friendly inputs (center + radius in km). Kept pure so the
// OfflineMapsScreen and its tests can share the same math without touching
// MapLibre.
//
// Approximations used:
//   - 1 degree of latitude  ≈ 111.32 km (constant enough for hiking scale)
//   - 1 degree of longitude ≈ 111.32 km * cos(latitude)
// These are ~0.3% inaccurate at high latitudes but well within what an
// offline pack cares about — MapLibre downloads whole tiles, not points.

import type { OfflineRegionBounds } from './offlineRegions';

const KM_PER_DEG_LAT = 111.32;
const MIN_RADIUS_KM = 0.25;
const MAX_RADIUS_KM = 50; // cap so a slip of the finger doesn't order a
// planet-scale download that ruins somebody's MapTiler quota.

export interface CenterRadius {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusKm: number;
}

export function boundsFromCenterKm(input: CenterRadius): OfflineRegionBounds {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error('Center coordinates must be finite numbers.');
  }
  if (input.latitude < -85 || input.latitude > 85) {
    throw new Error(
      `Center latitude must be within [-85, 85] for tile-based maps (got ${input.latitude}).`,
    );
  }
  if (input.longitude < -180 || input.longitude > 180) {
    throw new Error(
      `Center longitude must be within [-180, 180] (got ${input.longitude}).`,
    );
  }
  if (!Number.isFinite(input.radiusKm)) {
    throw new Error('Radius must be a finite number.');
  }
  if (input.radiusKm < MIN_RADIUS_KM || input.radiusKm > MAX_RADIUS_KM) {
    throw new Error(
      `Radius must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM} km (got ${input.radiusKm}).`,
    );
  }

  const latDelta = input.radiusKm / KM_PER_DEG_LAT;
  const cosLat = Math.cos((input.latitude * Math.PI) / 180);
  // At the poles cosLat approaches 0; clamp so we still emit a valid box.
  const safeCosLat = Math.max(cosLat, 0.05);
  const lngDelta = input.radiusKm / (KM_PER_DEG_LAT * safeCosLat);

  return {
    northEast: {
      latitude: input.latitude + latDelta,
      longitude: input.longitude + lngDelta,
    },
    southWest: {
      latitude: input.latitude - latDelta,
      longitude: input.longitude - lngDelta,
    },
  };
}

export const OFFLINE_REGION_RADIUS_LIMITS = {
  minKm: MIN_RADIUS_KM,
  maxKm: MAX_RADIUS_KM,
} as const;
