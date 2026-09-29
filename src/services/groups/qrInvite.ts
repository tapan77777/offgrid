import type { Group } from '../../types/entities';
import { GROUP_NAME_MAX_LENGTH, JOIN_CODE_LENGTH } from './constants';
import { GroupsError } from './errors';
import { normalizeJoinCode } from './joinCode';

// QR group-invite payload (D-077).
//
// Purpose: transport the SAME join information that already exists on paper
// (the 8-character join code) plus a human-readable group name so the joiner
// can confirm what they are joining before we call `requestJoinByCode`. QR is
// a UX shortcut, not a second join system.
//
// Payload shape — deliberately minimal:
//   offgrid://join?v=1&code=ABCD2345&name=Hampta%20Trek
//
// What is NOT in the payload (per §12 Security / §13 Privacy / §15 Location):
//   - No cryptographic keys, tokens, or secrets
//   - No GPS coordinates
//   - No Wi-Fi credentials, SSIDs, or BSSIDs
//   - No MAC or device identifiers
//   - No user IDs or membership rosters
//   - No message content
//
// Validation is strict: decoders reject anything that is not a well-formed
// v=1 payload with a code that survives `normalizeJoinCode` and matches
// JOIN_CODE_LENGTH.  Decoded output is always safe to pass to the existing
// `requestJoinByCode` because it goes through the same normalization the
// manual entry screen uses.

export const QR_INVITE_SCHEME = 'offgrid';
export const QR_INVITE_HOST = 'join';
export const QR_INVITE_VERSION = 1;

export interface QrInviteEncodeInput {
  readonly groupId: Group['id'];
  readonly groupName: string;
  readonly joinCode: string;
}

export interface QrInvitePayload {
  readonly code: string;
  readonly name: string;
}

export function encodeInvitePayload(input: QrInviteEncodeInput): string {
  const code = normalizeJoinCode(input.joinCode);
  if (code.length !== JOIN_CODE_LENGTH) {
    throw new GroupsError(
      'INVALID_JOIN_CODE',
      `Join code must be ${JOIN_CODE_LENGTH} characters.`,
    );
  }
  const name = input.groupName.trim().slice(0, GROUP_NAME_MAX_LENGTH);
  const params = new URLSearchParams();
  params.set('v', String(QR_INVITE_VERSION));
  params.set('code', code);
  if (name.length > 0) {
    params.set('name', name);
  }
  return `${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?${params.toString()}`;
}

export function decodeInvitePayload(raw: string): QrInvitePayload {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) {
    throw new GroupsError('INVALID_JOIN_CODE', 'Empty QR code.');
  }

  const prefix = `${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?`;
  if (!trimmed.toLowerCase().startsWith(prefix)) {
    throw new GroupsError('INVALID_JOIN_CODE', 'This QR is not an OFFGRID group invite.');
  }
  const query = trimmed.slice(prefix.length);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    throw new GroupsError('INVALID_JOIN_CODE', 'Invalid group invite.');
  }

  const version = params.get('v');
  if (version !== String(QR_INVITE_VERSION)) {
    throw new GroupsError(
      'INVALID_JOIN_CODE',
      'This invite uses a newer format. Update OFFGRID and try again.',
    );
  }

  const rawCode = params.get('code') ?? '';
  const code = normalizeJoinCode(rawCode);
  if (code.length !== JOIN_CODE_LENGTH) {
    throw new GroupsError(
      'INVALID_JOIN_CODE',
      `Enter a ${JOIN_CODE_LENGTH}-character join code.`,
    );
  }

  const rawName = params.get('name') ?? '';
  const name = rawName.trim().slice(0, GROUP_NAME_MAX_LENGTH);

  return { code, name };
}
