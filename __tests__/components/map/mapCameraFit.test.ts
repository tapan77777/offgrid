import { selectInitialCamera } from '../../../src/components/map/mapCameraFit';
import type { MapCanvasMarker } from '../../../src/components/map/MapCanvas';

// Camera-fit tests. All assertions cover the invariants of D-072/D-023:
//   * no invented coordinates when markers are empty
//   * single-marker view is honest (centered, fixed zoom, not "world")
//   * multi-marker view uses real min/max bounds only
//   * degenerate (identical) markers do not zoom to max
//   * invalid coordinates are filtered out before the camera is chosen

function marker(
  id: string,
  latitude: number,
  longitude: number,
  variant: MapCanvasMarker['variant'] = 'peer-current',
): MapCanvasMarker {
  return { id, label: id, latitude, longitude, variant, ageMs: 0 };
}

test('selectInitialCamera: no markers → deliberately zoomed-out world view', () => {
  const stop = selectInitialCamera([]);
  expect(stop.kind).toBe('center');
  if (stop.kind === 'center') {
    expect(stop.zoomLevel).toBeLessThan(3);
    // Do not center on a specific country / user — an honest "nothing to show"
    // camera lives near (0, 20).
    expect(stop.centerCoordinate[0]).toBeCloseTo(0, 1);
  }
});

test('selectInitialCamera: single marker → centered at that coord with useful zoom', () => {
  const stop = selectInitialCamera([marker('a', 47.6062, -122.3321)]);
  expect(stop.kind).toBe('center');
  if (stop.kind === 'center') {
    expect(stop.centerCoordinate).toEqual([-122.3321, 47.6062]);
    expect(stop.zoomLevel).toBeGreaterThanOrEqual(10);
    expect(stop.zoomLevel).toBeLessThanOrEqual(16);
  }
});

test('selectInitialCamera: multiple markers → bounds fit with padding', () => {
  const stop = selectInitialCamera([
    marker('a', 47.61, -122.34),
    marker('b', 47.60, -122.33),
    marker('c', 47.62, -122.32),
  ]);
  expect(stop.kind).toBe('bounds');
  if (stop.kind === 'bounds') {
    expect(stop.northEast).toEqual([-122.32, 47.62]);
    expect(stop.southWest).toEqual([-122.34, 47.60]);
    expect(stop.paddingPx).toBeGreaterThan(0);
  }
});

test('selectInitialCamera: near-identical markers → centered stop, not degenerate bounds', () => {
  const stop = selectInitialCamera([
    marker('a', 47.6062, -122.3321),
    marker('b', 47.6062, -122.3321),
  ]);
  expect(stop.kind).toBe('center');
  if (stop.kind === 'center') {
    expect(stop.centerCoordinate[0]).toBeCloseTo(-122.3321, 4);
    expect(stop.centerCoordinate[1]).toBeCloseTo(47.6062, 4);
    expect(stop.zoomLevel).toBeLessThanOrEqual(18);
  }
});

test('selectInitialCamera: invalid coordinates are filtered out', () => {
  const stop = selectInitialCamera([
    marker('bogus1', Number.NaN, -122.33),
    marker('bogus2', 200, 0),
    marker('bogus3', 0, 999),
  ]);
  // All markers invalid → falls back to empty-world camera.
  expect(stop.kind).toBe('center');
});

test('selectInitialCamera: mix of valid + invalid → uses only the valid coords', () => {
  const stop = selectInitialCamera([
    marker('good', 47.6, -122.3),
    marker('bogus', Number.NaN, Number.NaN),
  ]);
  expect(stop.kind).toBe('center');
  if (stop.kind === 'center') {
    expect(stop.centerCoordinate).toEqual([-122.3, 47.6]);
  }
});
