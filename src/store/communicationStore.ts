import { create } from 'zustand';
import type {
  ConnectionSnapshot,
  PeerHandle,
  TransportState,
} from '../types/communication';

const MAX_LOG_ENTRIES = 50;

export type DiagnosticsLogKind =
  | 'info'
  | 'state'
  | 'peers'
  | 'connection'
  | 'sent'
  | 'received'
  | 'duplicate'
  | 'rejected'
  | 'error';

export interface DiagnosticsLogEntry {
  readonly at: string;
  readonly kind: DiagnosticsLogKind;
  readonly message: string;
}

export interface CommunicationStoreState {
  readonly transportState: TransportState;
  readonly peers: readonly PeerHandle[];
  readonly connection: ConnectionSnapshot | null;
  readonly lastError: string | null;
  readonly log: readonly DiagnosticsLogEntry[];
  setTransportState: (state: TransportState) => void;
  setPeers: (peers: readonly PeerHandle[]) => void;
  setConnection: (connection: ConnectionSnapshot | null) => void;
  setLastError: (message: string | null) => void;
  appendLog: (entry: DiagnosticsLogEntry) => void;
  reset: () => void;
}

const initialState = {
  transportState: 'idle' as TransportState,
  peers: [] as readonly PeerHandle[],
  connection: null as ConnectionSnapshot | null,
  lastError: null as string | null,
  log: [] as readonly DiagnosticsLogEntry[],
};

export const useCommunicationStore = create<CommunicationStoreState>(set => ({
  ...initialState,
  setTransportState: state => set({ transportState: state }),
  setPeers: peers => set({ peers }),
  setConnection: connection => set({ connection }),
  setLastError: message => set({ lastError: message }),
  appendLog: entry =>
    set(prev => {
      const next = [entry, ...prev.log];
      if (next.length > MAX_LOG_ENTRIES) next.length = MAX_LOG_ENTRIES;
      return { log: next };
    }),
  reset: () => set(initialState),
}));
