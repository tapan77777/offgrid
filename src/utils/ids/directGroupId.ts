// Deterministic derivation of the synthetic private-group id used for a
// direct 1-to-1 conversation between two users (D-074).
//
// The derived id is a **syntactic** UUIDv7: its version nibble is 7 and its
// variant nibble is in {8,9,a,b} so `isUuidV7()` accepts it and the existing
// envelope validator does not need to change. The "timestamp" bits are NOT
// real timestamps — they are the first 48 bits of a deterministic hash over
// the sorted pair of userIds. Do not read temporal meaning into them.
//
// The hash is a small self-contained FNV-1a over the UTF-8 bytes of the
// input, folded twice to obtain a 128-bit output. It is explicitly NOT a
// cryptographic hash and MUST NOT be used for any security decision. It only
// exists so that both devices arrive at the same GroupId without a handshake
// (CLAUDE.md §5: no custom crypto).
//
// Because the pair is sorted before hashing, `deriveDirectGroupId(a, b)`
// always equals `deriveDirectGroupId(b, a)`. Passing the same user twice is
// rejected — a "direct conversation with yourself" has no meaning at the
// transport level.

import type { GroupId, UserId } from '../../types/ids';
import { isUuidV7 } from './uuidv7';

/* eslint-disable no-bitwise */

// FNV-1a 64-bit constants, expressed as two 32-bit halves so JS bitwise ops
// stay in the 32-bit safe range. The values are the canonical FNV-1a
// parameters (offset basis 0xcbf29ce484222325, prime 0x100000001b3).
const FNV_OFFSET_HIGH = 0xcbf29ce4;
const FNV_OFFSET_LOW = 0x84222325;
const FNV_PRIME_LOW = 0x1b3;
// Higher 32 bits of the prime are zero, so a full 64-bit multiply reduces to
// (low32 * prime) plus a carry into the high half. We compute both halves
// using safe integer arithmetic on 32-bit values.

interface U64 {
  readonly high: number;
  readonly low: number;
}

function u64(high: number, low: number): U64 {
  return { high: high >>> 0, low: low >>> 0 };
}

function u64xor(a: U64, b: U64): U64 {
  return u64(a.high ^ b.high, a.low ^ b.low);
}

// Multiply a 64-bit value by 0x100000001b3 (the FNV prime). The result is
// truncated to 64 bits, matching the FNV-1a definition.
function u64mulFnvPrime(a: U64): U64 {
  const aLo = a.low;
  const aHi = a.high;

  // Split each 32-bit half into two 16-bit halves for a safe multiply.
  const aLoLo = aLo & 0xffff;
  const aLoHi = aLo >>> 16;
  const aHiLo = aHi & 0xffff;
  const aHiHi = aHi >>> 16;

  const p = FNV_PRIME_LOW;
  const pLo = p & 0xffff;
  const pHi = p >>> 16; // 0 for our prime, but keep the structure for clarity.

  // Cross products. Each term is <= (0xffff * 0xffff) which is safe.
  const c00 = aLoLo * pLo;
  const c01 = aLoLo * pHi;
  const c10 = aLoHi * pLo;
  const c11 = aLoHi * pHi;
  const c20 = aHiLo * pLo;
  const c30 = aHiHi * pLo;
  // aHi * pHi terms overflow past bit 64 and are truncated away.

  // Assemble a 32-bit low half and carry into the high half.
  const low0 = c00 & 0xffff;
  const carry0 = (c00 >>> 16) + (c01 & 0xffff) + (c10 & 0xffff);
  const low1 = carry0 & 0xffff;
  const carryToHigh = (carry0 >>> 16) + (c01 >>> 16) + (c10 >>> 16) + c11;

  const lowResult = ((low1 << 16) | low0) >>> 0;

  // High half: c20 (shift 0), c30 (shift 16), plus carryToHigh from the low
  // half. c20/c30 are already at 32-bit-boundary positions of the 64-bit
  // output so we add them directly to the high half.
  const high0 = (c20 & 0xffff) + (carryToHigh & 0xffff);
  const high1 = (c20 >>> 16) + (c30 & 0xffff) + (carryToHigh >>> 16) + (high0 >>> 16);
  const highResult = (((high1 & 0xffff) << 16) | (high0 & 0xffff)) >>> 0;

  return u64(highResult, lowResult);
}

function fnv1a64(bytes: Uint8Array): U64 {
  let hash = u64(FNV_OFFSET_HIGH, FNV_OFFSET_LOW);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    hash = u64xor(hash, u64(0, byte));
    hash = u64mulFnvPrime(hash);
  }
  return hash;
}

function utf8Bytes(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let codePoint = input.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (codePoint < 0x80) {
      out.push(codePoint);
    } else if (codePoint < 0x800) {
      out.push(0xc0 | (codePoint >> 6));
      out.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      out.push(0xe0 | (codePoint >> 12));
      out.push(0x80 | ((codePoint >> 6) & 0x3f));
      out.push(0x80 | (codePoint & 0x3f));
    } else {
      out.push(0xf0 | (codePoint >> 18));
      out.push(0x80 | ((codePoint >> 12) & 0x3f));
      out.push(0x80 | ((codePoint >> 6) & 0x3f));
      out.push(0x80 | (codePoint & 0x3f));
    }
  }
  return Uint8Array.from(out);
}

function toHex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

// Combine two 64-bit hashes into 128 bits of hex. The two halves are FNV-1a
// over different input framings so the outputs are decorrelated enough for a
// synthetic id — this is not required to be cryptographically strong, only
// to make collisions vanishingly unlikely for the (userA, userB) domain.
function derive128Hex(sortedKey: string): string {
  const primary = fnv1a64(utf8Bytes(sortedKey));
  const secondary = fnv1a64(utf8Bytes(`v1|${sortedKey}|v1`));
  return (
    toHex8(primary.high) +
    toHex8(primary.low) +
    toHex8(secondary.high) +
    toHex8(secondary.low)
  );
}

// Rewrite the version nibble to 7 and the variant nibble to a value in
// {8,9,a,b} so the resulting string passes `isUuidV7`. The 13th hex character
// (index 12) is the version, the 17th (index 16) is the variant.
function formatAsSyntacticUuidV7(hex128: string): string {
  const chars = hex128.split('');
  chars[12] = '7';
  const variantNibble = parseInt(chars[16] ?? '0', 16);
  // Force high two bits to 10 → nibble in {8,9,a,b}. Preserve the low two
  // bits of the derived value so different inputs still map to different
  // variant nibbles.
  const forced = ((variantNibble & 0x3) | 0x8) & 0xf;
  chars[16] = forced.toString(16);
  return (
    chars.slice(0, 8).join('') +
    '-' +
    chars.slice(8, 12).join('') +
    '-' +
    chars.slice(12, 16).join('') +
    '-' +
    chars.slice(16, 20).join('') +
    '-' +
    chars.slice(20, 32).join('')
  );
}

/**
 * Derive the synthetic private-group id for the direct conversation between
 * two users. The result is stable across processes, orderings, and devices,
 * and passes `isUuidV7` so it is accepted by envelope validation without a
 * schema change (D-074).
 *
 * @throws if `userA` and `userB` are equal.
 */
export function deriveDirectGroupId(userA: UserId, userB: UserId): GroupId {
  if (userA === userB) {
    throw new Error(
      'deriveDirectGroupId requires two distinct users; direct-with-self is not modelled',
    );
  }
  const lo = (userA as unknown as string) < (userB as unknown as string)
    ? (userA as unknown as string)
    : (userB as unknown as string);
  const hi = lo === (userA as unknown as string)
    ? (userB as unknown as string)
    : (userA as unknown as string);
  const sortedKey = `${lo}:${hi}`;
  const hex128 = derive128Hex(sortedKey);
  const formatted = formatAsSyntacticUuidV7(hex128);
  if (!isUuidV7(formatted)) {
    // Defensive: the formatter is deterministic, this path is unreachable
    // unless the derivation is changed without care. Fail loud instead of
    // silently producing an invalid id.
    throw new Error(
      `deriveDirectGroupId produced non-UUIDv7 output: ${formatted}`,
    );
  }
  return formatted as GroupId;
}
