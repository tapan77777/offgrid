// Variant → visual style for map markers. Extracted from the renderer so
// it can be reused (schematic / MapLibre) and tested without loading the
// native module. Colour tokens must match SchematicMapCanvas so the two
// renderers look consistent when swapped.

import { colors } from '../../theme';
import type { MapMarkerVariant } from './MapCanvas';

export interface MarkerStyle {
  readonly fill: string;
  readonly border: string;
  readonly text: string;
  readonly stale: boolean;
}

export function getMarkerStyle(variant: MapMarkerVariant): MarkerStyle {
  switch (variant) {
    case 'self-current':
      return {
        fill: colors.brandSoft,
        border: colors.brandBright,
        text: colors.brandBright,
        stale: false,
      };
    case 'self-stale':
      return {
        fill: '#2B240F',
        border: colors.statusStale,
        text: colors.statusStale,
        stale: true,
      };
    case 'peer-current':
      return {
        fill: colors.surfaceRaised,
        border: colors.brandStrong,
        text: colors.brandBright,
        stale: false,
      };
    case 'peer-stale':
      return {
        fill: '#2B240F',
        border: colors.statusStale,
        text: colors.statusStale,
        stale: true,
      };
  }
}

export function describeVariant(variant: MapMarkerVariant): string {
  switch (variant) {
    case 'self-current':
      return 'you, current position';
    case 'self-stale':
      return 'you, last-known position';
    case 'peer-current':
      return 'current position';
    case 'peer-stale':
      return 'last-known position';
  }
}

export function getMarkerInitial(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) return '?';
  return trimmed.charAt(0).toUpperCase();
}
