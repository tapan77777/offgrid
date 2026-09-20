import type {
  ConnectionSnapshot,
  PeerHandle,
  PeerSessionKey,
  TransportId,
} from '../../../types/communication';
import type {
  Transport,
  TransportEvent,
  TransportEventListener,
} from '../types';
import type {
  NativeConnectionState,
  NativePayload,
  NativePeer,
  NativePeersChanged,
} from '../../../../specs/NativeOffgridP2p';
import {
  loadProductionNativeSurface,
  type NativeEventSubscription,
  type NativeSurface,
} from './nativeSurface';

export interface WifiP2pTransportOptions {
  readonly nativeSurface?: NativeSurface;
  readonly nowIso?: () => string;
}

export class WifiP2pTransport implements Transport {
  readonly id: TransportId = 'wifi-p2p';

  private readonly native: NativeSurface;
  private readonly nowIso: () => string;
  private readonly listeners = new Set<TransportEventListener>();
  private readonly subscriptions: NativeEventSubscription[] = [];
  private initialized = false;

  constructor(options: WifiP2pTransportOptions = {}) {
    this.native = options.nativeSurface ?? loadProductionNativeSurface();
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  on(listener: TransportEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.subscriptions.push(
      this.native.onPeersChanged(event => this.handlePeers(event)),
      this.native.onConnectionStateChanged(event =>
        this.handleConnection(event),
      ),
      this.native.onPayloadReceived(event => this.handlePayload(event)),
    );
    await this.native.initialize();
    this.initialized = true;
    this.emit({ kind: 'stateChanged', state: 'ready' });
  }

  async startDiscovery(): Promise<void> {
    await this.native.startDiscovery();
    this.emit({ kind: 'stateChanged', state: 'discovering' });
  }

  async stopDiscovery(): Promise<void> {
    await this.native.stopDiscovery();
  }

  async connectToPeer(deviceAddress: string): Promise<void> {
    await this.native.connectToPeer(deviceAddress);
  }

  async sendPayload(bytes: Uint8Array): Promise<void> {
    const base64 = uint8ArrayToBase64(bytes);
    await this.native.sendPayload(base64);
  }

  async dispose(): Promise<void> {
    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions.length = 0;
    this.listeners.clear();
    this.initialized = false;
    await this.native.dispose();
  }

  private handlePeers(event: NativePeersChanged): void {
    const now = this.nowIso();
    const peers: PeerHandle[] = event.peers.map(nativePeerToHandle(now));
    this.emit({ kind: 'peersChanged', peers });
  }

  private handleConnection(event: NativeConnectionState): void {
    const snapshot: ConnectionSnapshot = {
      groupFormed: event.groupFormed,
      isGroupOwner: event.isGroupOwner,
      groupOwnerAddress:
        event.groupOwnerAddress === '' ? null : event.groupOwnerAddress,
    };
    this.emit({ kind: 'connectionChanged', snapshot });
  }

  private handlePayload(event: NativePayload): void {
    const bytes = base64ToUint8Array(event.base64);
    this.emit({
      kind: 'payloadReceived',
      fromAddress: event.fromAddress,
      bytes,
    });
  }

  private emit(event: TransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function nativePeerToHandle(nowIso: string): (peer: NativePeer) => PeerHandle {
  return peer => ({
    id: `peer:wifi-p2p:${peer.deviceAddress}` as PeerSessionKey,
    transport: 'wifi-p2p',
    deviceAddress: peer.deviceAddress,
    displayName: peer.deviceName === '' ? null : peer.deviceName,
    lastSeenAt: nowIso,
  });
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
  }

  const globalBuffer = (
    globalThis as unknown as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } } }
  ).Buffer;
  if (globalBuffer) {
    return globalBuffer.from(bytes).toString('base64');
  }
  throw new Error('no base64 encoder available');
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  const globalBuffer = (
    globalThis as unknown as {
      Buffer?: {
        from(data: string, enc: string): { readonly length: number; [k: number]: number };
      };
    }
  ).Buffer;
  if (globalBuffer) {
    const buf = globalBuffer.from(base64, 'base64');
    const out = new Uint8Array(buf.length);
    for (let i = 0; i < buf.length; i += 1) {
      out[i] = buf[i] ?? 0;
    }
    return out;
  }
  throw new Error('no base64 decoder available');
}
