import type { OffgridDb } from '../../database';
import {
  ChatRequestRepo,
  DeviceRepo,
  UserRepo,
} from '../../database/repositories';
import type { CommunicationManager } from '../communication/CommunicationManager';
import type {
  ChatRequestAcceptBody,
  ChatRequestBody,
  ChatRequestDeclineBody,
} from '../../types/communication';
import type { ChatRequest } from '../../types/entities';
import type { DeviceId, MessageId, UserId } from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import { ensureDirectConversation } from './directConversation';
import type { Group } from '../../types/entities';

// Chat request V1 service (D-076). Consumer-facing entry points for the
// 1-to-1 handshake. Every function persists locally first, then attempts
// the wire operation — honest states per CLAUDE.md §20: a pending row is
// truthful even if the broadcast never reaches its intended recipient.

export class ChatRequestError extends Error {
  readonly code: ChatRequestErrorCode;
  constructor(code: ChatRequestErrorCode, message: string) {
    super(message);
    this.name = 'ChatRequestError';
    this.code = code;
  }
}

export type ChatRequestErrorCode =
  | 'NO_CONNECTION'
  | 'INVALID_INPUT'
  | 'ALREADY_PENDING'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_NOT_PENDING'
  | 'REQUEST_WRONG_DIRECTION';

export interface SendChatRequestOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager | null;
  readonly fromUserId: UserId;
  readonly fromDisplayName: string;
  // `null` (or omitted) means "for whoever receives this directly over the
  // active Wi-Fi Direct link" — used by the Nearby flow where Alice has not
  // yet learned Bob's OFFGRID userId. See D-076.
  readonly toUserId?: UserId | null;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface SendChatRequestResult {
  // `request` is null when toUserId was unknown at send time — we cannot
  // persist an outgoing row without a concrete recipient identity, so the
  // requester's UI holds ephemeral state until the accept envelope returns.
  readonly request: ChatRequest | null;
  readonly reusedExisting: boolean;
  readonly requestId: MessageId;
}

// A requester triggers this from the Nearby screen. Persists an outgoing
// row locally, then broadcasts a chat.request envelope. The recipient's
// device will insert a corresponding incoming row and surface it in their
// UI. Duplicate calls between the same pair collapse to the same pending
// row and re-broadcast — the recipient's responder ignores the duplicate.
export async function sendChatRequest(
  options: SendChatRequestOptions,
): Promise<SendChatRequestResult> {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const generateId = options.generateId ?? newUuidV7;

  const displayName = options.fromDisplayName.trim();
  if (displayName.length === 0) {
    throw new ChatRequestError('INVALID_INPUT', 'Set a display name first.');
  }
  const toUserId = options.toUserId ?? null;
  if (
    toUserId !== null &&
    (options.fromUserId as string) === (toUserId as string)
  ) {
    throw new ChatRequestError(
      'INVALID_INPUT',
      'Cannot send a chat request to yourself.',
    );
  }
  if (!options.manager) {
    throw new ChatRequestError(
      'NO_CONNECTION',
      'No nearby connection. Try again when a peer is available.',
    );
  }

  const now = nowIso();

  // Only when we know the recipient's userId can we (a) dedup against a
  // prior pending row and (b) persist an outgoing row. Alice's Nearby flow
  // typically arrives here with toUserId=null and keeps the state ephemeral
  // in her nearbyStore until Bob's accept envelope reveals his identity.
  let request: ChatRequest | null = null;
  let reusedExisting = false;
  let requestId: MessageId;
  if (toUserId !== null) {
    const existing = ChatRequestRepo.findPendingBetween(
      options.db,
      options.fromUserId,
      toUserId,
    );
    if (existing) {
      request = existing;
      reusedExisting = true;
    } else {
      request = ChatRequestRepo.insertChatRequest(options.db, {
        id: generateId() as MessageId,
        requesterUserId: options.fromUserId,
        recipientUserId: toUserId,
        requesterDisplayName: displayName,
        direction: 'outgoing',
        nowIso: now,
      });
    }
    requestId = request.id;
  } else {
    requestId = generateId() as MessageId;
  }

  const body: ChatRequestBody = {
    kind: 'chat.request',
    payload: {
      requestId,
      fromUserId: options.fromUserId,
      fromDisplayName: displayName,
      toUserId,
    },
  };
  await options.manager.sendChatRequestEnvelope(body);

  return { request, reusedExisting, requestId };
}

export interface AcceptChatRequestOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager | null;
  readonly requestId: MessageId;
  readonly accepterUserId: UserId;
  readonly accepterDisplayName: string;
  readonly requesterOriginDeviceId: DeviceId;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface AcceptChatRequestResult {
  readonly request: ChatRequest;
  readonly directGroup: Group;
}

// The recipient invokes this when they tap "Accept". We create the shared
// direct group locally (deterministic id — the requester's side will
// derive the same id when it opens the chat), flip the row to 'accepted',
// then unicast an accept envelope back to the requester's origin device.
// If the transport is unavailable, we still persist the local state and
// throw so the UI can show an honest error.
export async function acceptChatRequest(
  options: AcceptChatRequestOptions,
): Promise<AcceptChatRequestResult> {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const generateId = options.generateId ?? newUuidV7;

  const request = ChatRequestRepo.findChatRequestById(
    options.db,
    options.requestId,
  );
  if (!request) {
    throw new ChatRequestError(
      'REQUEST_NOT_FOUND',
      'That chat request is no longer available.',
    );
  }
  if (request.status !== 'pending') {
    throw new ChatRequestError(
      'REQUEST_NOT_PENDING',
      'That chat request has already been resolved.',
    );
  }
  if (request.direction !== 'incoming') {
    throw new ChatRequestError(
      'REQUEST_WRONG_DIRECTION',
      'Only the recipient of a chat request can accept it.',
    );
  }
  if ((request.recipientUserId as string) !== (options.accepterUserId as string)) {
    throw new ChatRequestError(
      'REQUEST_WRONG_DIRECTION',
      'This chat request is addressed to a different user.',
    );
  }

  const displayName = options.accepterDisplayName.trim();
  if (displayName.length === 0) {
    throw new ChatRequestError('INVALID_INPUT', 'Set a display name first.');
  }

  const now = nowIso();

  // Ensure the requester's user row exists (responder already inserts it
  // when the request arrives, but re-check for safety in case rows were
  // pruned externally).
  if (!UserRepo.findUserById(options.db, request.requesterUserId)) {
    UserRepo.insertUser(options.db, {
      id: request.requesterUserId,
      displayName: request.requesterDisplayName,
      nowIso: now,
    });
  }

  const directGroup = ensureDirectConversation(options.db, {
    userA: request.requesterUserId,
    userB: options.accepterUserId,
    nowIso: now,
    generateId,
  });

  const updated = ChatRequestRepo.updateChatRequestStatus(
    options.db,
    options.requestId,
    'accepted',
    now,
  );

  // D-078: on accept, the recipient trusts the requester enough that a
  // future re-encounter can auto-reconnect without another handshake. Record
  // the requester's device row as linked. Done BEFORE the wire send so the
  // marker survives a momentary transport failure.
  DeviceRepo.markLinked(options.db, {
    deviceId: options.requesterOriginDeviceId,
    linkedUserId: request.requesterUserId,
    nowIso: now,
  });

  if (!options.manager) {
    throw new ChatRequestError(
      'NO_CONNECTION',
      'Accepted locally but could not notify the sender. Try again when connected.',
    );
  }

  const body: ChatRequestAcceptBody = {
    kind: 'chat.request.accept',
    payload: {
      requestId: options.requestId,
      accepterUserId: options.accepterUserId,
      accepterDisplayName: displayName,
      requesterUserId: request.requesterUserId,
    },
  };
  await options.manager.sendChatRequestAcceptEnvelope(
    body,
    options.requesterOriginDeviceId,
  );

  return { request: updated, directGroup };
}

export interface DeclineChatRequestOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager | null;
  readonly requestId: MessageId;
  readonly declinerUserId: UserId;
  readonly requesterOriginDeviceId: DeviceId | null;
  readonly nowIso?: () => string;
}

export interface DeclineChatRequestResult {
  readonly request: ChatRequest;
}

// Decline is best-effort: the requester is politely informed if we have a
// route, but their pending outgoing row will remain 'pending' forever from
// their perspective if not. That is honest — we cannot promise delivery
// without an ACK layer (D-074 rationale).
export async function declineChatRequest(
  options: DeclineChatRequestOptions,
): Promise<DeclineChatRequestResult> {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const request = ChatRequestRepo.findChatRequestById(
    options.db,
    options.requestId,
  );
  if (!request) {
    throw new ChatRequestError(
      'REQUEST_NOT_FOUND',
      'That chat request is no longer available.',
    );
  }
  if (request.status !== 'pending') {
    throw new ChatRequestError(
      'REQUEST_NOT_PENDING',
      'That chat request has already been resolved.',
    );
  }
  if (request.direction !== 'incoming') {
    throw new ChatRequestError(
      'REQUEST_WRONG_DIRECTION',
      'Only the recipient of a chat request can decline it.',
    );
  }
  if ((request.recipientUserId as string) !== (options.declinerUserId as string)) {
    throw new ChatRequestError(
      'REQUEST_WRONG_DIRECTION',
      'This chat request is addressed to a different user.',
    );
  }

  const now = nowIso();
  const updated = ChatRequestRepo.updateChatRequestStatus(
    options.db,
    options.requestId,
    'declined',
    now,
  );

  if (options.manager && options.requesterOriginDeviceId) {
    const body: ChatRequestDeclineBody = {
      kind: 'chat.request.decline',
      payload: {
        requestId: options.requestId,
        declinerUserId: options.declinerUserId,
        requesterUserId: request.requesterUserId,
      },
    };
    // Best-effort. If the wire send fails, the local decline stands.
    try {
      await options.manager.sendChatRequestDeclineEnvelope(
        body,
        options.requesterOriginDeviceId,
      );
    } catch {
      // Silent: the local state is already correct.
    }
  }

  return { request: updated };
}

// Convenience: cancel a locally-pending outgoing request without notifying
// the peer. Used when the requester backs out.
export function cancelOutgoingChatRequest(
  db: OffgridDb,
  requestId: MessageId,
  cancellerUserId: UserId,
  nowIso: string,
): ChatRequest {
  const request = ChatRequestRepo.findChatRequestById(db, requestId);
  if (!request) {
    throw new ChatRequestError(
      'REQUEST_NOT_FOUND',
      'That chat request is no longer available.',
    );
  }
  if (request.direction !== 'outgoing') {
    throw new ChatRequestError(
      'REQUEST_WRONG_DIRECTION',
      'Only outgoing requests can be cancelled here.',
    );
  }
  if ((request.requesterUserId as string) !== (cancellerUserId as string)) {
    throw new ChatRequestError(
      'REQUEST_WRONG_DIRECTION',
      'You can only cancel your own chat requests.',
    );
  }
  if (request.status !== 'pending') {
    throw new ChatRequestError(
      'REQUEST_NOT_PENDING',
      'That chat request has already been resolved.',
    );
  }
  return ChatRequestRepo.updateChatRequestStatus(
    db,
    requestId,
    'cancelled',
    nowIso,
  );
}
