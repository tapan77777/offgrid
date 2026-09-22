import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge, type StatusTone } from '../components/StatusBadge';
import { ListRow } from '../components/ListRow';
import { colors, radii, spacing, typography } from '../theme';
import { getMapProvider } from '../config/mapProvider';
import {
  type OfflineRegionSpec,
  type OfflineRegionStatus,
  type OfflineRegionSummary,
  type OfflineRegionsService,
} from '../services/maps/offlineRegions';
import { getOfflineRegionsService } from '../services/maps/offlineRegionsRuntime';
import {
  boundsFromCenterKm,
  OFFLINE_REGION_RADIUS_LIMITS,
} from '../services/maps/offlineRegionGeo';

// OfflineMapsScreen — list + create + delete offline map regions (D-072,
// D-073, P-005). Uses the MapLibre-backed OfflineRegionsService by default;
// tests inject a fake service.
//
// Honest state rules (CLAUDE.md §20):
//   - When MapTiler is not configured we DO NOT let the user tap "Download":
//     the provider's `downloadPolicy` is `disabled` and any attempt would
//     throw. We show a clear "MapTiler not configured" card instead.
//   - Download progress is driven by real callbacks from the driver — we
//     never optimistically claim `complete` before the pack reports it.

interface OfflineMapsScreenProps {
  readonly service?: OfflineRegionsService;
}

interface FormState {
  readonly name: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly radiusKm: string;
  readonly minZoom: string;
  readonly maxZoom: string;
}

const DEFAULT_FORM: FormState = {
  name: 'test-region',
  latitude: '47.6062',
  longitude: '-122.3321',
  radiusKm: '5',
  minZoom: '10',
  maxZoom: '14',
};

export function OfflineMapsScreen({
  service,
}: OfflineMapsScreenProps = {}): React.JSX.Element {
  const svc = useMemo(() => service ?? getOfflineRegionsService(), [service]);
  const provider = getMapProvider();
  const downloadsEnabled = provider.downloadPolicy === 'permitted';

  const [regions, setRegions] = useState<readonly OfflineRegionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<OfflineRegionStatus | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await svc.list();
      setRegions(next);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [svc]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => undefined);
    }, [refresh]),
  );

  const handleDownload = useCallback(async () => {
    if (busy) return;
    setFormError(null);
    if (!downloadsEnabled) {
      setFormError(
        'MapTiler is not configured. Provide an API key before downloading.',
      );
      return;
    }
    let spec: OfflineRegionSpec;
    try {
      spec = formToSpec(form);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      return;
    }
    setBusy(true);
    setActiveName(spec.name);
    setActiveStatus({ kind: 'active', percentage: 0 });
    try {
      await svc.create(spec, status => {
        setActiveStatus(status);
      });
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      setActiveStatus({
        kind: 'errored',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }, [busy, downloadsEnabled, form, refresh, svc]);

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await svc.delete(name);
        await refresh();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh, svc],
  );

  return (
    <Screen scrollable testID="offline-maps-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Offline maps</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Download a small map region so the group map keeps working when you
          lose the network. Downloads use the configured tile provider.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Provider" />
        <Card>
          <View style={styles.providerRow}>
            <View style={styles.providerText}>
              <Text style={typography.bodyStrong}>{provider.id}</Text>
              <Text style={[typography.caption, styles.providerCaption]}>
                {downloadsEnabled
                  ? 'Downloads permitted.'
                  : 'Downloads disabled for this provider.'}
              </Text>
            </View>
            <StatusBadge
              tone={downloadsEnabled ? 'connected' : 'offline'}
              label={downloadsEnabled ? 'Ready' : 'Off'}
            />
          </View>
          {!downloadsEnabled ? (
            <Text
              style={[typography.caption, styles.providerHint]}
              testID="offline-maps-provider-hint"
            >
              MapTiler is not configured. Edit
              {' '}
              <Text style={styles.code}>src/config/mapTilerCredentials.ts</Text>
              {' '}
              and set your API key, then rebuild the app. Never commit the
              key.
            </Text>
          ) : null}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="New region" />
        <Card>
          <FormField
            label="Name"
            value={form.name}
            onChange={v => setForm(prev => ({ ...prev, name: v }))}
            testID="offline-region-name"
          />
          <FormField
            label="Center latitude"
            value={form.latitude}
            onChange={v => setForm(prev => ({ ...prev, latitude: v }))}
            keyboardType="numeric"
            testID="offline-region-lat"
          />
          <FormField
            label="Center longitude"
            value={form.longitude}
            onChange={v => setForm(prev => ({ ...prev, longitude: v }))}
            keyboardType="numeric"
            testID="offline-region-lng"
          />
          <FormField
            label={`Radius (km, ${OFFLINE_REGION_RADIUS_LIMITS.minKm}–${OFFLINE_REGION_RADIUS_LIMITS.maxKm})`}
            value={form.radiusKm}
            onChange={v => setForm(prev => ({ ...prev, radiusKm: v }))}
            keyboardType="numeric"
            testID="offline-region-radius"
          />
          <FormField
            label="Min zoom"
            value={form.minZoom}
            onChange={v => setForm(prev => ({ ...prev, minZoom: v }))}
            keyboardType="numeric"
            testID="offline-region-minZoom"
          />
          <FormField
            label="Max zoom"
            value={form.maxZoom}
            onChange={v => setForm(prev => ({ ...prev, maxZoom: v }))}
            keyboardType="numeric"
            testID="offline-region-maxZoom"
          />
          {formError !== null ? (
            <Text
              style={[typography.caption, styles.error]}
              testID="offline-maps-form-error"
            >
              {formError}
            </Text>
          ) : null}
          {activeName && activeStatus ? (
            <View style={styles.progressRow}>
              <Text style={typography.bodyStrong}>{activeName}</Text>
              <Text
                style={[typography.caption, styles.progressText]}
                testID="offline-maps-progress"
              >
                {describeStatus(activeStatus)}
              </Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={busy ? 'Downloading…' : 'Download region'}
              onPress={() => {
                handleDownload().catch(() => undefined);
              }}
              disabled={busy || !downloadsEnabled}
              leadingIcon="map"
              testID="offline-maps-download"
            />
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Downloaded regions"
          trailing={
            <Button
              label="Refresh"
              variant="ghost"
              size="sm"
              onPress={() => {
                refresh().catch(() => undefined);
              }}
              testID="offline-maps-refresh"
            />
          }
        />
        <Card padded={false} testID="offline-maps-list">
          {loadError !== null ? (
            <View style={styles.emptyBlock}>
              <Text style={[typography.caption, styles.error]}>
                {loadError}
              </Text>
            </View>
          ) : regions.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={typography.bodySecondary}>
                No regions downloaded yet.
              </Text>
            </View>
          ) : (
            regions.map((r, index) => (
              <View key={r.name}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <ListRow
                  title={r.name}
                  subtitle={describeStatus(r.status)}
                  icon="pin"
                  trailing={
                    <StatusBadge
                      tone={statusTone(r.status)}
                      label={statusLabel(r.status)}
                    />
                  }
                  onPress={() => {
                    handleDelete(r.name).catch(() => undefined);
                  }}
                  accessibilityHint={`Deletes offline region ${r.name}`}
                />
              </View>
            ))
          )}
        </Card>
        {regions.length > 0 ? (
          <Text style={[typography.caption, styles.footnote]}>
            Tap a region to delete it. Deletes are immediate — the tiles are
            removed from the on-device cache.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

interface FormFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly keyboardType?: 'default' | 'numeric';
  readonly testID?: string;
}

function FormField({
  label,
  value,
  onChange,
  keyboardType,
  testID,
}: FormFieldProps): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={[typography.caption, styles.fieldLabel]}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.textMuted}
        {...(testID ? { testID } : {})}
      />
    </View>
  );
}

function formToSpec(form: FormState): OfflineRegionSpec {
  const name = form.name.trim();
  if (!name) throw new Error('Region name is required.');
  const latitude = parseFiniteNumber(form.latitude, 'latitude');
  const longitude = parseFiniteNumber(form.longitude, 'longitude');
  const radiusKm = parseFiniteNumber(form.radiusKm, 'radius');
  const minZoom = parseInteger(form.minZoom, 'min zoom');
  const maxZoom = parseInteger(form.maxZoom, 'max zoom');
  const bounds = boundsFromCenterKm({ latitude, longitude, radiusKm });
  return {
    name,
    bounds,
    minZoom,
    maxZoom,
  };
}

function parseFiniteNumber(raw: string, label: string): number {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return value;
}

function parseInteger(raw: string, label: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return value;
}

function describeStatus(status: OfflineRegionStatus): string {
  switch (status.kind) {
    case 'active':
      return `Downloading — ${Math.round(status.percentage)}%`;
    case 'inactive':
      return `Paused — ${Math.round(status.percentage)}%`;
    case 'complete':
      return 'Complete';
    case 'errored':
      return `Error: ${status.message}`;
    case 'unknown':
      return 'Unknown status';
  }
}

function statusLabel(status: OfflineRegionStatus): string {
  switch (status.kind) {
    case 'active':
      return `${Math.round(status.percentage)}%`;
    case 'inactive':
      return 'Paused';
    case 'complete':
      return 'Ready';
    case 'errored':
      return 'Error';
    case 'unknown':
      return '—';
  }
}

function statusTone(status: OfflineRegionStatus): StatusTone {
  switch (status.kind) {
    case 'complete':
      return 'connected';
    case 'active':
      return 'stale';
    case 'inactive':
      return 'neutral';
    case 'errored':
      return 'offline';
    case 'unknown':
      return 'neutral';
  }
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.displayMedium,
  },
  sub: {
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  providerText: {
    flex: 1,
    gap: 2,
  },
  providerCaption: {
    color: colors.textSecondary,
  },
  providerHint: {
    marginTop: spacing.sm,
    color: colors.textMuted,
  },
  code: {
    fontFamily: 'Courier',
    color: colors.textPrimary,
  },
  field: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    color: colors.textSecondary,
    marginBottom: spacing.xxs,
  },
  input: {
    backgroundColor: colors.surfaceInset,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 15,
  },
  error: {
    color: colors.error,
  },
  progressRow: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    gap: 2,
  },
  progressText: {
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  emptyBlock: {
    padding: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 48,
  },
  footnote: {
    marginTop: spacing.xs,
    color: colors.textFaint,
  },
});
