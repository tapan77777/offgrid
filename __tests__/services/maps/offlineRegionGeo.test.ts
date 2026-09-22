import {
  boundsFromCenterKm,
  OFFLINE_REGION_RADIUS_LIMITS,
} from '../../../src/services/maps/offlineRegionGeo';

// Tests for the center+radius → bounds helper used by OfflineMapsScreen.
// Rules checked:
//   * bounds are symmetric around the center in latitude
//   * bounds widen (in degrees longitude) at higher latitudes
//   * inputs outside sensible ranges throw — no silent clamping to a giant
//     download

test('boundsFromCenterKm produces a symmetric latitude range', () => {
  const b = boundsFromCenterKm({
    latitude: 47.6,
    longitude: -122.3,
    radiusKm: 5,
  });
  const northDelta = b.northEast.latitude - 47.6;
  const southDelta = 47.6 - b.southWest.latitude;
  expect(Math.abs(northDelta - southDelta)).toBeLessThan(1e-6);
  expect(northDelta).toBeGreaterThan(0);
});

test('boundsFromCenterKm produces a wider longitude span at higher latitudes', () => {
  const low = boundsFromCenterKm({
    latitude: 10,
    longitude: 0,
    radiusKm: 5,
  });
  const high = boundsFromCenterKm({
    latitude: 60,
    longitude: 0,
    radiusKm: 5,
  });
  const lowLngSpan = low.northEast.longitude - low.southWest.longitude;
  const highLngSpan = high.northEast.longitude - high.southWest.longitude;
  expect(highLngSpan).toBeGreaterThan(lowLngSpan);
});

test('boundsFromCenterKm throws for non-finite center', () => {
  expect(() =>
    boundsFromCenterKm({ latitude: Number.NaN, longitude: 0, radiusKm: 5 }),
  ).toThrow(/finite/i);
});

test('boundsFromCenterKm throws for extreme radius', () => {
  expect(() =>
    boundsFromCenterKm({
      latitude: 0,
      longitude: 0,
      radiusKm: OFFLINE_REGION_RADIUS_LIMITS.maxKm + 1,
    }),
  ).toThrow(/Radius/);
  expect(() =>
    boundsFromCenterKm({
      latitude: 0,
      longitude: 0,
      radiusKm: OFFLINE_REGION_RADIUS_LIMITS.minKm / 2,
    }),
  ).toThrow(/Radius/);
});

test('boundsFromCenterKm throws when latitude is beyond tile-map validity', () => {
  expect(() =>
    boundsFromCenterKm({ latitude: 89, longitude: 0, radiusKm: 5 }),
  ).toThrow(/latitude/i);
});
