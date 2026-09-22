// Offline map regions service. Small abstraction so the GroupMapScreen (or
// any future settings UI) can list / create / pause / resume / delete
// offline packs without depending on MapLibre's specific API. Backed by
// MapLibre on device (D-072); tests inject a fake driver.
//
// This file intentionally does NOT import '@maplibre/maplibre-react-native'
// so it can be exercised in Jest without loading the native module. The
// concrete MapLibre-backed driver lives in `./maplibreOfflineDriver.ts`
// and is wired up at runtime by callers that render the real map.

import {
  assertProviderAllowsOfflineDownload,
  getMapProvider,
  type MapProviderConfig,
} from '../../config/mapProvider';

export interface OfflineRegionCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export interface OfflineRegionBounds {
  readonly northEast: OfflineRegionCoordinate;
  readonly southWest: OfflineRegionCoordinate;
}

export interface OfflineRegionSpec {
  readonly name: string;
  readonly bounds: OfflineRegionBounds;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type OfflineRegionStatus =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'inactive'; readonly percentage: number }
  | { readonly kind: 'active'; readonly percentage: number }
  | { readonly kind: 'complete' }
  | { readonly kind: 'errored'; readonly message: string };

export interface OfflineRegionSummary {
  readonly name: string;
  readonly bounds: OfflineRegionBounds;
  readonly status: OfflineRegionStatus;
}

export type OfflineRegionProgressListener = (
  status: OfflineRegionStatus,
) => void;

// The driver is the seam between our service and the native map SDK.
// Real driver -> MapLibre `OfflineManager`.
// Fake driver -> in-memory Map for tests + non-map screens.
export interface OfflineRegionDriver {
  list(): Promise<readonly OfflineRegionSummary[]>;
  create(
    spec: OfflineRegionSpec,
    styleUrl: string,
    onProgress?: OfflineRegionProgressListener,
  ): Promise<void>;
  pause(name: string): Promise<void>;
  resume(name: string, onProgress?: OfflineRegionProgressListener): Promise<void>;
  delete(name: string): Promise<void>;
  isAvailable(name: string): Promise<boolean>;
}

export class OfflineRegionsService {
  constructor(
    private readonly driver: OfflineRegionDriver,
    private readonly providerFn: () => MapProviderConfig = getMapProvider,
  ) {}

  list(): Promise<readonly OfflineRegionSummary[]> {
    return this.driver.list();
  }

  async create(
    spec: OfflineRegionSpec,
    onProgress?: OfflineRegionProgressListener,
  ): Promise<void> {
    validateSpec(spec);
    const provider = this.providerFn();
    assertProviderAllowsOfflineDownload(provider, provider.styleUrl);
    return this.driver.create(spec, provider.styleUrl, onProgress);
  }

  pause(name: string): Promise<void> {
    return this.driver.pause(name);
  }

  resume(name: string, onProgress?: OfflineRegionProgressListener): Promise<void> {
    return this.driver.resume(name, onProgress);
  }

  delete(name: string): Promise<void> {
    return this.driver.delete(name);
  }

  isAvailable(name: string): Promise<boolean> {
    return this.driver.isAvailable(name);
  }
}

function validateSpec(spec: OfflineRegionSpec): void {
  if (!spec.name || spec.name.trim().length === 0) {
    throw new Error('Offline region name is required.');
  }
  if (spec.minZoom < 0 || spec.maxZoom < spec.minZoom || spec.maxZoom > 22) {
    throw new Error(
      `Offline region zoom range is invalid (min=${spec.minZoom}, max=${spec.maxZoom}).`,
    );
  }
  const { northEast, southWest } = spec.bounds;
  if (
    !isFiniteCoord(northEast.latitude) ||
    !isFiniteCoord(northEast.longitude) ||
    !isFiniteCoord(southWest.latitude) ||
    !isFiniteCoord(southWest.longitude)
  ) {
    throw new Error('Offline region bounds contain non-finite values.');
  }
  if (northEast.latitude < southWest.latitude) {
    throw new Error(
      'Offline region NE latitude must be greater than SW latitude.',
    );
  }
  if (northEast.longitude < southWest.longitude) {
    throw new Error(
      'Offline region NE longitude must be greater than SW longitude.',
    );
  }
}

function isFiniteCoord(v: number): boolean {
  return Number.isFinite(v);
}

// Fake driver used by tests and by any UI surface that needs a stub before
// the real MapLibre driver is wired up.
export class InMemoryOfflineRegionDriver implements OfflineRegionDriver {
  private regions = new Map<string, OfflineRegionSummary>();

  async list(): Promise<readonly OfflineRegionSummary[]> {
    return Array.from(this.regions.values());
  }

  async create(
    spec: OfflineRegionSpec,
    _styleUrl: string,
    onProgress?: OfflineRegionProgressListener,
  ): Promise<void> {
    if (this.regions.has(spec.name)) {
      throw new Error(`Offline region '${spec.name}' already exists.`);
    }
    const summary: OfflineRegionSummary = {
      name: spec.name,
      bounds: spec.bounds,
      status: { kind: 'active', percentage: 0 },
    };
    this.regions.set(spec.name, summary);
    onProgress?.({ kind: 'active', percentage: 0 });
    // Simulate immediate completion for deterministic tests.
    this.regions.set(spec.name, { ...summary, status: { kind: 'complete' } });
    onProgress?.({ kind: 'complete' });
  }

  async pause(name: string): Promise<void> {
    const region = this.regions.get(name);
    if (!region) {
      return;
    }
    if (region.status.kind === 'active') {
      this.regions.set(name, {
        ...region,
        status: { kind: 'inactive', percentage: region.status.percentage },
      });
    }
  }

  async resume(
    name: string,
    onProgress?: OfflineRegionProgressListener,
  ): Promise<void> {
    const region = this.regions.get(name);
    if (!region) {
      return;
    }
    if (region.status.kind === 'inactive') {
      const next: OfflineRegionSummary = {
        ...region,
        status: { kind: 'active', percentage: region.status.percentage },
      };
      this.regions.set(name, next);
      onProgress?.(next.status);
    }
  }

  async delete(name: string): Promise<void> {
    this.regions.delete(name);
  }

  async isAvailable(name: string): Promise<boolean> {
    const region = this.regions.get(name);
    return region?.status.kind === 'complete';
  }
}
