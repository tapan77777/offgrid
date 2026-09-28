import { create } from 'zustand';
import type { PeerHandle, PeerSessionKey } from '../types/communication';
import type { DeviceId, GroupId, MessageId, UserId } from '../types/ids';

// Consumer-friendly nearby-device state (D-076). Deliberately avoids
// Wi-Fi Direct / MAC / device-id vocabulary — see docs/06-UX-FLOWS.md §11
// and CLAUDE.md §13 (privacy) + §20 (honest UI). Peers are shown as
// "Nearby OFFGRID device #<short>" until identity is revealed by an
// exchanged chat.request.

// Every stage in this union is truthful. `sending` means the request bytes
// have been written to the transport; it does not claim delivery.
// `waitingForReply` means we've written the bytes and are now waiting for
// an accept/decline envelope. `accepted` includes the peer's identity so
// the UI can navigate straight into the direct chat.
export type NearbyRequestState =
  | { readonly stage: 'idle' }
  | {
      readonly stage: 'connecting';
      readonly requestId: MessageId;
      readonly targetPeerKey: PeerSessionKey;
    }
  | {
      readonly stage: 'sending';
      readonly requestId: MessageId;
      readonly targetPeerKey: PeerSessionKey;
    }
  | {
      readonly stage: 'waitingForReply';
      readonly requestId: MessageId;
      readonly targetPeerKey: PeerSessionKey;
    }
  | {
      readonly stage: 'accepted';
      readonly requestId: MessageId;
      readonly targetPeerKey: PeerSessionKey;
      readonly peerUserId: UserId;
      readonly peerDisplayName: string;
      readonly directGroupId: GroupId;
    }
  | {
      readonly stage: 'declined';
      readonly requestId: MessageId;
      readonly targetPeerKey: PeerSessionKey;
    }
  | {
      readonly stage: 'failed';
      readonly reason: string;
      readonly targetPeerKey: PeerSessionKey | null;
    };

// V0 lifecycle mirrors the CommunicationManager state machine but exposes
// only the labels the UI needs. See ConnectionStatus.tsx for the shared
// consumer vocabulary — 'localConnected' etc. are also used from the
// diagnostics/chat screens, so we stay aligned with them.
export type NearbyStatus =
  | 'idle'
  | 'permissionRequired'
  | 'initializing'
  | 'searching'
  | 'stopped'
  | 'error';

export type NearbyPermission =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'never_ask_again'
  | 'not-android';

// Incoming chat requests surfaced to Bob's UI without exposing the raw
// requester userId in the label — the UI shows their `displayName` from
// the wire payload (validated + capped at codec time), which is honest
// because the requester chose to reveal it by tapping "message".
export interface NearbyIncomingRequest {
  readonly requestId: MessageId;
  readonly fromUserId: UserId;
  readonly fromDisplayName: string;
  readonly originDeviceId: DeviceId;
  readonly receivedAt: string;
}

export interface NearbyStoreState {
  readonly status: NearbyStatus;
  readonly permission: NearbyPermission;
  readonly peers: readonly PeerHandle[];
  readonly outgoing: NearbyRequestState;
  readonly incoming: readonly NearbyIncomingRequest[];
  readonly errorMessage: string | null;
  setStatus: (status: NearbyStatus) => void;
  setPermission: (permission: NearbyPermission) => void;
  setPeers: (peers: readonly PeerHandle[]) => void;
  setOutgoing: (state: NearbyRequestState) => void;
  addIncoming: (incoming: NearbyIncomingRequest) => void;
  removeIncoming: (requestId: MessageId) => void;
  setError: (message: string | null) => void;
  reset: () => void;
}

const initial = {
  status: 'idle' as NearbyStatus,
  permission: 'unknown' as NearbyPermission,
  peers: [] as readonly PeerHandle[],
  outgoing: { stage: 'idle' } as NearbyRequestState,
  incoming: [] as readonly NearbyIncomingRequest[],
  errorMessage: null as string | null,
};

export const useNearbyStore = create<NearbyStoreState>(set => ({
  ...initial,
  setStatus: status => set({ status }),
  setPermission: permission => set({ permission }),
  setPeers: peers => set({ peers }),
  setOutgoing: outgoing => set({ outgoing }),
  addIncoming: entry =>
    set(prev => {
      if (prev.incoming.some(i => i.requestId === entry.requestId)) {
        return prev;
      }
      return { incoming: [...prev.incoming, entry] };
    }),
  removeIncoming: requestId =>
    set(prev => ({
      incoming: prev.incoming.filter(i => i.requestId !== requestId),
    })),
  setError: message => set({ errorMessage: message }),
  reset: () => set(initial),
}));

// Deterministic short label for a peer session — used for disambiguation
// in the UI when several nearby devices appear at once. It is NOT the
// device id or MAC address; it's a stable 4-char slice of the peer's
// session key hash so users can tell two rows apart without any technical
// vocabulary leaking through. See CLAUDE.md §13.
export function nearbyPeerLabel(peer: PeerHandle): string {
  const suffix = shortHash(peer.id as string);
  return `Nearby OFFGRID device · ${suffix}`;
}

function shortHash(input: string): string {
  // FNV-1a variant, 32 bit — deterministic across renders without any
  // native crypto dependency (CLAUDE.md §16). The result is only used for
  // UI disambiguation, not for security or identity.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    /* eslint-disable no-bitwise */
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    /* eslint-enable no-bitwise */
  }
  return hash.toString(36).slice(0, 4).toUpperCase().padStart(4, '0');
}
