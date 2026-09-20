import type { DeviceId, MessageId } from './ids';

export type TransportId = 'wifi-p2p' | 'mock';

export type TransportState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'discovering'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type PeerSessionKey = string & { readonly __peerSessionKey: unique symbol };

export interface PeerHandle {
  readonly id: PeerSessionKey;
  readonly transport: TransportId;
  readonly deviceAddress: string;
  readonly displayName: string | null;
  readonly lastSeenAt: string;
}

export interface ConnectionSnapshot {
  readonly groupFormed: boolean;
  readonly isGroupOwner: boolean;
  readonly groupOwnerAddress: string | null;
}

export interface TestPing {
  readonly v: 1;
  readonly kind: 'test.ping';
  readonly id: MessageId;
  readonly fromDeviceId: DeviceId;
  readonly textPreview: string;
  readonly sentAt: string;
}
