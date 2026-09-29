import { create } from 'zustand';
import type { ConnectionState } from '../components/ConnectionStatus';

// D-078. Consumer-facing connectivity snapshot. The store is a thin
// projection of the ConnectivityController's internal state — its only job
// is to feed the ConnectionStatus component and the like on non-Diagnostics
// screens.
//
// The store owns NO transport lifecycle. It only mirrors what the
// controller reports. That keeps CLAUDE.md §20 honest: the UI shows
// "Local connection" only when the controller has observed an actual
// confirmed session (groupFormed + at least one peer session).

// Subset of ConnectionState the controller actually emits. The full union
// lives on the ConnectionStatus component for its own rendering purposes.
export type ConnectivityLabel = ConnectionState;

export interface ConnectivitySnapshot {
  readonly label: ConnectivityLabel;
  // Number of currently-connected local peers (from CommunicationManager
  // sessions). Zero unless label === 'localConnected'.
  readonly nearbyCount: number;
  // How many minutes since a linked peer was last seen connected. Only
  // meaningful when label === 'lastSeen'. Undefined otherwise.
  readonly lastSeenMinutes?: number | undefined;
  // NetInfo says the OS has Internet reachability. Display-only signal
  // (CLAUDE.md §11 — cloud sync is a separate concern, not a message path).
  readonly internetAvailable: boolean;
}

export interface ConnectivityStoreState extends ConnectivitySnapshot {
  set: (partial: Partial<ConnectivitySnapshot>) => void;
  reset: () => void;
}

const INITIAL: ConnectivitySnapshot = {
  label: 'noConnection',
  nearbyCount: 0,
  lastSeenMinutes: undefined,
  internetAvailable: false,
};

export const useConnectivityStore = create<ConnectivityStoreState>(set => ({
  ...INITIAL,
  set: partial => set(partial),
  reset: () => set(INITIAL),
}));
