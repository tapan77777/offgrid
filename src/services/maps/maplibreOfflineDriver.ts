// MapLibre-backed OfflineRegionDriver. This is the on-device implementation
// that hits the real MapLibre offline pack API (D-072). It is kept separate
// from `offlineRegions.ts` so that Jest (which cannot load MapLibre's native
// module) can exercise the service without importing this file.
//
// State mapping between MapLibre and OFFGRID:
//   MapLibre state 0 (inactive) -> { kind: 'inactive', percentage }
//   MapLibre state 1 (active)   -> { kind: 'active',   percentage }
//   MapLibre state 2 (complete) -> { kind: 'complete' }
//   MapLibre error event        -> { kind: 'errored',  message }
//
// Any state value outside [0, 2] collapses to { kind: 'unknown' } so the UI
// never invents a percentage.

import { OfflineManager } from '@maplibre/maplibre-react-native';
import type { OfflinePackStatus } from '@maplibre/maplibre-react-native';
import type {
  OfflineRegionBounds,
  OfflineRegionDriver,
  OfflineRegionProgressListener,
  OfflineRegionSpec,
  OfflineRegionStatus,
  OfflineRegionSummary,
} from './offlineRegions';

const STATE_INACTIVE = 0;
const STATE_ACTIVE = 1;
const STATE_COMPLETE = 2;

interface StoredMetadata {
  readonly bounds: OfflineRegionBounds;
}

export class MapLibreOfflineRegionDriver implements OfflineRegionDriver {
  async list(): Promise<readonly OfflineRegionSummary[]> {
    const packs = await OfflineManager.getPacks();
    const summaries: OfflineRegionSummary[] = [];
    for (const pack of packs) {
      const name = pack.name;
      if (!name) continue;
      const metadata = (pack.metadata as StoredMetadata | null) ?? null;
      const bounds = metadata?.bounds ?? emptyBounds();
      const rawStatus = await pack.status();
      summaries.push({
        name,
        bounds,
        status: mapStatus(rawStatus),
      });
    }
    return summaries;
  }

  async create(
    spec: OfflineRegionSpec,
    styleUrl: string,
    onProgress?: OfflineRegionProgressListener,
  ): Promise<void> {
    const { northEast, southWest } = spec.bounds;
    const metadata: StoredMetadata & Record<string, unknown> = {
      bounds: spec.bounds,
      ...(spec.metadata ?? {}),
    };
    await OfflineManager.createPack(
      {
        name: spec.name,
        styleURL: styleUrl,
        bounds: [
          [northEast.longitude, northEast.latitude],
          [southWest.longitude, southWest.latitude],
        ],
        minZoom: spec.minZoom,
        maxZoom: spec.maxZoom,
        metadata,
      },
      (_pack, status) => onProgress?.(mapStatus(status)),
      (_pack, err) =>
        onProgress?.({ kind: 'errored', message: err.message ?? err.name }),
    );
  }

  async pause(name: string): Promise<void> {
    const pack = await OfflineManager.getPack(name);
    if (pack) {
      await pack.pause();
    }
  }

  async resume(
    name: string,
    onProgress?: OfflineRegionProgressListener,
  ): Promise<void> {
    const pack = await OfflineManager.getPack(name);
    if (!pack) return;
    if (onProgress) {
      await OfflineManager.subscribe(
        name,
        (_p, status) => onProgress(mapStatus(status)),
        (_p, err) =>
          onProgress({ kind: 'errored', message: err.message ?? err.name }),
      );
    }
    await pack.resume();
  }

  async delete(name: string): Promise<void> {
    await OfflineManager.deletePack(name);
  }

  async isAvailable(name: string): Promise<boolean> {
    const pack = await OfflineManager.getPack(name);
    if (!pack) return false;
    const status = await pack.status();
    return status.state === STATE_COMPLETE;
  }
}

function mapStatus(raw: OfflinePackStatus): OfflineRegionStatus {
  switch (raw.state) {
    case STATE_INACTIVE:
      return { kind: 'inactive', percentage: clampPercentage(raw.percentage) };
    case STATE_ACTIVE:
      return { kind: 'active', percentage: clampPercentage(raw.percentage) };
    case STATE_COMPLETE:
      return { kind: 'complete' };
    default:
      return { kind: 'unknown' };
  }
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function emptyBounds(): OfflineRegionBounds {
  return {
    northEast: { latitude: 0, longitude: 0 },
    southWest: { latitude: 0, longitude: 0 },
  };
}
