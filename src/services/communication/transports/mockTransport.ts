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

export interface MockTransportInit {
  readonly nodeName: string;
  readonly deviceAddress: string;
  readonly peerId: PeerSessionKey;
}

export class MockTransport implements Transport {
  readonly id: TransportId = 'mock';
  readonly nodeName: string;
  readonly deviceAddress: string;
  readonly peerId: PeerSessionKey;

  private readonly listeners = new Set<TransportEventListener>();
  private peer: MockTransport | null = null;
  private discovering = false;
  private connected = false;
  private disposed = false;

  constructor(init: MockTransportInit) {
    this.nodeName = init.nodeName;
    this.deviceAddress = init.deviceAddress;
    this.peerId = init.peerId;
  }

  static pair(a: MockTransport, b: MockTransport): void {
    a.peer = b;
    b.peer = a;
  }

  on(listener: TransportEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async initialize(): Promise<void> {
    this.assertAlive();
    this.emit({ kind: 'stateChanged', state: 'ready' });
  }

  async startDiscovery(): Promise<void> {
    this.assertAlive();
    this.discovering = true;
    this.emit({ kind: 'stateChanged', state: 'discovering' });
    if (this.peer && this.peer.discovering) {
      this.emitPeers();
      this.peer.emitPeers();
    }
  }

  async stopDiscovery(): Promise<void> {
    this.discovering = false;
  }

  async connectToPeer(deviceAddress: string): Promise<void> {
    this.assertAlive();
    if (!this.peer || this.peer.deviceAddress !== deviceAddress) {
      throw new Error(`MockTransport ${this.nodeName}: no peer at ${deviceAddress}`);
    }
    this.setConnected(true, false);
    this.peer.setConnected(true, true);
  }

  async sendPayload(bytes: Uint8Array): Promise<void> {
    this.assertAlive();
    if (!this.connected || !this.peer) {
      throw new Error(`MockTransport ${this.nodeName}: not connected`);
    }
    const copy = new Uint8Array(bytes);
    this.peer.emit({
      kind: 'payloadReceived',
      fromAddress: this.deviceAddress,
      bytes: copy,
    });
  }

  disconnect(): void {
    if (!this.connected) return;
    this.setConnected(false, false);
    if (this.peer && this.peer.connected) {
      this.peer.setConnected(false, false);
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.listeners.clear();
    this.peer = null;
  }

  private setConnected(connected: boolean, isGroupOwner: boolean): void {
    this.connected = connected;
    const snapshot: ConnectionSnapshot = {
      groupFormed: connected,
      isGroupOwner,
      groupOwnerAddress: connected
        ? isGroupOwner
          ? this.deviceAddress
          : (this.peer?.deviceAddress ?? null)
        : null,
    };
    this.emit({ kind: 'connectionChanged', snapshot });
  }

  private emitPeers(): void {
    if (!this.peer) {
      this.emit({ kind: 'peersChanged', peers: [] });
      return;
    }
    const handle: PeerHandle = {
      id: this.peer.peerId,
      transport: 'mock',
      deviceAddress: this.peer.deviceAddress,
      displayName: this.peer.nodeName,
      lastSeenAt: new Date().toISOString(),
    };
    this.emit({ kind: 'peersChanged', peers: [handle] });
  }

  private emit(event: TransportEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error(`MockTransport ${this.nodeName} disposed`);
    }
  }
}

export interface MockTransportPair {
  readonly a: MockTransport;
  readonly b: MockTransport;
}

export function createMockTransportPair(
  peerIdA: PeerSessionKey = 'peer:A' as PeerSessionKey,
  peerIdB: PeerSessionKey = 'peer:B' as PeerSessionKey,
): MockTransportPair {
  const a = new MockTransport({
    nodeName: 'A',
    deviceAddress: '00:00:00:00:00:0A',
    peerId: peerIdA,
  });
  const b = new MockTransport({
    nodeName: 'B',
    deviceAddress: '00:00:00:00:00:0B',
    peerId: peerIdB,
  });
  MockTransport.pair(a, b);
  return { a, b };
}
