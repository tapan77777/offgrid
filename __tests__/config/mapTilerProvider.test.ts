import {
  assertProviderAllowsOfflineDownload,
  buildMapTilerStyleUrl,
  makeMapTilerProvider,
} from '../../src/config/mapProvider';

// MapTiler provider tests. Cover the shape of the built style URL (P-005),
// the null-safety of the factory when credentials are missing, and the
// interaction with the download guard (D-073). These are all pure tests —
// no network, no native module.

test('buildMapTilerStyleUrl embeds style + key with URL encoding', () => {
  const url = buildMapTilerStyleUrl('outdoor-v2', 'abc123');
  expect(url).toBe(
    'https://api.maptiler.com/maps/outdoor-v2/style.json?key=abc123',
  );
});

test('buildMapTilerStyleUrl URL-encodes special characters in inputs', () => {
  const url = buildMapTilerStyleUrl('custom/style', 'a b+c');
  expect(url).toContain('custom%2Fstyle');
  expect(url).toContain('a%20b%2Bc');
});

test('makeMapTilerProvider returns null when apiKey is missing', () => {
  expect(makeMapTilerProvider({ apiKey: null, styleId: 'outdoor-v2' })).toBeNull();
  expect(makeMapTilerProvider({ apiKey: '', styleId: 'outdoor-v2' })).toBeNull();
  expect(makeMapTilerProvider({ apiKey: '   ', styleId: 'outdoor-v2' })).toBeNull();
});

test('makeMapTilerProvider returns null when styleId is missing', () => {
  expect(makeMapTilerProvider({ apiKey: 'k', styleId: '' })).toBeNull();
});

test('makeMapTilerProvider ships a permitted, downloadable provider when credentials are complete', () => {
  const provider = makeMapTilerProvider({
    apiKey: 'REAL_KEY',
    styleId: 'outdoor-v2',
  });
  expect(provider).not.toBeNull();
  if (!provider) throw new Error('provider expected');
  expect(provider.id).toBe('maptiler:outdoor-v2');
  expect(provider.downloadPolicy).toBe('permitted');
  expect(provider.attribution).toMatch(/MapTiler/);
  expect(provider.attribution).toMatch(/OpenStreetMap/);
  // Sanity: the download guard accepts it.
  expect(() =>
    assertProviderAllowsOfflineDownload(provider, provider.styleUrl),
  ).not.toThrow();
});

test('makeMapTilerProvider clamps maxOfflineTileCount to a sane default', () => {
  const provider = makeMapTilerProvider({
    apiKey: 'K',
    styleId: 'outdoor-v2',
  });
  if (!provider) throw new Error('provider expected');
  expect(provider.maxOfflineTileCount).toBeGreaterThan(0);
  expect(provider.maxOfflineTileCount).toBeLessThanOrEqual(20000);
});
