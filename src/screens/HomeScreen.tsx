import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppFoundationStore } from '../store/appFoundationStore';
import { withPrefix } from '../utils/ids';
import type { RootStackParamList } from '../navigation/RootStack';

export function HomeScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const status = useAppFoundationStore(s => s.status);
  const schemaVersion = useAppFoundationStore(s => s.schemaVersion);
  const localDeviceId = useAppFoundationStore(s => s.localDeviceId);
  const deviceWasCreated = useAppFoundationStore(s => s.deviceWasCreated);
  const error = useAppFoundationStore(s => s.error);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      testID="home-screen"
    >
      <Text style={styles.title}>OFFGRID</Text>
      <Text style={styles.tagline}>
        Stay connected when the network disappears.
      </Text>
      <Text style={styles.phase}>Phase 2 — Local Foundation</Text>

      <View style={styles.statusBlock} testID="foundation-status">
        <StatusRow label="DB status" value={statusLabel(status)} />
        <StatusRow
          label="Schema"
          value={schemaVersion === null ? '—' : `v${schemaVersion}`}
        />
        <StatusRow
          label="Device ID"
          value={localDeviceId ? shortDeviceId(localDeviceId) : '—'}
          testID="device-id-display"
        />
        <StatusRow
          label="Origin"
          value={
            localDeviceId === null
              ? '—'
              : deviceWasCreated
                ? 'created this launch'
                : 'restored from local DB'
          }
        />
        {error !== null ? (
          <Text style={styles.errorText} testID="foundation-error">
            {error}
          </Text>
        ) : null}
      </View>

      {__DEV__ ? (
        <Pressable
          onPress={() => navigation.navigate('Diagnostics')}
          style={({ pressed }) => [
            styles.diagButton,
            pressed && styles.diagButtonPressed,
          ]}
          testID="open-diagnostics"
        >
          <Text style={styles.diagButtonText}>Open diagnostics</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StatusRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return 'starting…';
    case 'loading':
      return 'initializing…';
    case 'ready':
      return 'ready';
    case 'error':
      return 'error';
    default:
      return status;
  }
}

function shortDeviceId(deviceId: string): string {
  return withPrefix('dev', deviceId).slice(0, 16) + '…';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0b0d10',
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#f5f5f5',
    letterSpacing: 4,
  },
  tagline: {
    marginTop: 12,
    fontSize: 16,
    color: '#9aa0a6',
    textAlign: 'center',
  },
  phase: {
    marginTop: 32,
    fontSize: 12,
    color: '#5f6368',
    letterSpacing: 2,
  },
  statusBlock: {
    marginTop: 40,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#1c1f24',
    borderRadius: 8,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  rowLabel: {
    color: '#5f6368',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  rowValue: {
    color: '#e8eaed',
    fontSize: 14,
    fontFamily: 'Courier',
  },
  errorText: {
    marginTop: 12,
    color: '#ff6b6b',
    fontSize: 12,
  },
  diagButton: {
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a3f45',
  },
  diagButtonPressed: {
    opacity: 0.6,
  },
  diagButtonText: {
    color: '#9aa0a6',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
