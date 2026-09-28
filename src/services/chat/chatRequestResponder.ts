import type { OffgridDb } from '../../database';
import {
  ChatRequestRepo,
  UserRepo,
} from '../../database/repositories';
import type { CommunicationManager } from '../communication/CommunicationManager';
import type { MessageEnvelope } from '../../types/communication';
import type { UserId } from '../../types/ids';

// Chat request V1 responder (D-076).
//
// Contract:
//   - Subscribe to `chatRequestEnvelopeReceived` on the manager.
//   - Ignore the envelope if it isn't addressed to the local user
//     (payload.toUserId !== localUserId). The request is a broadcast; the
//     recipient filter lives on the receiver side by design so no per-peer
//     unicast address is needed.
//   - Ignore self-loopback (fromUserId === localUserId).
//   - Ensure the requester's user row exists locally, then insert a pending
//     incoming chat_requests row. Idempotent on duplicate requestId — a
//     re-broadcast within a session is a no-op.
//   - Silent on failure: never leak the reason to the requester (CLAUDE.md
//     §13). Log via console.warn with a stable prefix so diagnostics can
//     grep it.
//
// Also subscribes to `chatRequestAcceptEnvelopeReceived` and
// `chatRequestDeclineEnvelopeReceived` so the ORIGINAL requester's device
// can mark its outgoing row 'accepted' / 'declined' when the recipient
// replies. The direct chat itself is opened by the UI in reaction to a
// state change, not here — the responder is purely a persistence adapter.

export interface StartChatRequestResponderOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager;
  readonly localUserId: UserId;
  readonly nowIso?: () => string;
}

const LOG_PREFIX = '[chat-request-responder]';

export function startChatRequestResponder(
  options: StartChatRequestResponderOptions,
): () => void {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  return options.manager.on(event => {
    if (event.kind === 'chatRequestEnvelopeReceived') {
      try {
        handleIncomingRequest(options, event.envelope, nowIso());
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} request error:`,
          err instanceof Error ? err.message : err,
        );
      }
      return;
    }
    if (event.kind === 'chatRequestAcceptEnvelopeReceived') {
      try {
        handleIncomingAccept(options, event.envelope, nowIso());
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} accept error:`,
          err instanceof Error ? err.message : err,
        );
      }
      return;
    }
    if (event.kind === 'chatRequestDeclineEnvelopeReceived') {
      try {
        handleIncomingDecline(options, event.envelope, nowIso());
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} decline error:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  });
}

function handleIncomingRequest(
  options: StartChatRequestResponderOptions,
  envelope: MessageEnvelope,
  now: string,
): void {
  if (envelope.body.kind !== 'chat.request') return;
  const payload = envelope.body.payload;

  // Not for me — silently ignore (broadcast reach ≠ addressed to me).
  // toUserId=null means "for whoever receives this directly"; we accept it
  // because the WFD framing layer already restricted delivery to peers
  // currently in our direct group (D-076).
  if (
    payload.toUserId !== null &&
    (payload.toUserId as string) !== (options.localUserId as string)
  ) {
    return;
  }
  // Loopback echo — my own request should not create a pending row on me.
  if ((payload.fromUserId as string) === (options.localUserId as string)) {
    return;
  }

  // Duplicate broadcast within a session — same requestId already stored.
  const existing = ChatRequestRepo.findChatRequestById(
    options.db,
    payload.requestId,
  );
  if (existing) return;

  // If a different pending row already exists between this pair, don't
  // clobber it. The wire-level partial unique index enforces this but we
  // pre-check to keep the failure silent.
  const openPair = ChatRequestRepo.findPendingBetween(
    options.db,
    payload.fromUserId,
    options.localUserId,
  );
  if (openPair) return;

  options.db.transaction(tx => {
    if (!UserRepo.findUserById(tx, payload.fromUserId)) {
      UserRepo.insertUser(tx, {
        id: payload.fromUserId,
        displayName: payload.fromDisplayName,
        nowIso: now,
      });
    }
    ChatRequestRepo.insertChatRequest(tx, {
      id: payload.requestId,
      requesterUserId: payload.fromUserId,
      recipientUserId: options.localUserId,
      requesterDisplayName: payload.fromDisplayName,
      direction: 'incoming',
      nowIso: now,
    });
  });
}

function handleIncomingAccept(
  options: StartChatRequestResponderOptions,
  envelope: MessageEnvelope,
  now: string,
): void {
  if (envelope.body.kind !== 'chat.request.accept') return;
  const payload = envelope.body.payload;

  // Only the requester should react — accept envelopes are unicast to the
  // original requester's device, but re-verify by user id (CLAUDE.md §13
  // privacy defence-in-depth).
  if ((payload.requesterUserId as string) !== (options.localUserId as string)) {
    return;
  }

  // Ensure the accepter user row exists so the resulting direct group can
  // reference them, whether or not we have a persisted outgoing chat_request
  // row. The Nearby flow (D-076) intentionally skips persisting Alice's
  // outgoing row when toUserId was unknown at send time; her UI reacts to
  // the accept event directly and needs the User row present to open the
  // direct chat.
  if (!UserRepo.findUserById(options.db, payload.accepterUserId)) {
    UserRepo.insertUser(options.db, {
      id: payload.accepterUserId,
      displayName: payload.accepterDisplayName,
      nowIso: now,
    });
  }
  const request = ChatRequestRepo.findChatRequestById(
    options.db,
    payload.requestId,
  );
  if (!request) return;
  if (request.direction !== 'outgoing') return;
  if (request.status !== 'pending') return;
  ChatRequestRepo.updateChatRequestStatus(
    options.db,
    payload.requestId,
    'accepted',
    now,
  );
}

function handleIncomingDecline(
  options: StartChatRequestResponderOptions,
  envelope: MessageEnvelope,
  now: string,
): void {
  if (envelope.body.kind !== 'chat.request.decline') return;
  const payload = envelope.body.payload;
  if ((payload.requesterUserId as string) !== (options.localUserId as string)) {
    return;
  }
  const request = ChatRequestRepo.findChatRequestById(
    options.db,
    payload.requestId,
  );
  if (!request) return;
  if (request.direction !== 'outgoing') return;
  if (request.status !== 'pending') return;
  ChatRequestRepo.updateChatRequestStatus(
    options.db,
    payload.requestId,
    'declined',
    now,
  );
}
