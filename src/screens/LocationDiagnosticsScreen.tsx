import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { SectionHeader } from '../components/SectionHeader';
import { colors, spacing, typography } from '../theme';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { useLocationStore } from '../store/locationStore';
import { bootstrapApp } from '../services/appBootstrap';
import {
  checkLocationPermission,
  requestLocationPermission,
  type LocationPermissionState,
} from '../services/location';
import type { Location as LocationEntity } from '../types/entities';

// Developer-oriented diagnostic screen for the GPS/Location foundation
// (D-071). Deliberately minimal: permission state, one-shot "Get location"
// button, current fix, accuracy, timestamp, and a stale indicator. No maps,
// no group sharing, no continuous tracking (§23 no feature creep).

export function LocationDiagnosticsScreen(): React.JSX.Element {
  const localUserId = useAppFoundationStore(s => s.localUserId);
  const localDeviceId = useAppFoundationStore(s => s.localDeviceId);
  const store = useLocationStore();
  const [permission, setPermission] =
    useState<LocationPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [peerLocations, setPeerLocations] = useState<LocationEntity[]>([]);

  const refreshPermission = useCallback(() => {
    (async () => {
      try {
        setPermission(await checkLocationPermission());
      } catch {
        setPermission('denied');
      }
    })().catch(() => setPermission('denied'));
  }, []);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  const handleRequest = useCallback(async () => {
    setBusy(true);
    try {
      const result = await requestLocationPermission('fine');
      setPermission(result);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleGet = useCallback(async () => {
    if (!localUserId) return;
    setBusy(true);
    try {
      const { db } = bootstrapApp();
      await store.refresh(db, localUserId, localDeviceId ?? null, {
        timeoutMs: 15_000,
      });
    } finally {
      setBusy(false);
    }
  }, [localDeviceId, localUserId, store]);

  const refreshPeerLocations = useCallback(() => {
    try {
      const { db } = bootstrapApp();
      const { rows } = db.execute(
        `SELECT * FROM locations
         WHERE source = 'peer'
         ORDER BY created_at DESC
         LIMIT 10`,
      );
      const mapped = (rows as unknown as Array<Record<string, unknown>>).map(
        row =>
          ({
            id: row.id,
            userId: row.user_id,
            deviceId: row.device_id ?? null,
            groupId: row.group_id ?? null,
            latitude: row.latitude,
            longitude: row.longitude,
            accuracy: row.accuracy ?? null,
            altitude: row.altitude ?? null,
            heading: row.heading ?? null,
            speed: row.speed ?? null,
            source: row.source,
            createdAt: row.created_at,
            expiresAt: row.expires_at ?? null,
            syncStatus: row.sync_status,
          }) as unknown as LocationEntity,
      );
      setPeerLocations(mapped);
    } catch {
      setPeerLocations([]);
    }
  }, []);

  useEffect(() => {
    refreshPeerLocations();
  }, [refreshPeerLocations]);

  const canGetLocation =
    permission === 'granted-fine' || permission === 'granted-coarse';

  return (
    <Screen scrollable testID="location-diagnostics-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Location diagnostics</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Developer view. One-shot GPS fix using the device's LocationManager.
          Nothing is shared with anyone.
        </Text>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Permission" />
        <Card>
          <View style={styles.row}>
            <Text style={typography.bodyStrong}>Status</Text>
            <StatusBadge
              tone={permissionTone(permission)}
              label={permissionLabel(permission)}
            />
          </View>
          <View style={styles.actionsRow}>
            <Button
              label="Check"
              variant="ghost"
              onPress={refreshPermission}
              disabled={busy}
              testID="location-check-permission"
            />
            <Button
              label="Request fine"
              onPress={handleRequest}
              disabled={busy || permission === 'not-android'}
              testID="location-request-permission"
            />
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Current fix" />
        <Card>
          <View style={styles.row}>
            <Text style={typography.bodyStrong}>State</Text>
            <StatusBadge
              tone={statusTone(store.status)}
              label={statusLabel(store.status)}
            />
          </View>
          <FixDetails />
          <View style={styles.actionsRow}>
            <Button
              label={busy ? 'Working…' : 'Get current location'}
              onPress={handleGet}
              disabled={busy || !canGetLocation || !localUserId}
              testID="location-get-current"
            />
          </View>
          {store.lastError !== null ? (
            <Text style={styles.error} testID="location-error">
              {store.lastError}
            </Text>
          ) : null}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Received peer locations" />
        <Card testID="peer-locations-card">
          <View style={styles.row}>
            <Text style={typography.bodyStrong}>
              {peerLocations.length === 0
                ? 'None yet'
                : `${peerLocations.length} row${peerLocations.length === 1 ? '' : 's'}`}
            </Text>
            <Button
              label="Refresh"
              variant="ghost"
              onPress={refreshPeerLocations}
              testID="peer-locations-refresh"
            />
          </View>
          {peerLocations.length === 0 ? (
            <Text style={[typography.bodySecondary, styles.hint]}>
              No group locations from peers have been received on this device
              yet.
            </Text>
          ) : (
            peerLocations.map(loc => (
              <View key={loc.id} style={styles.peerRow}>
                <Text style={typography.bodyStrong}>
                  {`${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`}
                </Text>
                <Text style={typography.caption}>
                  {`from ${loc.userId.slice(0, 8)}… • ${loc.createdAt}`}
                </Text>
                <Text style={typography.caption}>
                  {`group=${loc.groupId?.slice(0, 8) ?? '—'} • device=${loc.deviceId?.slice(0, 8) ?? '—'}`}
                </Text>
              </View>
            ))
          )}
        </Card>
      </View>
    </Screen>
  );
}

function FixDetails(): React.JSX.Element {
  const location = useLocationStore(s => s.currentLocation);
  const ageMs = useLocationStore(s => s.ageMs);
  if (!location) {
    return (
      <Text style={[typography.bodySecondary, styles.hint]}>
        No fix yet. Tap "Get current location" once permission is granted.
      </Text>
    );
  }
  return (
    <View style={styles.fixBlock}>
      <DetailLine
        label="Latitude"
        value={location.latitude.toFixed(6)}
      />
      <DetailLine
        label="Longitude"
        value={location.longitude.toFixed(6)}
      />
      <DetailLine
        label="Accuracy"
        value={location.accuracy !== null ? `±${location.accuracy.toFixed(1)} m` : '—'}
      />
      <DetailLine
        label="Altitude"
        value={location.altitude !== null ? `${location.altitude.toFixed(1)} m` : '—'}
      />
      <DetailLine
        label="Heading"
        value={location.heading !== null ? `${location.heading.toFixed(0)}°` : '—'}
      />
      <DetailLine
        label="Speed"
        value={location.speed !== null ? `${location.speed.toFixed(2)} m/s` : '—'}
      />
      <DetailLine label="Source" value={location.source} />
      <DetailLine label="Recorded" value={location.createdAt} />
      {ageMs !== null && ageMs > 0 ? (
        <DetailLine
          label="Age"
          value={`${Math.round(ageMs / 1000)}s${ageMs > 60_000 ? ' (stale)' : ''}`}
        />
      ) : null}
    </View>
  );
}

function DetailLine({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.detailRow}>
      <Text style={[typography.bodySecondary, styles.detailLabel]}>{label}</Text>
      <Text style={[typography.bodyStrong, styles.detailValue]}>{value}</Text>
    </View>
  );
}

function permissionLabel(state: LocationPermissionState | null): string {
  switch (state) {
    case 'granted-fine':
      return 'Granted (fine)';
    case 'granted-coarse':
      return 'Granted (coarse)';
    case 'denied':
      return 'Denied';
    case 'never-ask-again':
      return 'Never ask again';
    case 'not-android':
      return 'Not Android';
    default:
      return 'Unknown';
  }
}

function permissionTone(
  state: LocationPermissionState | null,
): 'connected' | 'stale' | 'offline' | 'neutral' {
  switch (state) {
    case 'granted-fine':
      return 'connected';
    case 'granted-coarse':
      return 'stale';
    case 'denied':
    case 'never-ask-again':
      return 'offline';
    default:
      return 'neutral';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'requesting':
      return 'Requesting…';
    case 'ok':
      return 'OK';
    case 'stale':
      return 'Stale';
    case 'timeout':
      return 'Timeout';
    case 'permission-denied':
      return 'Permission denied';
    case 'unavailable':
      return 'Unavailable';
    default:
      return status;
  }
}

function statusTone(
  status: string,
): 'connected' | 'stale' | 'offline' | 'neutral' | 'connecting' {
  switch (status) {
    case 'ok':
      return 'connected';
    case 'stale':
    case 'timeout':
      return 'stale';
    case 'permission-denied':
    case 'unavailable':
      return 'offline';
    case 'requesting':
      return 'connecting';
    default:
      return 'neutral';
  }
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    ...typography.displayMedium,
  },
  sub: {
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  hint: {
    marginBottom: spacing.sm,
  },
  fixBlock: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    gap: spacing.xxs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  detailLabel: {
    color: colors.textSecondary,
  },
  detailValue: {
    fontFamily: 'Courier',
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
  },
  peerRow: {
    borderTopColor: colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    gap: 2,
  },
});
