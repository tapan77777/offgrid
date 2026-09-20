import type {
  NativeConnectionState,
  NativePayload,
  NativePeersChanged,
} from '../../../../specs/NativeOffgridP2p';
import {
  EVENT_CONNECTION_STATE,
  EVENT_PAYLOAD_RECEIVED,
  EVENT_PEERS_CHANGED,
} from '../../../../specs/NativeOffgridP2p';

export interface NativeEventSubscription {
  remove(): void;
}

export interface NativeSurface {
  initialize(): Promise<boolean>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connectToPeer(deviceAddress: string): Promise<void>;
  sendPayload(base64: string): Promise<void>;
  dispose(): Promise<void>;
  onPeersChanged(
    listener: (event: NativePeersChanged) => void,
  ): NativeEventSubscription;
  onConnectionStateChanged(
    listener: (event: NativeConnectionState) => void,
  ): NativeEventSubscription;
  onPayloadReceived(
    listener: (event: NativePayload) => void,
  ): NativeEventSubscription;
}

interface OffgridP2pNativeModule {
  initialize(): Promise<boolean>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connectToPeer(deviceAddress: string): Promise<void>;
  sendPayload(base64: string): Promise<void>;
  dispose(): Promise<void>;
}

interface EmitterLike {
  addListener(
    eventType: string,
    listener: (event: unknown) => void,
  ): NativeEventSubscription;
}

export function loadProductionNativeSurface(): NativeSurface {
  const rn = require('react-native') as {
    NativeModules: Record<string, unknown>;
    DeviceEventEmitter: EmitterLike;
  };

  const nativeModule = rn.NativeModules.OffgridP2p as
    | OffgridP2pNativeModule
    | undefined;

  if (!nativeModule) {
    throw new Error(
      'OffgridP2p native module is not registered. Ensure OffgridP2pPackage is added to MainApplication and the Android build has been rebuilt.',
    );
  }

  const emitter = rn.DeviceEventEmitter;

  return {
    initialize: () => nativeModule.initialize(),
    startDiscovery: () => nativeModule.startDiscovery(),
    stopDiscovery: () => nativeModule.stopDiscovery(),
    connectToPeer: address => nativeModule.connectToPeer(address),
    sendPayload: base64 => nativeModule.sendPayload(base64),
    dispose: () => nativeModule.dispose(),
    onPeersChanged: listener =>
      emitter.addListener(EVENT_PEERS_CHANGED, event =>
        listener(event as NativePeersChanged),
      ),
    onConnectionStateChanged: listener =>
      emitter.addListener(EVENT_CONNECTION_STATE, event =>
        listener(event as NativeConnectionState),
      ),
    onPayloadReceived: listener =>
      emitter.addListener(EVENT_PAYLOAD_RECEIVED, event =>
        listener(event as NativePayload),
      ),
  };
}
