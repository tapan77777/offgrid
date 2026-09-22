// Pure camera-fit selection for MapLibreMapCanvas. Given a set of markers,
// picks either a `bounds` fit (multiple points) or a `center + zoomLevel`
// stop (single point / empty). Extracted so the logic is testable without
// loading the MapLibre native module.
//
// D-023: no camera stop is invented from thin air. Empty markers -> a
// deliberately zoomed-out world view so the user sees "there is a map, but
// nothing to show yet" rather than a bogus centered pin.

import type { MapCanvasMarker } from './MapCanvas';

export interface CameraStopCenter {
  readonly kind: 'center';
  readonly centerCoordinate: readonly [number, number]; // [lng, lat]
  readonly zoomLevel: number;
}

export interface CameraStopBounds {
  readonly kind: 'bounds';
  readonly northEast: readonly [number, number]; // [lng, lat]
  readonly southWest: readonly [number, number]; // [lng, lat]
  readonly paddingPx: number;
}

export type CameraStop = CameraStopCenter | CameraStopBounds;

// World-scale fallback when we have nothing to show.
const EMPTY_CAMERA: CameraStopCenter = {
  kind: 'center',
  centerCoordinate: [0, 20], // slightly north of equator — avoids ocean-only view
  zoomLevel: 1.2,
};

// Single-marker zoom: close enough to feel like the user's neighbourhood
// but not so close that a stale peer feels artificially precise.
const SINGLE_MARKER_ZOOM = 13;

// Padding around fitted bounds so pins are not flush against the frame.
const BOUNDS_PADDING_PX = 48;

// If two markers happen to be almost identical, `fitBounds` would zoom to
// max. Clamp to this zoom instead and center on the midpoint.
const IDENTICAL_MARKERS_MAX_ZOOM = 15;
const IDENTICAL_MARKERS_EPSILON_DEG = 0.0002;

export function selectInitialCamera(
  markers: readonly MapCanvasMarker[],
): CameraStop {
  const usable = markers.filter(isValidCoordinate);
  if (usable.length === 0) {
    return EMPTY_CAMERA;
  }
  if (usable.length === 1) {
    const only = usable[0]!;
    return {
      kind: 'center',
      centerCoordinate: [only.longitude, only.latitude],
      zoomLevel: SINGLE_MARKER_ZOOM,
    };
  }
  const lats = usable.map(m => m.latitude);
  const lngs = usable.map(m => m.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  if (
    maxLat - minLat < IDENTICAL_MARKERS_EPSILON_DEG &&
    maxLng - minLng < IDENTICAL_MARKERS_EPSILON_DEG
  ) {
    return {
      kind: 'center',
      centerCoordinate: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
      zoomLevel: IDENTICAL_MARKERS_MAX_ZOOM,
    };
  }
  return {
    kind: 'bounds',
    northEast: [maxLng, maxLat],
    southWest: [minLng, minLat],
    paddingPx: BOUNDS_PADDING_PX,
  };
}

function isValidCoordinate(m: MapCanvasMarker): boolean {
  return (
    Number.isFinite(m.latitude) &&
    Number.isFinite(m.longitude) &&
    m.latitude >= -90 &&
    m.latitude <= 90 &&
    m.longitude >= -180 &&
    m.longitude <= 180
  );
}
