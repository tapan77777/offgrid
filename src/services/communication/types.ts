import type {
  ConnectionSnapshot,
  PeerHandle,
  TransportId,
  TransportState,
} from '../../types/communication';

export type TransportEvent =
  | { readonly kind: 'stateChanged'; readonly state: TransportState }
  | { readonly kind: 'peersChanged'; readonly peers: readonly PeerHandle[] }
  | { readonly kind: 'connectionChanged'; readonly snapshot: ConnectionSnapshot }
  | {
      readonly kind: 'payloadReceived';
      readonly fromAddress: string;
      readonly bytes: Uint8Array;
    }
  | { readonly kind: 'error'; readonly message: string };

export type TransportEventListener = (event: TransportEvent) => void;

export interface Transport {
  readonly id: TransportId;
  initialize(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connectToPeer(deviceAddress: string): Promise<void>;
  sendPayload(bytes: Uint8Array): Promise<void>;
  on(listener: TransportEventListener): () => void;
  dispose(): Promise<void>;
}
