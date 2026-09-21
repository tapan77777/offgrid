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

  static unpair(a: MockTransport, b: MockTransport): void {
    if (a.peer === b) a.peer = null;
    if (b.peer === a) b.peer = null;
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
    // For test observability the mock always reports the *other* party's
    // deviceAddress in groupOwnerAddress, regardless of ownership. Real
    // Android Wi-Fi Direct reports the elected group owner's IP (which is
    // your own IP if you're the owner) — the production WifiP2pTransport
    // preserves that semantic. Tests need the peer identity here to drive
    // the router's sequential-handoff logic; leaving it null on the owner
    // side would force every mock test to feed the peer address in by
    // another channel.
    const snapshot: ConnectionSnapshot = {
      groupFormed: connected,
      isGroupOwner,
      groupOwnerAddress: connected ? (this.peer?.deviceAddress ?? null) : null,
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

// MockRelayNetwork models a small set of MockTransport nodes with
// programmable pairwise connectivity. Only one active pair per node at a
// time — the same single-P2P-group constraint as real Android Wi-Fi
// Direct — so multi-hop routing must go through sequential handoff.
export class MockRelayNetwork {
  private readonly nodes = new Map<string, MockTransport>();

  add(node: MockTransport): void {
    if (this.nodes.has(node.nodeName)) {
      throw new Error(`MockRelayNetwork: duplicate node ${node.nodeName}`);
    }
    this.nodes.set(node.nodeName, node);
  }

  get(name: string): MockTransport {
    const node = this.nodes.get(name);
    if (!node) throw new Error(`MockRelayNetwork: unknown node ${name}`);
    return node;
  }

  async connect(nameA: string, nameB: string): Promise<void> {
    const a = this.get(nameA);
    const b = this.get(nameB);
    MockTransport.pair(a, b);
    await a.connectToPeer(b.deviceAddress);
  }

  disconnect(nameA: string, nameB: string): void {
    const a = this.get(nameA);
    const b = this.get(nameB);
    a.disconnect();
    MockTransport.unpair(a, b);
  }
}

export function createTriangleNetwork(): {
  readonly network: MockRelayNetwork;
  readonly a: MockTransport;
  readonly b: MockTransport;
  readonly c: MockTransport;
} {
  const a = new MockTransport({
    nodeName: 'A',
    deviceAddress: '00:00:00:00:00:0A',
    peerId: 'peer:A' as PeerSessionKey,
  });
  const b = new MockTransport({
    nodeName: 'B',
    deviceAddress: '00:00:00:00:00:0B',
    peerId: 'peer:B' as PeerSessionKey,
  });
  const c = new MockTransport({
    nodeName: 'C',
    deviceAddress: '00:00:00:00:00:0C',
    peerId: 'peer:C' as PeerSessionKey,
  });
  const network = new MockRelayNetwork();
  network.add(a);
  network.add(b);
  network.add(c);
  return { network, a, b, c };
}
