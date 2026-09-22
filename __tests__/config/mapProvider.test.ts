import {
  DEFAULT_MAP_PROVIDER,
  assertProviderAllowsOfflineDownload,
  getMapProvider,
  resetMapProvider,
  setMapProvider,
} from '../../src/config/mapProvider';

afterEach(() => {
  resetMapProvider();
});

test('default provider ships with downloadPolicy=disabled', () => {
  const provider = getMapProvider();
  expect(provider.downloadPolicy).toBe('disabled');
  expect(provider.styleUrl).toContain('demotiles.maplibre.org');
});

test('setMapProvider replaces the active provider; resetMapProvider restores default', () => {
  setMapProvider({
    id: 'custom',
    styleUrl: 'https://tiles.example.com/style.json',
    attribution: '© Example',
    downloadPolicy: 'permitted',
    maxOfflineTileCount: 12000,
  });
  expect(getMapProvider().id).toBe('custom');
  resetMapProvider();
  expect(getMapProvider().id).toBe(DEFAULT_MAP_PROVIDER.id);
});

test('assertProviderAllowsOfflineDownload: throws when policy is disabled', () => {
  expect(() =>
    assertProviderAllowsOfflineDownload(DEFAULT_MAP_PROVIDER, DEFAULT_MAP_PROVIDER.styleUrl),
  ).toThrow(/disabled/i);
});

test('assertProviderAllowsOfflineDownload: rejects OSM public tile server even if policy=permitted', () => {
  const provider = {
    id: 'osm-public',
    styleUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    downloadPolicy: 'permitted' as const,
    maxOfflineTileCount: 5000,
  };
  expect(() =>
    assertProviderAllowsOfflineDownload(provider, provider.styleUrl),
  ).toThrow(/openstreetmap\.org/i);
});

test('assertProviderAllowsOfflineDownload: allows a permitted, non-blocklisted provider', () => {
  const provider = {
    id: 'commercial',
    styleUrl: 'https://tiles.example.com/v1/style.json',
    attribution: '© Example',
    downloadPolicy: 'permitted' as const,
    maxOfflineTileCount: 5000,
  };
  expect(() =>
    assertProviderAllowsOfflineDownload(provider, provider.styleUrl),
  ).not.toThrow();
});
