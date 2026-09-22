// Jest manual mock for @maplibre/maplibre-react-native. Auto-loaded because
// the folder sits adjacent to node_modules. Keeps GroupMapScreen (and
// anything that transitively imports MapLibreMapCanvas) safe to require
// inside Jest without hitting the native module.
//
// The mock is deliberately minimal: exports do not need to render — they
// only need to exist. Tests that assert rendering behavior use the
// SchematicMapCanvas (or inject a stub MapCanvas via prop) rather than
// mounting MapLibre.

const React = require('react');

function passthroughComponent(displayName) {
  const Component = function MockMapLibreComponent(props) {
    return React.createElement(
      'MockMapLibreComponent',
      { ...props, displayName },
      props && props.children,
    );
  };
  Component.displayName = displayName;
  return Component;
}

const MapView = passthroughComponent('MapView');
const Camera = passthroughComponent('Camera');
const PointAnnotation = passthroughComponent('PointAnnotation');
const ShapeSource = passthroughComponent('ShapeSource');
const CircleLayer = passthroughComponent('CircleLayer');
const SymbolLayer = passthroughComponent('SymbolLayer');
const LineLayer = passthroughComponent('LineLayer');
const FillLayer = passthroughComponent('FillLayer');
const RasterLayer = passthroughComponent('RasterLayer');
const RasterSource = passthroughComponent('RasterSource');
const VectorSource = passthroughComponent('VectorSource');
const UserLocation = passthroughComponent('UserLocation');
const MarkerView = passthroughComponent('MarkerView');
const Callout = passthroughComponent('Callout');
const Annotation = passthroughComponent('Annotation');
const Light = passthroughComponent('Light');
const ImageSource = passthroughComponent('ImageSource');
const Images = passthroughComponent('Images');
const BackgroundLayer = passthroughComponent('BackgroundLayer');
const FillExtrusionLayer = passthroughComponent('FillExtrusionLayer');
const HeatmapLayer = passthroughComponent('HeatmapLayer');

const OfflineManager = {
  createPack: jest.fn().mockResolvedValue(undefined),
  deletePack: jest.fn().mockResolvedValue(undefined),
  invalidatePack: jest.fn().mockResolvedValue(undefined),
  getPacks: jest.fn().mockResolvedValue([]),
  getPack: jest.fn().mockResolvedValue(null),
  invalidateAmbientCache: jest.fn().mockResolvedValue(undefined),
  clearAmbientCache: jest.fn().mockResolvedValue(undefined),
  setMaximumAmbientCacheSize: jest.fn().mockResolvedValue(undefined),
  resetDatabase: jest.fn().mockResolvedValue(undefined),
  mergeOfflineRegions: jest.fn().mockResolvedValue(undefined),
  setTileCountLimit: jest.fn(),
  setProgressEventThrottle: jest.fn(),
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn(),
};

const LocationManager = {
  start: jest.fn(),
  stop: jest.fn(),
  getLastKnownLocation: jest.fn().mockResolvedValue(null),
};

const Logger = {
  setLogLevel: jest.fn(),
};

const UserTrackingMode = {
  Follow: 'normal',
  FollowWithHeading: 'compass',
  FollowWithCourse: 'course',
};

const UserLocationRenderMode = {
  Native: 'native',
  Normal: 'normal',
};

const requestAndroidLocationPermissions = jest.fn().mockResolvedValue(true);

const api = {
  MapView,
  Camera,
  PointAnnotation,
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  LineLayer,
  FillLayer,
  RasterLayer,
  RasterSource,
  VectorSource,
  UserLocation,
  MarkerView,
  Callout,
  Annotation,
  Light,
  ImageSource,
  Images,
  BackgroundLayer,
  FillExtrusionLayer,
  HeatmapLayer,
  OfflineManager,
  offlineManager: OfflineManager,
  LocationManager,
  locationManager: LocationManager,
  Logger,
  UserTrackingMode,
  UserLocationRenderMode,
  requestAndroidLocationPermissions,
};

module.exports = { __esModule: true, ...api, default: api };
