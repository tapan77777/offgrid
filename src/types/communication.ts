import type {
  DeviceId,
  GroupId,
  LocationId,
  MessageId,
  UserId,
} from './ids';

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

// Direct group location payload (Milestone B V0). Carries a single fresh
// location fix scoped to one private group. The sender must be an active
// member with sharing explicitly enabled; the receiver must independently
// verify that the sender is an active member of the same group on this
// device before persisting the coordinate (D-023; CLAUDE.md §13 §15 §20).
// hopCount on the envelope MUST stay 0 for this kind — direct-only V0.
export interface GroupLocationBody {
  readonly kind: 'group.location';
  readonly payload: {
    readonly groupId: GroupId;
    readonly senderUserId: UserId;
    readonly locationId: LocationId;
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracy: number | null;
    readonly altitude: number | null;
    readonly heading: number | null;
    readonly speed: number | null;
    readonly capturedAt: string;
  };
}

export type EnvelopeBody = TestPingBody | GroupLocationBody;

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
