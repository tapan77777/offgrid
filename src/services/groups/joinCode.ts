import type { GroupId } from '../../types/ids';
import { JOIN_CODE_LENGTH } from './constants';

// Human-readable join code derived from a group's UUID. The code is:
//   - deterministic (same group → same code)
//   - typeable (uppercase alphanumeric, no ambiguous 0/O/1/I/L)
//   - NOT a secret (see 05-SECURITY.md §8) — it's a convenience mechanism
//     to help someone standing next to you join a private group without a
//     QR scanner. Real cryptographic invitations are a Phase 10 concern.
//
// Ambiguity is removed by mapping the disallowed characters to safe ones.
const CHAR_SET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function deriveJoinCode(groupId: GroupId): string {
  const hex = String(groupId).replace(/-/g, '').toLowerCase();
  let out = '';
  // Walk hex digits, mapping each pair (byte) to one code character. Using
  // the last N bytes gives the most randomness (UUIDv7 has time in prefix).
  const start = Math.max(0, hex.length - JOIN_CODE_LENGTH * 2);
  for (let i = start; i < hex.length && out.length < JOIN_CODE_LENGTH; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      continue;
    }
    out += CHAR_SET[byte % CHAR_SET.length];
  }
  return out;
}

export function normalizeJoinCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

// Loose comparison — accepts common transcription mistakes (O↔0, I/L↔1)
// before comparing. Codes are already restricted to the unambiguous CHAR_SET
// when derived, so we only need to fix up user input.
export function joinCodesMatch(derived: string, entered: string): boolean {
  return normalizeUppercase(derived) === normalizeUppercase(entered);
}

function normalizeUppercase(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}
