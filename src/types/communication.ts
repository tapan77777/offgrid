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

// Chat V1 (D-074). Direct-only text message envelope: hopCount=0, ttl=0,
// destinationDeviceId=null. Bodies are validated at the codec boundary
// (all IDs UUIDv7, capped text, ISO instant). Persistence is the receiver
// service's job, not the codec's or the CommunicationManager's.
export const MAX_MSG_TEXT_UTF8_BYTES = 8192;

export interface MsgTextBody {
  readonly kind: 'msg.text';
  readonly payload: {
    readonly groupId: GroupId;
    readonly senderUserId: UserId;
    readonly messageId: MessageId;
    readonly text: string;
    readonly createdAt: string;
  };
}

// Group join V1 (D-075). Offline nearby group discovery + membership install.
//
// Request: B broadcasts the normalized join code plus its own identity so any
// nearby device that hosts a matching group can reply. The `code` is a
// convenience token, not a secret (see 05-SECURITY.md §8 / joinCode.ts).
//
// Invite: A unicasts the group snapshot back to B's `originDeviceId`. B uses
// this to install the group + its active member set locally so A↔B chat can
// begin immediately. Envelope stays direct-only (ttl=0, hopCount=0).
//
// Both envelope kinds are ignored by the RelayRouter (never persisted in the
// diagnostic group, never forwarded).
export const MAX_JOIN_DISPLAY_NAME_LENGTH = 64;
export const MAX_JOIN_GROUP_NAME_LENGTH = 64;
export const MAX_JOIN_INVITE_MEMBERS = 50;

export interface GroupJoinRequestBody {
  readonly kind: 'group.join.request';
  readonly payload: {
    readonly code: string;
    readonly joinerUserId: UserId;
    readonly joinerDisplayName: string;
  };
}

export interface GroupJoinInviteMember {
  readonly userId: UserId;
  readonly displayName: string;
  readonly role: 'admin' | 'member';
  readonly joinedAt: string;
}

export interface GroupJoinInviteBody {
  readonly kind: 'group.join.invite';
  readonly payload: {
    readonly code: string;
    readonly groupId: GroupId;
    readonly groupName: string;
    readonly groupCreatedAt: string;
    readonly joinerUserId: UserId;
    readonly members: readonly GroupJoinInviteMember[];
  };
}

// Chat request V1 (D-076). Consumer-friendly 1-to-1 handshake used before
// any msg.text can be exchanged. Identity is revealed inside the request
// itself (privacy-first: before a request, a nearby peer is shown as an
// anonymous "Nearby OFFGRID device"). Direct-only envelopes: hopCount=0,
// ttl=0, never persisted in the diagnostic group and never forwarded by
// the RelayRouter. See docs/10-DECISIONS.md D-076.
export const MAX_CHAT_REQUEST_DISPLAY_NAME_LENGTH = 64;

// `toUserId` is nullable. Wi-Fi Direct peer discovery only exposes device
// addresses, not OFFGRID user identities — so the requester frequently does
// not know the recipient's userId at the moment they tap "message this
// nearby device". A `null` toUserId means: "for whoever receives this
// directly over the WFD link that has already formed". A concrete UserId
// keeps the strict-addressing semantic when the requester already knows it
// (e.g., a future flow where identity was previously exchanged).
export interface ChatRequestBody {
  readonly kind: 'chat.request';
  readonly payload: {
    readonly requestId: MessageId;
    readonly fromUserId: UserId;
    readonly fromDisplayName: string;
    readonly toUserId: UserId | null;
  };
}

export interface ChatRequestAcceptBody {
  readonly kind: 'chat.request.accept';
  readonly payload: {
    readonly requestId: MessageId;
    readonly accepterUserId: UserId;
    readonly accepterDisplayName: string;
    readonly requesterUserId: UserId;
  };
}

export interface ChatRequestDeclineBody {
  readonly kind: 'chat.request.decline';
  readonly payload: {
    readonly requestId: MessageId;
    readonly declinerUserId: UserId;
    readonly requesterUserId: UserId;
  };
}

export type EnvelopeBody =
  | TestPingBody
  | GroupLocationBody
  | MsgTextBody
  | GroupJoinRequestBody
  | GroupJoinInviteBody
  | ChatRequestBody
  | ChatRequestAcceptBody
  | ChatRequestDeclineBody;

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
