import type { OffgridDb } from '../../database';
import { MessageRepo } from '../../database/repositories';
import type {
  ChatRequestAcceptBody,
  ChatRequestBody,
  ChatRequestDeclineBody,
  ConnectionSnapshot,
  GroupJoinInviteBody,
  GroupJoinRequestBody,
  GroupLocationBody,
  MessageEnvelope,
  MsgTextBody,
  PeerHandle,
  TestPing,
  TransportState,
} from '../../types/communication';
import type { DeviceId, MessageId } from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import {
  decodeEnvelope,
  decodeTestPing,
  encodeEnvelope,
  encodeTestPing,
} from './codec';
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
  | {
      readonly kind: 'groupLocationEnvelopeSent';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'groupLocationEnvelopeReceived';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'chatEnvelopeSent';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'chatEnvelopeReceived';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'groupJoinRequestEnvelopeSent';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'groupJoinRequestEnvelopeReceived';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'groupJoinInviteEnvelopeSent';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'groupJoinInviteEnvelopeReceived';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'chatRequestEnvelopeSent';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'chatRequestEnvelopeReceived';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'chatRequestAcceptEnvelopeSent';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'chatRequestAcceptEnvelopeReceived';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'chatRequestDeclineEnvelopeSent';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'chatRequestDeclineEnvelopeReceived';
      readonly envelope: MessageEnvelope;
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

  // Milestone B V0: direct-only group location broadcast. hopCount and ttl
  // stay 0 so this envelope is never eligible for Phase 4B relay forwarding
  // even if a RelayRouter happens to be attached to the same transport
  // (D-069). Persistence of received rows is the receiver service's job —
  // this method is transport-only.
  async sendGroupLocationEnvelope(
    body: GroupLocationBody,
  ): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: body.payload.locationId as unknown as MessageId,
      originDeviceId: this.localDeviceId,
      destinationDeviceId: null,
      ttl: 0,
      hopCount: 0,
      sentAt: this.nowIso(),
      body,
    };
    const bytes = encodeEnvelope(envelope);
    await this.transport.sendPayload(bytes);
    this.emit({ kind: 'groupLocationEnvelopeSent', envelope });
    return envelope;
  }

  // Chat V1 (D-074). Direct-only text send: hopCount=0, ttl=0,
  // destinationDeviceId=null. Never routed through RelayRouter — see
  // `RelayRouter.handlePayload` for the receiver-side guard against this
  // envelope kind landing in the diagnostic group.
  //
  // Persistence is the sender service's responsibility: this method only
  // encodes + writes bytes and emits an event so the caller can flip the
  // outgoing row from LOCAL → SENT (CLAUDE.md §14/§20 honest states).
  async sendChatTextEnvelope(body: MsgTextBody): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: body.payload.messageId,
      originDeviceId: this.localDeviceId,
      destinationDeviceId: null,
      ttl: 0,
      hopCount: 0,
      sentAt: this.nowIso(),
      body,
    };
    const bytes = encodeEnvelope(envelope);
    await this.transport.sendPayload(bytes);
    this.emit({ kind: 'chatEnvelopeSent', envelope });
    return envelope;
  }

  // Group join V1 (D-075). B broadcasts a request; any nearby device that
  // owns a matching group replies with an invite. Direct-only: ttl=0,
  // hopCount=0. RelayRouter.handlePayload guards against these kinds landing
  // in the diagnostic group or being forwarded.
  async sendGroupJoinRequestEnvelope(
    body: GroupJoinRequestBody,
  ): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: this.generateId() as MessageId,
      originDeviceId: this.localDeviceId,
      destinationDeviceId: null,
      ttl: 0,
      hopCount: 0,
      sentAt: this.nowIso(),
      body,
    };
    const bytes = encodeEnvelope(envelope);
    await this.transport.sendPayload(bytes);
    this.emit({ kind: 'groupJoinRequestEnvelopeSent', envelope });
    return envelope;
  }

  async sendGroupJoinInviteEnvelope(
    body: GroupJoinInviteBody,
    destinationDeviceId: DeviceId,
  ): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: this.generateId() as MessageId,
      originDeviceId: this.localDeviceId,
      destinationDeviceId,
      ttl: 0,
      hopCount: 0,
      sentAt: this.nowIso(),
      body,
    };
    const bytes = encodeEnvelope(envelope);
    await this.transport.sendPayload(bytes);
    this.emit({ kind: 'groupJoinInviteEnvelopeSent', envelope });
    return envelope;
  }

  // Chat request V1 (D-076). Broadcast so any nearby device can see it and
  // decide whether it is for them. Identity travels in the payload — a
  // recipient learns the requester's display name only when the request
  // itself arrives. Direct-only: ttl=0, hopCount=0.
  async sendChatRequestEnvelope(
    body: ChatRequestBody,
  ): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: this.generateId() as MessageId,
      originDeviceId: this.localDeviceId,
      destinationDeviceId: null,
      ttl: 0,
      hopCount: 0,
      sentAt: this.nowIso(),
      body,
    };
    const bytes = encodeEnvelope(envelope);
    await this.transport.sendPayload(bytes);
    this.emit({ kind: 'chatRequestEnvelopeSent', envelope });
    return envelope;
  }

  async sendChatRequestAcceptEnvelope(
    body: ChatRequestAcceptBody,
    destinationDeviceId: DeviceId,
  ): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: this.generateId() as MessageId,
      originDeviceId: this.localDeviceId,
      destinationDeviceId,
      ttl: 0,
      hopCount: 0,
      sentAt: this.nowIso(),
      body,
    };
    const bytes = encodeEnvelope(envelope);
    await this.transport.sendPayload(bytes);
    this.emit({ kind: 'chatRequestAcceptEnvelopeSent', envelope });
    return envelope;
  }

  async sendChatRequestDeclineEnvelope(
    body: ChatRequestDeclineBody,
    destinationDeviceId: DeviceId,
  ): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: this.generateId() as MessageId,
      originDeviceId: this.localDeviceId,
      destinationDeviceId,
      ttl: 0,
      hopCount: 0,
      sentAt: this.nowIso(),
      body,
    };
    const bytes = encodeEnvelope(envelope);
    await this.transport.sendPayload(bytes);
    this.emit({ kind: 'chatRequestDeclineEnvelopeSent', envelope });
    return envelope;
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
        if (ping) {
          const result = this.persistPing(ping);
          this.emit({
            kind: 'pingReceived',
            ping,
            wasDuplicate: !result.inserted,
          });
          return;
        }
        const envelope = decodeEnvelope(event.bytes);
        if (envelope) {
          // Milestone B V0: surface group.location envelopes so a receiver
          // service can validate + persist. All other envelope kinds are
          // Phase 4B RelayRouter territory — leave them silent here.
          if (envelope.body.kind === 'group.location') {
            this.emit({
              kind: 'groupLocationEnvelopeReceived',
              envelope,
            });
          } else if (envelope.body.kind === 'msg.text') {
            // Chat V1 (D-074). Surface the envelope so the chat receiver
            // service can independently authorize + persist. This manager
            // never inserts chat rows itself.
            this.emit({
              kind: 'chatEnvelopeReceived',
              envelope,
            });
          } else if (envelope.body.kind === 'group.join.request') {
            // Group join V1 (D-075). Surface the request so the responder
            // service can decide whether this device hosts a matching group.
            // Direct-addressed replies (invites) are dispatched on the same
            // manager via sendGroupJoinInviteEnvelope.
            this.emit({
              kind: 'groupJoinRequestEnvelopeReceived',
              envelope,
            });
          } else if (envelope.body.kind === 'group.join.invite') {
            // Group join V1 (D-075). Surface the invite so the join service
            // can install the group + members locally. The receiver checks
            // the invite is addressed to us before acting.
            this.emit({
              kind: 'groupJoinInviteEnvelopeReceived',
              envelope,
            });
          } else if (envelope.body.kind === 'chat.request') {
            // Chat request V1 (D-076). Surface so the chatRequest responder
            // can decide whether the request is addressed to us and, if so,
            // persist a pending row + notify the UI. Broadcast — the
            // responder filters on payload.toUserId.
            this.emit({
              kind: 'chatRequestEnvelopeReceived',
              envelope,
            });
          } else if (envelope.body.kind === 'chat.request.accept') {
            // Chat request V1 (D-076). Surface so the requester can react —
            // mark the outgoing request accepted and open the direct chat.
            this.emit({
              kind: 'chatRequestAcceptEnvelopeReceived',
              envelope,
            });
          } else if (envelope.body.kind === 'chat.request.decline') {
            this.emit({
              kind: 'chatRequestDeclineEnvelopeReceived',
              envelope,
            });
          }
          return;
        }
        this.emit({
          kind: 'payloadRejected',
          reason: 'not-a-test-ping-v1',
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
