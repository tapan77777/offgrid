import {
  bootstrapMapProvider,
  isMapTilerConfigured,
} from '../../src/config/mapProviderBootstrap';
import {
  DEFAULT_MAP_PROVIDER,
  getMapProvider,
  resetMapProvider,
} from '../../src/config/mapProvider';

// Bootstrap tests: given a credentials record (never the shipped module),
// the runtime picks either the MapTiler provider (when key is present) or
// falls back to the demo default (when it isn't). Ensures we never
// pretend downloads work in the "no key" state.

afterEach(() => {
  resetMapProvider();
});

test('bootstrap with a real MapTiler key installs a permitted MapTiler provider', () => {
  const result = bootstrapMapProvider({
    apiKey: 'test-key',
    styleId: 'outdoor-v2',
  });
  expect(result.mapTilerConfigured).toBe(true);
  expect(result.providerId).toBe('maptiler:outdoor-v2');
  expect(getMapProvider().downloadPolicy).toBe('permitted');
});

test('bootstrap with a null apiKey falls back to the demo provider (downloads disabled)', () => {
  const result = bootstrapMapProvider({ apiKey: null, styleId: 'outdoor-v2' });
  expect(result.mapTilerConfigured).toBe(false);
  expect(result.providerId).toBe(DEFAULT_MAP_PROVIDER.id);
  expect(getMapProvider().downloadPolicy).toBe('disabled');
});

test('bootstrap with an empty apiKey falls back to the demo provider', () => {
  const result = bootstrapMapProvider({ apiKey: '   ', styleId: 'outdoor-v2' });
  expect(result.mapTilerConfigured).toBe(false);
  expect(getMapProvider().downloadPolicy).toBe('disabled');
});

test('isMapTilerConfigured mirrors the bootstrap decision', () => {
  expect(isMapTilerConfigured({ apiKey: null, styleId: 's' })).toBe(false);
  expect(isMapTilerConfigured({ apiKey: '', styleId: 's' })).toBe(false);
  expect(isMapTilerConfigured({ apiKey: 'x', styleId: 's' })).toBe(true);
});

test('bootstrap does NOT leak the API key into providerId', () => {
  const key = 'super-secret-key-DO-NOT-LEAK';
  const result = bootstrapMapProvider({ apiKey: key, styleId: 'outdoor-v2' });
  expect(result.providerId).not.toContain(key);
});
