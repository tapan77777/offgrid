import type { OffgridDb } from '../../database';
import { MessageRepo } from '../../database/repositories';
import type {
  EnvelopeBody,
  MessageEnvelope,
} from '../../types/communication';
import { MAX_ENVELOPE_TTL } from '../../types/communication';
import type { DeviceId, MessageId } from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import { decodeEnvelope, encodeEnvelope } from './codec';
import {
  DIAGNOSTIC_GROUP_ID,
  DIAGNOSTIC_USER_ID,
  ensureDiagnosticGroup,
  ensureRemoteDeviceRow,
} from './testGroup';
import type { Transport, TransportEvent } from './types';

const ORIGIN_SELF_ADDRESS = '<origin-self>';

export type RelayRouterEvent =
  | {
      readonly kind: 'envelopeSent';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'envelopeReceived';
      readonly envelope: MessageEnvelope;
      readonly wasDuplicate: boolean;
      readonly wasForMe: boolean;
    }
  | {
      readonly kind: 'envelopeDelivered';
      readonly envelope: MessageEnvelope;
    }
  // Named `envelopeFrameWritten` (not `envelopeForwarded`) on purpose: the
  // only fact we can prove at this layer is that our local TCP write returned
  // without error. There is no application-level ACK — the peer may have
  // never received the frame (stale socket, kernel buffered but never
  // delivered, etc.). Renamed after the Phase 4B rev 2 physical test where
  // "forwarded" misled a diagnostician into thinking delivery was confirmed.
  | {
      readonly kind: 'envelopeFrameWritten';
      readonly envelope: MessageEnvelope;
      readonly toAddress: string;
    }
  | {
      readonly kind: 'envelopeQueued';
      readonly envelope: MessageEnvelope;
      readonly reason: 'no-eligible-peer';
    }
  | {
      readonly kind: 'envelopeTtlExpired';
      readonly envelope: MessageEnvelope;
    }
  | {
      readonly kind: 'envelopeRejected';
      readonly reason: string;
    };

export type RelayRouterListener = (event: RelayRouterEvent) => void;

export interface RelayRouterOptions {
  readonly transport: Transport;
  readonly db: OffgridDb;
  readonly localDeviceId: DeviceId;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
  readonly maxTtl?: number;
}

interface QueuedForward {
  readonly envelope: MessageEnvelope;
  readonly receivedFromAddress: string;
}

export class RelayRouter {
  private readonly transport: Transport;
  private readonly db: OffgridDb;
  private readonly localDeviceId: DeviceId;
  private readonly nowIso: () => string;
  private readonly generateId: () => string;
  private readonly maxTtl: number;
  private readonly listeners = new Set<RelayRouterListener>();
  private readonly forwardQueue: QueuedForward[] = [];
  private currentPeerAddress: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: RelayRouterOptions) {
    this.transport = options.transport;
    this.db = options.db;
    this.localDeviceId = options.localDeviceId;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.generateId = options.generateId ?? newUuidV7;
    this.maxTtl = options.maxTtl ?? MAX_ENVELOPE_TTL;
  }

  attach(): void {
    if (this.unsubscribe) return;
    ensureDiagnosticGroup(this.db, this.nowIso());
    this.unsubscribe = this.transport.on(event =>
      this.handleTransportEvent(event),
    );
  }

  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.forwardQueue.length = 0;
    this.currentPeerAddress = null;
  }

  on(listener: RelayRouterListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  queueDepth(): number {
    return this.forwardQueue.length;
  }

  async sendEnvelope(
    destinationDeviceId: DeviceId | null,
    body: EnvelopeBody,
  ): Promise<MessageEnvelope> {
    const envelope: MessageEnvelope = {
      v: 1,
      kind: 'msg.envelope',
      id: this.generateId() as MessageId,
      originDeviceId: this.localDeviceId,
      destinationDeviceId,
      ttl: this.maxTtl,
      hopCount: 0,
      sentAt: this.nowIso(),
      body,
    };
    this.persistEnvelope(envelope, 'SENT');
    this.emit({ kind: 'envelopeSent', envelope });
    await this.attemptForward(envelope, ORIGIN_SELF_ADDRESS);
    return envelope;
  }

  private handleTransportEvent(event: TransportEvent): void {
    switch (event.kind) {
      case 'connectionChanged':
        if (event.snapshot.groupFormed) {
          // Only the client role learns the peer's IP from connection state.
          // On the GO side, Android reports our own IP as groupOwnerAddress,
          // so we defer learning the peer address until the first frame from
          // it arrives via `payloadReceived` (see below).
          if (!event.snapshot.isGroupOwner) {
            this.currentPeerAddress = event.snapshot.groupOwnerAddress;
            this.drainQueue().catch(() => undefined);
          }
        } else {
          this.currentPeerAddress = null;
        }
        return;
      case 'payloadReceived': {
        // The address that just handed us a frame is by definition the peer
        // on the other end of our one active socket. Use it as ground truth
        // — this matters on the GO side (we didn't know the client's IP yet)
        // and also when Android's GO election puts our own IP into
        // groupOwnerAddress. Loop prevention downstream compares against
        // `receivedFromAddress`, which is this same value.
        const previousPeer = this.currentPeerAddress;
        this.currentPeerAddress = event.fromAddress;
        if (previousPeer !== event.fromAddress) {
          this.drainQueue().catch(() => undefined);
        }
        this.handlePayload(event.bytes, event.fromAddress).catch(
          () => undefined,
        );
        return;
      }
      // stateChanged, peersChanged, error are outside the router's remit
      default:
        return;
    }
  }

  private async handlePayload(
    bytes: Uint8Array,
    fromAddress: string,
  ): Promise<void> {
    const envelope = decodeEnvelope(bytes);
    if (envelope === null) {
      this.emit({ kind: 'envelopeRejected', reason: 'invalid-envelope' });
      return;
    }
    const existing = MessageRepo.findMessageById(this.db, envelope.id);
    if (existing !== null) {
      this.emit({
        kind: 'envelopeReceived',
        envelope,
        wasDuplicate: true,
        wasForMe: this.isForMe(envelope),
      });
      return;
    }
    const forMe = this.isForMe(envelope);
    this.persistEnvelope(envelope, 'DELIVERED');
    this.emit({
      kind: 'envelopeReceived',
      envelope,
      wasDuplicate: false,
      wasForMe: forMe,
    });
    if (forMe) {
      this.emit({ kind: 'envelopeDelivered', envelope });
    }
    if (envelope.destinationDeviceId === this.localDeviceId) {
      // Direct-addressed to me — terminal hop, do not forward.
      return;
    }
    const forwardEnvelope: MessageEnvelope = {
      ...envelope,
      ttl: envelope.ttl - 1,
      hopCount: envelope.hopCount + 1,
    };
    if (forwardEnvelope.ttl < 1) {
      this.emit({ kind: 'envelopeTtlExpired', envelope });
      return;
    }
    await this.attemptForward(forwardEnvelope, fromAddress);
  }

  private async attemptForward(
    envelope: MessageEnvelope,
    receivedFromAddress: string,
  ): Promise<void> {
    const target = this.currentPeerAddress;
    if (target !== null && target !== receivedFromAddress) {
      await this.transport.sendPayload(encodeEnvelope(envelope));
      this.emit({
        kind: 'envelopeFrameWritten',
        envelope,
        toAddress: target,
      });
      return;
    }
    this.forwardQueue.push({ envelope, receivedFromAddress });
    this.emit({
      kind: 'envelopeQueued',
      envelope,
      reason: 'no-eligible-peer',
    });
  }

  private async drainQueue(): Promise<void> {
    const target = this.currentPeerAddress;
    if (target === null) return;
    const remaining: QueuedForward[] = [];
    for (const entry of this.forwardQueue) {
      if (target !== entry.receivedFromAddress) {
        await this.transport.sendPayload(encodeEnvelope(entry.envelope));
        this.emit({
          kind: 'envelopeFrameWritten',
          envelope: entry.envelope,
          toAddress: target,
        });
      } else {
        remaining.push(entry);
      }
    }
    this.forwardQueue.length = 0;
    for (const entry of remaining) {
      this.forwardQueue.push(entry);
    }
  }

  private isForMe(envelope: MessageEnvelope): boolean {
    return (
      envelope.destinationDeviceId === this.localDeviceId ||
      envelope.destinationDeviceId === null
    );
  }

  private persistEnvelope(
    envelope: MessageEnvelope,
    deliveryStatus: 'SENT' | 'DELIVERED',
  ): void {
    const receivedAt = this.nowIso();
    ensureRemoteDeviceRow(this.db, envelope.originDeviceId, receivedAt);
    MessageRepo.insertMessageIfAbsent(this.db, {
      id: envelope.id,
      groupId: DIAGNOSTIC_GROUP_ID,
      senderId: DIAGNOSTIC_USER_ID,
      senderDeviceId: envelope.originDeviceId,
      messageType: 'system',
      payload: JSON.stringify(envelope),
      createdAt: envelope.sentAt,
      ttl: envelope.ttl,
      deliveryStatus,
    });
  }

  private emit(event: RelayRouterEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
