import type { OffgridDb } from '../../database';
import {
  GroupMemberRepo,
  GroupRepo,
  MessageRepo,
} from '../../database/repositories';
import type { CommunicationManager } from '../communication/CommunicationManager';
import type { MsgTextBody } from '../../types/communication';
import { MAX_MSG_TEXT_UTF8_BYTES } from '../../types/communication';
import type { Message } from '../../types/entities';
import type {
  DeviceId,
  GroupId,
  MessageId,
  UserId,
} from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import { utf8Encode } from '../communication/codec';

// Chat V1 sender (D-074). Contract:
//   1. Validate the payload cheaply (trim, non-empty, UTF-8 byte cap).
//   2. Authorize the sender against the group (active membership, or one of
//      the two members of the direct group).
//   3. Insert the message row at LOCAL synchronously — CLAUDE.md §10
//      requires persistence before we depend on network delivery.
//   4. If a live CommunicationManager is available, try to send. On success
//      flip LOCAL → SENT; on transport error leave LOCAL for the outbox to
//      retry / age out.
//   5. Return an honest status. We never claim DELIVERED — no ACK layer.

export type ChatSendStatus = 'sent' | 'queued' | 'error';

export interface SendChatTextInput {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager | null;
  readonly groupId: GroupId;
  readonly senderUserId: UserId;
  readonly senderDeviceId: DeviceId | null;
  readonly text: string;
  readonly nowIso: string;
  readonly generateId?: () => string;
}

export interface SendChatTextOutcome {
  readonly message: Message;
  readonly status: ChatSendStatus;
  readonly error?: Error;
}

export class ChatSendValidationError extends Error {
  readonly reason:
    | 'empty-text'
    | 'text-too-long'
    | 'group-not-found'
    | 'not-a-member';

  constructor(
    reason:
      | 'empty-text'
      | 'text-too-long'
      | 'group-not-found'
      | 'not-a-member',
    message: string,
  ) {
    super(message);
    this.name = 'ChatSendValidationError';
    this.reason = reason;
  }
}

export async function sendChatText(
  input: SendChatTextInput,
): Promise<SendChatTextOutcome> {
  const trimmed = input.text.trim();
  if (trimmed.length === 0) {
    throw new ChatSendValidationError('empty-text', 'Message is empty.');
  }
  const bytes = utf8Encode(input.text);
  if (bytes.byteLength > MAX_MSG_TEXT_UTF8_BYTES) {
    throw new ChatSendValidationError(
      'text-too-long',
      `Message exceeds ${MAX_MSG_TEXT_UTF8_BYTES} UTF-8 bytes.`,
    );
  }

  const group = GroupRepo.findGroupById(input.db, input.groupId);
  if (!group) {
    throw new ChatSendValidationError(
      'group-not-found',
      'Conversation not found on this device.',
    );
  }

  const membership = GroupMemberRepo.findMembership(
    input.db,
    input.groupId,
    input.senderUserId,
  );
  if (!membership || membership.status !== 'active') {
    throw new ChatSendValidationError(
      'not-a-member',
      'You are not an active participant in this conversation.',
    );
  }

  const generateId = input.generateId ?? newUuidV7;
  const messageId = generateId() as MessageId;
  const message = MessageRepo.insertMessage(input.db, {
    id: messageId,
    groupId: input.groupId,
    senderId: input.senderUserId,
    senderDeviceId: input.senderDeviceId ?? null,
    messageType: 'text',
    // CLAUDE.md §10: never silently discard user-created data. Payload is
    // the raw text; the envelope is reconstructed on-demand for send.
    payload: input.text,
    createdAt: input.nowIso,
    deliveryStatus: 'LOCAL',
  });

  if (!input.manager) {
    return { message, status: 'queued' };
  }

  const body: MsgTextBody = {
    kind: 'msg.text',
    payload: {
      groupId: input.groupId,
      senderUserId: input.senderUserId,
      messageId,
      text: input.text,
      createdAt: input.nowIso,
    },
  };
  try {
    await input.manager.sendChatTextEnvelope(body);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    // Leave the row at LOCAL. The outbox will retry within the timeout and
    // eventually mark FAILED if it never lands. Never claim SENT here.
    return { message, status: 'error', error };
  }
  const sent = MessageRepo.updateDeliveryStatus(input.db, messageId, 'SENT');
  return { message: sent, status: 'sent' };
}
