import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { Icon, type IconName } from './Icon';

// Consumer-facing connection states. Deliberately hides Wi-Fi Direct / relay
// / socket vocabulary (D-028). Mirrors `docs/06-UX-FLOWS.md §11`.
export type ConnectionState =
  | 'internet'
  | 'localConnected'
  | 'connecting'
  | 'lastSeen'
  | 'noConnection';

interface ConnectionStatusProps {
  readonly state: ConnectionState;
  readonly nearbyCount?: number;
  readonly lastSeenMinutes?: number;
  readonly testID?: string;
}

export function ConnectionStatus({
  state,
  nearbyCount,
  lastSeenMinutes,
  testID,
}: ConnectionStatusProps): React.JSX.Element {
  const d = describe(state, nearbyCount, lastSeenMinutes);
  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: d.iconBg }]}>
          <Icon name={d.icon} color={d.iconColor} size={18} />
        </View>
        <View style={styles.text}>
          <Text style={[typography.bodyStrong, styles.label]}>{d.label}</Text>
          {d.detail !== null ? (
            <Text style={[typography.caption, styles.detail]}>{d.detail}</Text>
          ) : null}
        </View>
        <StatusBadge tone={d.tone} label={d.pill} />
      </View>
    </View>
  );
}

interface Description {
  readonly tone: StatusTone;
  readonly icon: IconName;
  readonly iconColor: string;
  readonly iconBg: string;
  readonly label: string;
  readonly detail: string | null;
  readonly pill: string;
}

function describe(
  state: ConnectionState,
  nearbyCount: number | undefined,
  lastSeenMinutes: number | undefined,
): Description {
  switch (state) {
    case 'internet':
      return {
        tone: 'internet',
        icon: 'cloud',
        iconColor: colors.statusInternet,
        iconBg: '#152730',
        label: 'Internet connected',
        detail: 'Cloud sync available',
        pill: 'Online',
      };
    case 'localConnected': {
      const n = nearbyCount ?? 0;
      return {
        tone: 'connected',
        icon: 'radio',
        iconColor: colors.brandStrong,
        iconBg: colors.brandSoft,
        label: 'Local connection',
        detail: n === 1 ? '1 device nearby' : `${n} devices nearby`,
        pill: 'Nearby',
      };
    }
    case 'connecting':
      return {
        tone: 'connecting',
        icon: 'radio',
        iconColor: colors.statusConnecting,
        iconBg: '#2B240F',
        label: 'Trying to connect',
        detail: null,
        pill: 'Searching',
      };
    case 'lastSeen': {
      const m = lastSeenMinutes ?? 0;
      const rendered =
        m < 1
          ? 'moments ago'
          : m === 1
            ? '1 minute ago'
            : m < 60
              ? `${m} minutes ago`
              : 'over an hour ago';
      return {
        tone: 'stale',
        icon: 'ring',
        iconColor: colors.statusStale,
        iconBg: '#2B240F',
        label: 'Last connected',
        detail: rendered,
        pill: 'Stale',
      };
    }
    case 'noConnection':
      return {
        tone: 'offline',
        icon: 'signalOff',
        iconColor: colors.textMuted,
        iconBg: colors.surfaceInset,
        label: 'No connection',
        detail: 'You are on your own — messages will send when someone is near',
        pill: 'Offline',
      };
  }
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.textPrimary,
  },
  detail: {
    color: colors.textMuted,
  },
});
