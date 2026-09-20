import { WifiP2pTransport } from '../../src/services/communication/transports/WifiP2pTransport';
import type {
  NativeSurface,
  NativeEventSubscription,
} from '../../src/services/communication/transports/nativeSurface';
import type { TransportEvent } from '../../src/services/communication/types';
import type {
  NativeConnectionState,
  NativePayload,
  NativePeersChanged,
} from '../../specs/NativeOffgridP2p';

interface Handlers {
  onPeers: ((event: NativePeersChanged) => void) | null;
  onConnection: ((event: NativeConnectionState) => void) | null;
  onPayload: ((event: NativePayload) => void) | null;
}

function buildFake(): { surface: NativeSurface; handlers: Handlers; calls: string[] } {
  const handlers: Handlers = {
    onPeers: null,
    onConnection: null,
    onPayload: null,
  };
  const calls: string[] = [];
  const subscription = (): NativeEventSubscription => ({
    remove: () => {
      calls.push('remove');
    },
  });
  const surface: NativeSurface = {
    initialize: async () => {
      calls.push('initialize');
      return true;
    },
    startDiscovery: async () => {
      calls.push('startDiscovery');
    },
    stopDiscovery: async () => {
      calls.push('stopDiscovery');
    },
    connectToPeer: async address => {
      calls.push(`connect:${address}`);
    },
    sendPayload: async base64 => {
      calls.push(`send:${base64}`);
    },
    dispose: async () => {
      calls.push('dispose');
    },
    onPeersChanged: listener => {
      handlers.onPeers = listener;
      return subscription();
    },
    onConnectionStateChanged: listener => {
      handlers.onConnection = listener;
      return subscription();
    },
    onPayloadReceived: listener => {
      handlers.onPayload = listener;
      return subscription();
    },
  };
  return { surface, handlers, calls };
}

describe('WifiP2pTransport contract adapter', () => {
  it('subscribes to native events on initialize and emits stateChanged', async () => {
    const { surface, handlers, calls } = buildFake();
    const transport = new WifiP2pTransport({ nativeSurface: surface });
    const events: TransportEvent[] = [];
    transport.on(e => events.push(e));

    await transport.initialize();

    expect(handlers.onPeers).not.toBeNull();
    expect(handlers.onConnection).not.toBeNull();
    expect(handlers.onPayload).not.toBeNull();
    expect(calls).toContain('initialize');
    expect(events).toEqual([{ kind: 'stateChanged', state: 'ready' }]);
  });

  it('maps native peers to domain PeerHandles with wifi-p2p transport id', async () => {
    const { surface, handlers } = buildFake();
    const transport = new WifiP2pTransport({
      nativeSurface: surface,
      nowIso: () => '2026-09-20T12:00:00Z',
    });
    const events: TransportEvent[] = [];
    transport.on(e => events.push(e));
    await transport.initialize();

    handlers.onPeers?.({
      peers: [
        { deviceAddress: '00:aa:bb:cc:dd:01', deviceName: 'PixelA', status: 3 },
        { deviceAddress: '00:aa:bb:cc:dd:02', deviceName: '', status: 3 },
      ],
    });

    const peersEvent = events.find(
      (e): e is Extract<TransportEvent, { kind: 'peersChanged' }> =>
        e.kind === 'peersChanged',
    );
    expect(peersEvent?.peers).toEqual([
      {
        id: 'peer:wifi-p2p:00:aa:bb:cc:dd:01',
        transport: 'wifi-p2p',
        deviceAddress: '00:aa:bb:cc:dd:01',
        displayName: 'PixelA',
        lastSeenAt: '2026-09-20T12:00:00Z',
      },
      {
        id: 'peer:wifi-p2p:00:aa:bb:cc:dd:02',
        transport: 'wifi-p2p',
        deviceAddress: '00:aa:bb:cc:dd:02',
        displayName: null,
        lastSeenAt: '2026-09-20T12:00:00Z',
      },
    ]);
  });

  it('converts an empty groupOwnerAddress to null on the domain snapshot', async () => {
    const { surface, handlers } = buildFake();
    const transport = new WifiP2pTransport({ nativeSurface: surface });
    const events: TransportEvent[] = [];
    transport.on(e => events.push(e));
    await transport.initialize();

    handlers.onConnection?.({
      groupFormed: false,
      isGroupOwner: false,
      groupOwnerAddress: '',
    });

    const connEvent = events.find(
      (e): e is Extract<TransportEvent, { kind: 'connectionChanged' }> =>
        e.kind === 'connectionChanged',
    );
    expect(connEvent?.snapshot.groupOwnerAddress).toBeNull();
  });

  it('decodes a base64 payload into bytes on payloadReceived', async () => {
    const { surface, handlers } = buildFake();
    const transport = new WifiP2pTransport({ nativeSurface: surface });
    const events: TransportEvent[] = [];
    transport.on(e => events.push(e));
    await transport.initialize();

    const base64 = Buffer.from(Uint8Array.of(1, 2, 3, 4, 5)).toString('base64');
    handlers.onPayload?.({ fromAddress: '00:aa:bb:cc:dd:0A', base64 });

    const payload = events.find(
      (e): e is Extract<TransportEvent, { kind: 'payloadReceived' }> =>
        e.kind === 'payloadReceived',
    );
    expect(Array.from(payload?.bytes ?? [])).toEqual([1, 2, 3, 4, 5]);
    expect(payload?.fromAddress).toBe('00:aa:bb:cc:dd:0A');
  });

  it('sendPayload base64-encodes bytes for the native surface', async () => {
    const { surface, calls } = buildFake();
    const transport = new WifiP2pTransport({ nativeSurface: surface });
    await transport.initialize();
    await transport.sendPayload(Uint8Array.of(72, 105)); // "Hi"
    const base64 = Buffer.from(Uint8Array.of(72, 105)).toString('base64');
    expect(calls).toContain(`send:${base64}`);
  });

  it('dispose removes native subscriptions and clears listeners', async () => {
    const { surface, calls } = buildFake();
    const transport = new WifiP2pTransport({ nativeSurface: surface });
    await transport.initialize();
    await transport.dispose();
    expect(calls.filter(c => c === 'remove').length).toBe(3);
    expect(calls).toContain('dispose');
  });
});
