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

export const MAX_ENVELOPE_TTL = 5;
export const MAX_ENVELOPE_HOP_COUNT = 64;

export interface TestPingBody {
  readonly kind: 'test.ping';
  readonly payload: { readonly textPreview: string };
}

export type EnvelopeBody = TestPingBody;

export interface MessageEnvelope {
  readonly v: 1;
  readonly kind: 'msg.envelope';
  readonly id: MessageId;
  readonly originDeviceId: DeviceId;
  readonly destinationDeviceId: DeviceId | null;
  readonly ttl: number;
  readonly hopCount: number;
  readonly sentAt: string;
  readonly body: EnvelopeBody;
}
