import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapLibreGL, {
  Camera,
  MapView,
  PointAnnotation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { colors, radii, spacing, typography } from '../../theme';
import { getMapProvider } from '../../config/mapProvider';
import type {
  MapCanvasMarker,
  MapCanvasProps,
  MapMarkerVariant,
} from './MapCanvas';
import { selectInitialCamera } from './mapCameraFit';
import {
  describeVariant,
  getMarkerInitial,
  getMarkerStyle,
} from './mapMarkerStyle';

// MapLibreMapCanvas is the real map renderer that satisfies the
// MapCanvasComponent contract (D-072). The GroupMapScreen wiring is
// unchanged from the schematic era — this component only replaces the
// pixels.
//
// Key rules preserved from the schematic era:
//   * No fabricated coordinates. Only the markers passed in are rendered
//     (invalid coords are filtered out by `selectInitialCamera` and by
//     PointAnnotation's own guard).
//   * Camera never lies about position. When there are no markers we show
//     a deliberately zoomed-out world view + the honest empty-state
//     overlay from the schematic era.
//   * Style-load failure surfaces a clear fallback card instead of a
//     silently blank map (CLAUDE.md §20).
//   * Provider style URL comes from `getMapProvider()` — no URL is
//     embedded here.

MapLibreGL.Logger.setLogLevel('warning');

const CANVAS_HEIGHT = 320;

export function MapLibreMapCanvas({
  markers,
  emptyLabel,
  baseMapUnavailableLabel,
  onMarkerPress,
  testID,
}: MapCanvasProps): React.JSX.Element {
  const cameraRef = useRef<CameraRef>(null);
  const [styleFailed, setStyleFailed] = useState(false);
  const provider = getMapProvider();

  const initialCamera = useMemo(() => selectInitialCamera(markers), [markers]);
  const cameraDefaults = useMemo(() => toCameraDefaults(initialCamera), [
    initialCamera,
  ]);

  const onDidFailLoadingMap = useCallback(() => {
    setStyleFailed(true);
  }, []);

  const onDidFinishLoadingStyle = useCallback(() => {
    setStyleFailed(false);
  }, []);

  const hasMarkers = markers.length > 0;

  if (styleFailed) {
    return (
      <View style={styles.container} testID={testID}>
        <View style={[styles.canvas, styles.fallback]} testID={
          testID ? `${testID}-style-error` : undefined
        }>
          <Text style={[typography.bodyStrong, styles.fallbackTitle]}>
            Map style unavailable
          </Text>
          <Text style={[typography.bodySecondary, styles.fallbackBody]}>
            {baseMapUnavailableLabel ??
              'Could not load the configured base map. Group positions are still tracked — try again when you have network, or configure an offline region.'}
          </Text>
        </View>
      </View>
    );
  }

  const mapViewTestId = testID ? `${testID}-mapview` : undefined;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.canvas}>
        <MapView
          style={styles.map}
          mapStyle={provider.styleUrl}
          logoEnabled={false}
          attributionEnabled
          compassEnabled
          onDidFailLoadingMap={onDidFailLoadingMap}
          onDidFinishLoadingStyle={onDidFinishLoadingStyle}
          {...(mapViewTestId ? { testID: mapViewTestId } : {})}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={cameraDefaults}
            animationMode="moveTo"
            animationDuration={0}
          />
          {markers.map(marker => (
            <MapMarker
              key={marker.id}
              marker={marker}
              onPress={onMarkerPress}
            />
          ))}
        </MapView>
        {!hasMarkers ? (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <Text
              style={[typography.bodySecondary, styles.emptyText]}
              testID={testID ? `${testID}-empty` : undefined}
            >
              {emptyLabel ??
                'No group locations to display yet. Members with sharing on will appear here once a fix arrives.'}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={styles.attributionBar}
        testID={testID ? `${testID}-attribution` : undefined}
      >
        <Text style={[typography.caption, styles.attributionText]}>
          {provider.attribution}
        </Text>
      </View>
    </View>
  );
}

interface MapMarkerProps {
  readonly marker: MapCanvasMarker;
  readonly onPress?: ((marker: MapCanvasMarker) => void) | undefined;
}

function MapMarker({ marker, onPress }: MapMarkerProps): React.JSX.Element | null {
  const handleSelected = useCallback(() => {
    onPress?.(marker);
  }, [marker, onPress]);
  if (!isValidCoordinate(marker)) {
    return null;
  }
  const style = getMarkerStyle(marker.variant);
  return (
    <PointAnnotation
      id={`marker-${marker.id}`}
      coordinate={[marker.longitude, marker.latitude]}
      onSelected={handleSelected}
      title={`${marker.label}: ${describeVariant(marker.variant)}`}
    >
      <View
        style={[
          styles.pin,
          { backgroundColor: style.fill, borderColor: style.border },
        ]}
        testID={`map-marker-${marker.id}`}
      >
        <Text style={[styles.pinInitial, { color: style.text }]}>
          {getMarkerInitial(marker.label)}
        </Text>
      </View>
    </PointAnnotation>
  );
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

type MapCameraDefaults = {
  centerCoordinate?: [number, number];
  zoomLevel?: number;
  bounds?: {
    ne: [number, number];
    sw: [number, number];
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
  };
};

function toCameraDefaults(
  stop: ReturnType<typeof selectInitialCamera>,
): MapCameraDefaults {
  if (stop.kind === 'center') {
    return {
      centerCoordinate: [stop.centerCoordinate[0], stop.centerCoordinate[1]],
      zoomLevel: stop.zoomLevel,
    };
  }
  return {
    bounds: {
      ne: [stop.northEast[0], stop.northEast[1]],
      sw: [stop.southWest[0], stop.southWest[1]],
      paddingLeft: stop.paddingPx,
      paddingRight: stop.paddingPx,
      paddingTop: stop.paddingPx,
      paddingBottom: stop.paddingPx,
    },
  };
}

const PIN_SIZE = 32;

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  canvas: {
    height: CANVAS_HEIGHT,
    backgroundColor: colors.surfaceInset,
    borderRadius: radii.lg,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  fallbackTitle: {
    marginBottom: spacing.xs,
  },
  fallbackBody: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(7, 9, 11, 0.55)',
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  attributionBar: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceInset,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  attributionText: {
    color: colors.textSecondary,
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinInitial: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

// Re-export so TS can enforce our marker variants live here alongside the
// MapCanvasComponent contract.
export type { MapMarkerVariant };
