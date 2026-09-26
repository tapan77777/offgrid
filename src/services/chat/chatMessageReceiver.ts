import type { OffgridDb } from '../../database';
import {
  GroupMemberRepo,
  GroupRepo,
  MessageRepo,
} from '../../database/repositories';
import type { CommunicationManager } from '../communication/CommunicationManager';
import { ensureRemoteDeviceRow } from '../communication/testGroup';
import type { MessageEnvelope } from '../../types/communication';
import type { UserId } from '../../types/ids';
import { deriveDirectGroupId } from '../../utils/ids';

// Chat V1 receiver (D-074).
//
// Contract:
//   - Subscribe to `chatEnvelopeReceived` events on the manager.
//   - Independently authorize the envelope on this device:
//       * group must exist locally,
//       * local user must be an active member of that group,
//       * sender must be an active member of that group,
//       * if the group is `is_direct`, the id must match
//         `deriveDirectGroupId(sender, self)`.
//   - Insert-if-absent at deliveryStatus='SENT' (received messages have no
//     LOCAL phase; they were persisted on the sender's device already, and
//     we cannot confirm any further hop).
//   - Duplicates are a no-op (D-014 duplicate prevention).
//   - Reject silently on failure: never leak the rejection reason to the
//     sender (CLAUDE.md §13 privacy, §28 logging). Log via console.warn
//     with a stable prefix so diagnostics can grep it.
//
// The returned `unsubscribe` handle detaches the listener. Callers own the
// listener lifecycle (see `chatRuntime.ts`).

export interface StartChatMessageReceiverOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager;
  readonly localUserId: UserId;
  readonly nowIso?: () => string;
}

const LOG_PREFIX = '[chat-receiver] rejected:';

export function startChatMessageReceiver(
  options: StartChatMessageReceiverOptions,
): () => void {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  return options.manager.on(event => {
    if (event.kind !== 'chatEnvelopeReceived') return;
    const outcome = validateAndPersist(
      options.db,
      event.envelope,
      options.localUserId,
      nowIso(),
    );
    if (outcome !== 'accepted' && outcome !== 'duplicate') {
      // Stable log line so a diagnostician can grep. No user data.
      console.warn(`${LOG_PREFIX} ${outcome}`);
    }
  });
}

type ReceiverOutcome =
  | 'accepted'
  | 'duplicate'
  | 'wrong-envelope-kind'
  | 'group-not-found'
  | 'self-not-member'
  | 'sender-not-member'
  | 'direct-id-mismatch'
  | 'envelope-id-mismatch';

function validateAndPersist(
  db: OffgridDb,
  envelope: MessageEnvelope,
  localUserId: UserId,
  receivedAtIso: string,
): ReceiverOutcome {
  if (envelope.body.kind !== 'msg.text') {
    return 'wrong-envelope-kind';
  }
  const payload = envelope.body.payload;

  // Envelope.id and payload.messageId must match — this is our dedup key
  // and prevents a peer from proxying with a mismatched id.
  if ((envelope.id as unknown as string) !== (payload.messageId as unknown as string)) {
    return 'envelope-id-mismatch';
  }

  const group = GroupRepo.findGroupById(db, payload.groupId);
  if (!group) {
    return 'group-not-found';
  }

  const selfMembership = GroupMemberRepo.findMembership(
    db,
    payload.groupId,
    localUserId,
  );
  if (!selfMembership || selfMembership.status !== 'active') {
    return 'self-not-member';
  }

  const senderMembership = GroupMemberRepo.findMembership(
    db,
    payload.groupId,
    payload.senderUserId,
  );
  if (!senderMembership || senderMembership.status !== 'active') {
    return 'sender-not-member';
  }

  if (group.isDirect) {
    // Direct groups: derive the id from (sender, self) and require a match.
    // A tampered/misrouted envelope will not satisfy this check.
    const expected = deriveDirectGroupId(payload.senderUserId, localUserId);
    if ((expected as unknown as string) !== (payload.groupId as unknown as string)) {
      return 'direct-id-mismatch';
    }
  }

  // Record the origin device row for cross-referencing, matching the
  // pattern used by the ping and group-location paths.
  ensureRemoteDeviceRow(db, envelope.originDeviceId, receivedAtIso);

  const { inserted } = MessageRepo.insertMessageIfAbsent(db, {
    id: payload.messageId,
    groupId: payload.groupId,
    senderId: payload.senderUserId,
    senderDeviceId: envelope.originDeviceId,
    messageType: 'text',
    payload: payload.text,
    createdAt: payload.createdAt,
    deliveryStatus: 'SENT',
  });
  return inserted ? 'accepted' : 'duplicate';
}
