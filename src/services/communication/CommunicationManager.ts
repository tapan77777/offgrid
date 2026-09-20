import type { OffgridDb } from '../../database';
import { MessageRepo } from '../../database/repositories';
import type {
  ConnectionSnapshot,
  PeerHandle,
  TestPing,
  TransportState,
} from '../../types/communication';
import type { DeviceId, MessageId } from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import { decodeTestPing, encodeTestPing } from './codec';
import {
  DIAGNOSTIC_GROUP_ID,
  DIAGNOSTIC_USER_ID,
  ensureDiagnosticGroup,
  ensureRemoteDeviceRow,
} from './testGroup';
import type { Transport, TransportEvent } from './types';

export type CommunicationEvent =
  | { readonly kind: 'stateChanged'; readonly state: TransportState }
  | { readonly kind: 'peersChanged'; readonly peers: readonly PeerHandle[] }
  | {
      readonly kind: 'connectionChanged';
      readonly snapshot: ConnectionSnapshot;
    }
  | { readonly kind: 'pingSent'; readonly ping: TestPing }
  | {
      readonly kind: 'pingReceived';
      readonly ping: TestPing;
      readonly wasDuplicate: boolean;
    }
  | { readonly kind: 'payloadRejected'; readonly reason: string }
  | { readonly kind: 'error'; readonly message: string };

export type CommunicationEventListener = (event: CommunicationEvent) => void;

export interface CommunicationManagerOptions {
  readonly transport: Transport;
  readonly db: OffgridDb;
  readonly localDeviceId: DeviceId;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export class CommunicationManager {
  private readonly transport: Transport;
  private readonly db: OffgridDb;
  private readonly localDeviceId: DeviceId;
  private readonly nowIso: () => string;
  private readonly generateId: () => string;
  private readonly listeners = new Set<CommunicationEventListener>();
  private state: TransportState = 'idle';
  private unsubscribe: (() => void) | null = null;

  constructor(options: CommunicationManagerOptions) {
    this.transport = options.transport;
    this.db = options.db;
    this.localDeviceId = options.localDeviceId;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.generateId = options.generateId ?? newUuidV7;
  }

  async initialize(): Promise<void> {
    ensureDiagnosticGroup(this.db, this.nowIso());
    this.setState('initializing');
    this.unsubscribe = this.transport.on(event =>
      this.handleTransportEvent(event),
    );
    try {
      await this.transport.initialize();
      this.setState('ready');
    } catch (err) {
      this.emitError(err);
      this.setState('error');
      throw err;
    }
  }

  async startDiscovery(): Promise<void> {
    this.setState('discovering');
    try {
      await this.transport.startDiscovery();
    } catch (err) {
      this.emitError(err);
      this.setState('error');
      throw err;
    }
  }

  async stopDiscovery(): Promise<void> {
    await this.transport.stopDiscovery();
    if (this.state === 'discovering') {
      this.setState('ready');
    }
  }

  async connectToPeer(deviceAddress: string): Promise<void> {
    this.setState('connecting');
    try {
      await this.transport.connectToPeer(deviceAddress);
    } catch (err) {
      this.emitError(err);
      this.setState('error');
      throw err;
    }
  }

  async sendTestPing(textPreview: string): Promise<TestPing> {
    const ping: TestPing = {
      v: 1,
      kind: 'test.ping',
      id: this.generateId() as MessageId,
      fromDeviceId: this.localDeviceId,
      textPreview,
      sentAt: this.nowIso(),
    };
    const bytes = encodeTestPing(ping);
    await this.transport.sendPayload(bytes);
    this.persistPing(ping);
    this.emit({ kind: 'pingSent', ping });
    return ping;
  }

  on(listener: CommunicationEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  currentState(): TransportState {
    return this.state;
  }

  async dispose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    await this.transport.dispose();
    this.listeners.clear();
    this.setState('idle');
  }

  private handleTransportEvent(event: TransportEvent): void {
    switch (event.kind) {
      case 'stateChanged':
        this.setState(event.state);
        return;
      case 'peersChanged':
        this.emit({ kind: 'peersChanged', peers: event.peers });
        return;
      case 'connectionChanged':
        this.emit({ kind: 'connectionChanged', snapshot: event.snapshot });
        if (event.snapshot.groupFormed) {
          this.setState('connected');
        } else if (this.state === 'connected') {
          this.setState('disconnected');
        }
        return;
      case 'payloadReceived': {
        const ping = decodeTestPing(event.bytes);
        if (!ping) {
          this.emit({
            kind: 'payloadRejected',
            reason: 'not-a-test-ping-v1',
          });
          return;
        }
        const result = this.persistPing(ping);
        this.emit({
          kind: 'pingReceived',
          ping,
          wasDuplicate: !result.inserted,
        });
        return;
      }
      case 'error':
        this.emit({ kind: 'error', message: event.message });
        this.setState('error');
        return;
    }
  }

  private persistPing(ping: TestPing): { inserted: boolean } {
    const receivedAt = this.nowIso();
    ensureRemoteDeviceRow(this.db, ping.fromDeviceId, receivedAt);
    const { inserted } = MessageRepo.insertMessageIfAbsent(this.db, {
      id: ping.id,
      groupId: DIAGNOSTIC_GROUP_ID,
      senderId: DIAGNOSTIC_USER_ID,
      senderDeviceId: ping.fromDeviceId,
      messageType: 'system',
      payload: JSON.stringify(ping),
      createdAt: ping.sentAt,
      deliveryStatus: 'DELIVERED',
    });
    return { inserted };
  }

  private setState(state: TransportState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit({ kind: 'stateChanged', state });
  }

  private emit(event: CommunicationEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private emitError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.emit({ kind: 'error', message });
  }
}
