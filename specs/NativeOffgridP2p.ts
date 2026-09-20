// Phase 3 forward-looking spec.
//
// This file documents the intended TurboModule interface for OFFGRID's Wi-Fi
// Direct native module. It is NOT wired into React Native Codegen in Phase 3
// (no `codegenConfig` entry in `package.json`).
//
// Phase 3 ships the module as a classic bridged `ReactContextBaseJavaModule`
// via the New Architecture interop layer. See D-063 in `docs/10-DECISIONS.md`
// for the rationale (Codegen setup + validation exceeded the Phase 3 scope).
//
// This spec exists so the Phase 4 migration to a proper Codegen'd TurboModule
// has a clean starting point.

export type NativePeer = {
  deviceAddress: string;
  deviceName: string;
  status: number;
};

export type NativePeersChanged = {
  peers: NativePeer[];
};

export type NativeConnectionState = {
  groupFormed: boolean;
  isGroupOwner: boolean;
  groupOwnerAddress: string;
};

export type NativePayload = {
  fromAddress: string;
  base64: string;
};

export interface IntendedSpec {
  initialize(): Promise<boolean>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connectToPeer(deviceAddress: string): Promise<void>;
  sendPayload(base64: string): Promise<void>;
  dispose(): Promise<void>;
}

export const EVENT_PEERS_CHANGED = 'OffgridP2p:peersChanged';
export const EVENT_CONNECTION_STATE = 'OffgridP2p:connectionStateChanged';
export const EVENT_PAYLOAD_RECEIVED = 'OffgridP2p:payloadReceived';
