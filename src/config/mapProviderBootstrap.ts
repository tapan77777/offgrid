// Runtime map-provider bootstrap. Called once on app start (see
// `services/appBootstrap.ts`). Reads MapTiler credentials from
// `mapTilerCredentials.ts` and, if a key is configured, installs a
// MapTiler-backed provider via `setMapProvider`. Otherwise leaves the
// default MapLibre demo provider in place.
//
// Kept separate from `mapProvider.ts` so that:
//   - `mapProvider.ts` has zero knowledge of MapTiler credentials.
//   - Jest can exercise the bootstrap with an injected credentials record
//     without patching global state.

import {
  DEFAULT_MAP_PROVIDER,
  makeMapTilerProvider,
  setMapProvider,
} from './mapProvider';
import type { MapProviderConfig } from './mapProvider';
import {
  MAP_TILER_CREDENTIALS,
  type MapTilerCredentials,
} from './mapTilerCredentials';

export interface MapProviderBootstrapResult {
  readonly providerId: string;
  readonly mapTilerConfigured: boolean;
}

export function bootstrapMapProvider(
  credentials: MapTilerCredentials = MAP_TILER_CREDENTIALS,
): MapProviderBootstrapResult {
  const provider = makeMapTilerProvider({
    apiKey: credentials.apiKey,
    styleId: credentials.styleId,
  });
  if (provider) {
    setMapProvider(provider);
    return { providerId: provider.id, mapTilerConfigured: true };
  }
  // No MapTiler key -> keep the shipped default. Callers surface this
  // state to the user in the OfflineMaps screen (CLAUDE.md §20).
  const fallback: MapProviderConfig = DEFAULT_MAP_PROVIDER;
  setMapProvider(fallback);
  return { providerId: fallback.id, mapTilerConfigured: false };
}

// Convenience for tests / diagnostics. Not intended for production code.
export function isMapTilerConfigured(
  credentials: MapTilerCredentials = MAP_TILER_CREDENTIALS,
): boolean {
  return Boolean(credentials.apiKey && credentials.apiKey.trim().length > 0);
}
