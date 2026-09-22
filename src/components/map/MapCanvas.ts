import type React from 'react';

// MapCanvas is the renderer abstraction that GroupMapScreen depends on.
// D-009/D-038: the accepted renderer is MapLibre, but the tile provider is
// still P-005 open. Until we can honestly ship a base map, the screen
// renders a schematic canvas that shows *coordinates* honestly (no fake
// tiles / no fake movement) and communicates the missing tile state
// (CLAUDE.md §20).
//
// A future MapLibre implementation will implement this same interface so
// the screen wiring never has to change.

export type MapMarkerVariant =
  | 'self-current'
  | 'self-stale'
  | 'peer-current'
  | 'peer-stale';

export interface MapCanvasMarker {
  readonly id: string;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly variant: MapMarkerVariant;
  readonly ageMs: number;
}

export interface MapCanvasProps {
  readonly markers: readonly MapCanvasMarker[];
  readonly emptyLabel?: string;
  readonly baseMapUnavailableLabel?: string;
  readonly onMarkerPress?: (marker: MapCanvasMarker) => void;
  readonly testID?: string;
}

export type MapCanvasComponent = (
  props: MapCanvasProps,
) => React.JSX.Element;
