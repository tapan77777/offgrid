import React, { useCallback, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import type { MapCanvasMarker, MapCanvasProps } from './MapCanvas';

// SchematicMapCanvas is the tile-less V0 implementation of MapCanvas
// (D-009/D-038, P-005 open). It renders coordinates as absolutely
// positioned markers on a padded grid so users can see *relative*
// positions of group members without a base map. It is deliberately
// honest about the missing base map (CLAUDE.md §20).
//
// Projection is linear: min/max of visible latitude/longitude → screen
// rectangle, with a single-marker fallback that centers the marker.
// The projection is not geographically accurate — this is a schematic.

const CANVAS_HEIGHT = 320;
const MIN_SPAN_DEG = 0.001; // avoid divide-by-zero for near-identical points
const MARKER_INSET = spacing.lg;

export function SchematicMapCanvas({
  markers,
  emptyLabel,
  baseMapUnavailableLabel,
  onMarkerPress,
  testID,
}: MapCanvasProps): React.JSX.Element {
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: CANVAS_HEIGHT,
  });

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const drawableWidth = Math.max(0, size.width - MARKER_INSET * 2);
  const drawableHeight = Math.max(0, size.height - MARKER_INSET * 2);

  const projected = projectMarkers(
    markers,
    drawableWidth,
    drawableHeight,
    MARKER_INSET,
  );
  const hasMarkers = markers.length > 0;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.canvas} onLayout={onLayout}>
        <Grid />
        {projected.map(({ marker, x, y }) => (
          <MarkerPin
            key={marker.id}
            marker={marker}
            x={x}
            y={y}
            onPress={onMarkerPress}
          />
        ))}
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
      <View style={styles.baseMapBanner} testID={
        testID ? `${testID}-basemap-banner` : undefined
      }>
        <View style={styles.bannerDot} />
        <Text style={[typography.caption, styles.bannerText]}>
          {baseMapUnavailableLabel ??
            'Base map style not configured yet — showing schematic positions only.'}
        </Text>
      </View>
    </View>
  );
}

interface Projected {
  marker: MapCanvasMarker;
  x: number;
  y: number;
}

function projectMarkers(
  markers: readonly MapCanvasMarker[],
  drawableWidth: number,
  drawableHeight: number,
  inset: number,
): Projected[] {
  if (markers.length === 0 || drawableWidth <= 0 || drawableHeight <= 0) {
    return [];
  }
  const lats = markers.map(m => m.latitude);
  const lngs = markers.map(m => m.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(MIN_SPAN_DEG, maxLat - minLat);
  const lngSpan = Math.max(MIN_SPAN_DEG, maxLng - minLng);

  return markers.map(m => {
    // Longitude → X (west→east). Latitude → Y (north→south, so flipped).
    const nx = (m.longitude - minLng) / lngSpan;
    const ny = 1 - (m.latitude - minLat) / latSpan;
    const x = inset + nx * drawableWidth;
    const y = inset + ny * drawableHeight;
    return { marker: m, x, y };
  });
}

function Grid(): React.JSX.Element {
  return (
    <View style={styles.grid} pointerEvents="none">
      {[0.25, 0.5, 0.75].map(f => (
        <View
          key={`h-${f}`}
          style={[styles.gridLineH, { top: `${f * 100}%` }]}
        />
      ))}
      {[0.25, 0.5, 0.75].map(f => (
        <View
          key={`v-${f}`}
          style={[styles.gridLineV, { left: `${f * 100}%` }]}
        />
      ))}
    </View>
  );
}

interface MarkerPinProps {
  marker: MapCanvasMarker;
  x: number;
  y: number;
  onPress?: ((marker: MapCanvasMarker) => void) | undefined;
}

function MarkerPin({
  marker,
  x,
  y,
  onPress,
}: MarkerPinProps): React.JSX.Element {
  const variantStyle = getVariantStyle(marker.variant);
  const handlePress = useCallback(() => {
    onPress?.(marker);
  }, [marker, onPress]);

  const pinStyle: ViewStyle = {
    position: 'absolute',
    left: x - PIN_SIZE / 2,
    top: y - PIN_SIZE / 2,
  };

  return (
    <Pressable
      onPress={handlePress}
      style={pinStyle}
      accessibilityRole="button"
      accessibilityLabel={`${marker.label}: ${describeVariant(marker.variant)}`}
      testID={`map-marker-${marker.id}`}
    >
      <View
        style={[
          styles.pin,
          { backgroundColor: variantStyle.fill, borderColor: variantStyle.border },
        ]}
      >
        <Text style={[styles.pinInitial, { color: variantStyle.text }]}>
          {getInitial(marker.label)}
        </Text>
      </View>
      <View
        style={[styles.pinTail, { borderTopColor: variantStyle.border }]}
      />
    </Pressable>
  );
}

const PIN_SIZE = 32;

function getVariantStyle(variant: MapCanvasMarker['variant']): {
  fill: string;
  border: string;
  text: string;
} {
  switch (variant) {
    case 'self-current':
      return {
        fill: colors.brandSoft,
        border: colors.brandBright,
        text: colors.brandBright,
      };
    case 'self-stale':
      return {
        fill: '#2B240F',
        border: colors.statusStale,
        text: colors.statusStale,
      };
    case 'peer-current':
      return {
        fill: colors.surfaceRaised,
        border: colors.brandStrong,
        text: colors.brandBright,
      };
    case 'peer-stale':
      return {
        fill: '#2B240F',
        border: colors.statusStale,
        text: colors.statusStale,
      };
  }
}

function describeVariant(variant: MapCanvasMarker['variant']): string {
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

function getInitial(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return '?';
  }
  return trimmed.charAt(0).toUpperCase();
}

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
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    opacity: 0.4,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    opacity: 0.4,
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
  pinTail: {
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
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
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  baseMapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceInset,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.statusStale,
  },
  bannerText: {
    color: colors.textSecondary,
    flex: 1,
  },
});
