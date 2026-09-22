// Map provider configuration. The renderer (MapLibre, D-072) is fixed, but
// the tile / vector-tile provider is deliberately replaceable (P-005 remains
// open; D-073 abstracts the choice). Any code that needs a style URL or
// wants to decide whether an offline pack is allowed reads from here rather
// than hard-coding a URL.
//
// Rules enforced by this module:
//   - `styleUrl` is the single source of truth for the map style. No other
//     module may embed a provider URL in code.
//   - `downloadPolicy: 'disabled'` means the offline region service refuses
//     to create packs against this provider. `demotiles.maplibre.org` is
//     `disabled` because its terms do not permit bulk tile downloads.
//   - `openstreetmap.org` public tile servers are never allowed for bulk
//     offline downloads (per user directive and OSMF tile usage policy).
//     `assertProviderAllowsOfflineDownload` throws for those hosts.

export interface MapProviderConfig {
  readonly id: string;
  readonly styleUrl: string;
  readonly attribution: string;
  readonly downloadPolicy: 'disabled' | 'permitted';
  readonly maxOfflineTileCount: number;
}

// The default provider is the official MapLibre demo style. It is only
// suitable for development and preview. Its terms do not permit prefetch /
// bulk offline downloads — so `downloadPolicy` is `disabled` here.
// Production providers (OSM-derived commercial services, self-hosted
// tileserver-gl, sideloaded MBTiles) will be selected under P-005 and can
// override this at runtime via `setMapProvider`.
export const DEFAULT_MAP_PROVIDER: MapProviderConfig = {
  id: 'maplibre-demo',
  styleUrl: 'https://demotiles.maplibre.org/style.json',
  attribution: '© MapLibre contributors',
  downloadPolicy: 'disabled',
  maxOfflineTileCount: 6000,
};

const DISALLOWED_OFFLINE_HOSTS = new Set<string>([
  // OSMF public tile server: bulk offline downloads violate its usage policy.
  // See https://operations.osmfoundation.org/policies/tiles/ .
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
]);

let current: MapProviderConfig = DEFAULT_MAP_PROVIDER;

export function getMapProvider(): MapProviderConfig {
  return current;
}

export function setMapProvider(next: MapProviderConfig): void {
  current = next;
}

export function resetMapProvider(): void {
  current = DEFAULT_MAP_PROVIDER;
}

// Guard used by the offline region service before any bulk download.
// Refuses to prefetch tiles against providers whose terms disallow it, or
// against any provider that has been explicitly marked `downloadPolicy:
// 'disabled'`. Throws instead of silently degrading — the caller must
// surface this to the user (CLAUDE.md §20).
export function assertProviderAllowsOfflineDownload(
  provider: MapProviderConfig,
  styleUrl: string,
): void {
  if (provider.downloadPolicy !== 'permitted') {
    throw new Error(
      `Offline downloads are disabled for provider '${provider.id}'. ` +
        `Configure a provider whose terms permit bulk downloads before ` +
        `creating an offline region.`,
    );
  }
  const host = extractHost(styleUrl);
  if (host && DISALLOWED_OFFLINE_HOSTS.has(host.toLowerCase())) {
    throw new Error(
      `Offline downloads against '${host}' are not permitted by that ` +
        `provider's terms of service. Select a provider that allows ` +
        `prefetch or use a self-hosted / sideloaded tile source.`,
    );
  }
}

function extractHost(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? (match[1] ?? null) : null;
}
