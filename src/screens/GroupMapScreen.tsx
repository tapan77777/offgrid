import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { ListRow } from '../components/ListRow';
import type { StatusTone } from '../components/StatusBadge';
import { MapLibreMapCanvas } from '../components/map/MapLibreMapCanvas';
import type {
  MapCanvasComponent,
  MapCanvasMarker,
} from '../components/map/MapCanvas';
import { colors, spacing, typography } from '../theme';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { bootstrapApp } from '../services/appBootstrap';
import {
  prepareGroupMapView,
  type GroupMapMember,
  type GroupMapView,
} from '../services/location';
import type { RootStackParamList } from '../navigation/RootStack';
import type { GroupId } from '../types/ids';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MapRoute = NativeStackScreenProps<RootStackParamList, 'Map'>['route'];

interface GroupMapScreenProps {
  readonly MapCanvas?: MapCanvasComponent;
}

// GroupMapScreen renders the real Group Map (D-023, D-072).
//
// It NEVER fabricates coordinates:
//   - Own marker comes from the most recent local GPS row *only* when
//     location sharing for this group is enabled.
//   - Peer markers come from received rows persisted with source='peer'
//     and scoped to this specific group (see prepareGroupMapView).
//   - Missing rows appear in the member list with an honest "Waiting for
//     first location" state — no default coordinates.
//
// The map renderer is pluggable via the MapCanvas prop. The default is
// MapLibreMapCanvas (D-072). SchematicMapCanvas is still available for
// tests / dev fallback. Tile provider stays configurable via
// `src/config/mapProvider.ts` (D-073, P-005 remains replaceable).

export function GroupMapScreen({
  MapCanvas = MapLibreMapCanvas,
}: GroupMapScreenProps = {}): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const route = useRoute<MapRoute>();
  const localUserId = useAppFoundationStore(s => s.localUserId);

  const groupId = route.params?.groupId as GroupId | undefined;

  const [view, setView] = useState<GroupMapView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!groupId || !localUserId) {
      setView(null);
      setLoadError('No group selected.');
      setLoading(false);
      return;
    }
    try {
      const { db } = bootstrapApp();
      const next = prepareGroupMapView(db, {
        groupId,
        viewerUserId: localUserId,
      });
      setView(next);
      setLoadError(null);
    } catch (err) {
      setView(null);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [groupId, localUserId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const markers = useMemo<MapCanvasMarker[]>(
    () => (view?.status === 'ok' ? viewToMarkers(view) : []),
    [view],
  );

  if (loading) {
    return (
      <Screen scrollable testID="group-map-screen">
        <Card>
          <Text style={typography.bodySecondary}>Loading map…</Text>
        </Card>
      </Screen>
    );
  }

  if (loadError !== null || !view || view.status !== 'ok') {
    return (
      <Screen scrollable testID="group-map-screen">
        <Card testID="group-map-error">
          <Text style={typography.bodyStrong}>Map unavailable</Text>
          <Text style={[typography.bodySecondary, styles.spaced]}>
            {loadError ??
              (view?.status === 'group-not-found'
                ? 'This group is no longer available on this device.'
                : 'You are no longer a member of this group.')}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Back"
              variant="ghost"
              onPress={() => navigation.goBack()}
              testID="group-map-back"
            />
          </View>
        </Card>
      </Screen>
    );
  }

  const { members, visibleCount } = view;
  const selfMember = members.find(m => m.isSelf);
  const peerMembers = members.filter(m => !m.isSelf);

  return (
    <Screen scrollable testID="group-map-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Group map</Text>
        <Text style={[typography.bodySecondary, styles.sub]}>
          Real positions from this device and any locations already received
          from group members. Nothing is invented.
        </Text>
      </View>

      <View style={styles.section}>
        <MapCanvas
          markers={markers}
          testID="group-map-canvas"
        />
      </View>

      <View style={styles.section}>
        <SummaryRow visibleCount={visibleCount} totalMembers={members.length} />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Members"
          trailing={
            <Button
              label="Refresh"
              variant="ghost"
              size="sm"
              onPress={load}
              testID="group-map-refresh"
            />
          }
        />
        <Card padded={false} testID="group-map-members">
          {selfMember ? (
            <MemberRow member={selfMember} showDivider={false} />
          ) : null}
          {peerMembers.map((m, index) => (
            <MemberRow
              key={m.userId}
              member={m}
              showDivider={selfMember !== undefined || index > 0}
            />
          ))}
        </Card>
      </View>
    </Screen>
  );
}

function SummaryRow({
  visibleCount,
  totalMembers,
}: {
  readonly visibleCount: number;
  readonly totalMembers: number;
}): React.JSX.Element {
  const tone: StatusTone = visibleCount === 0 ? 'offline' : 'connected';
  const label =
    visibleCount === 0
      ? 'No positions yet'
      : `${visibleCount} of ${totalMembers} on the map`;
  return (
    <Card>
      <View style={styles.summaryRow}>
        <View style={styles.summaryText}>
          <Text style={typography.bodyStrong}>Live positions</Text>
          <Text style={[typography.caption, styles.summaryCaption]}>
            {visibleCount === 0
              ? 'Waiting for the first authorized fix.'
              : 'Includes both current and last-known positions.'}
          </Text>
        </View>
        <StatusBadge tone={tone} label={label} />
      </View>
    </Card>
  );
}

function MemberRow({
  member,
  showDivider,
}: {
  readonly member: GroupMapMember;
  readonly showDivider: boolean;
}): React.JSX.Element {
  const title = member.isSelf ? 'You' : shortId(member.userId);
  const subtitle = memberSubtitle(member);
  const badge = memberBadge(member);
  return (
    <View>
      {showDivider ? <View style={styles.divider} /> : null}
      <ListRow
        title={title}
        subtitle={subtitle}
        icon="person"
        iconTone={member.isSelf ? 'brand' : 'neutral'}
        trailing={<StatusBadge tone={badge.tone} label={badge.label} />}
      />
    </View>
  );
}

function memberSubtitle(member: GroupMapMember): string {
  switch (member.status.kind) {
    case 'shareable-current': {
      const { location } = member.status;
      return `${formatCoord(location.latitude)}, ${formatCoord(location.longitude)} · updated ${formatAge(member.status.ageMs)} ago`;
    }
    case 'shareable-stale': {
      const { location } = member.status;
      return `${formatCoord(location.latitude)}, ${formatCoord(location.longitude)} · last known ${formatAge(member.status.ageMs)} ago`;
    }
    case 'sharing-disabled':
      return member.isSelf
        ? 'Sharing is off for this group'
        : 'Not currently sharing';
    case 'no-location':
      return member.isSelf
        ? 'Waiting for your first fix'
        : 'No location received yet';
  }
}

function memberBadge(member: GroupMapMember): {
  tone: StatusTone;
  label: string;
} {
  switch (member.status.kind) {
    case 'shareable-current':
      return { tone: 'connected', label: 'Current' };
    case 'shareable-stale':
      return { tone: 'stale', label: 'Last known' };
    case 'sharing-disabled':
      return { tone: 'offline', label: 'Off' };
    case 'no-location':
      return { tone: 'neutral', label: 'No fix' };
  }
}

function viewToMarkers(
  view: Extract<GroupMapView, { status: 'ok' }>,
): MapCanvasMarker[] {
  const markers: MapCanvasMarker[] = [];
  for (const m of view.members) {
    const status = m.status;
    if (status.kind !== 'shareable-current' && status.kind !== 'shareable-stale') {
      continue;
    }
    const variant =
      m.isSelf && status.kind === 'shareable-current'
        ? 'self-current'
        : m.isSelf && status.kind === 'shareable-stale'
          ? 'self-stale'
          : status.kind === 'shareable-current'
            ? 'peer-current'
            : 'peer-stale';
    markers.push({
      id: m.userId,
      label: m.isSelf ? 'You' : shortId(m.userId),
      latitude: status.location.latitude,
      longitude: status.location.longitude,
      variant,
      ageMs: status.ageMs,
    });
  }
  return markers;
}

function shortId(id: string): string {
  return `Member ${id.slice(0, 6)}`;
}

function formatCoord(value: number): string {
  return value.toFixed(4);
}

function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
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
  spaced: {
    marginTop: spacing.xxs,
  },
  section: {
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  summaryCaption: {
    color: colors.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 48,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
