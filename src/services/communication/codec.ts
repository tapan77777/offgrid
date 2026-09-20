import type { TestPing } from '../../types/communication';
import type { DeviceId, MessageId } from '../../types/ids';
import { isUuidV7 } from '../../utils/ids';

const LENGTH_PREFIX_BYTES = 4;
const MAX_FRAME_BYTES = 64 * 1024;

export function encodeTestPing(payload: TestPing): Uint8Array {
  const json = JSON.stringify(payload);
  const bodyBytes = utf8Encode(json);
  if (bodyBytes.byteLength > MAX_FRAME_BYTES) {
    throw new Error(
      `TestPing frame ${bodyBytes.byteLength}B exceeds max ${MAX_FRAME_BYTES}B`,
    );
  }
  const frame = new Uint8Array(LENGTH_PREFIX_BYTES + bodyBytes.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, bodyBytes.byteLength, false);
  frame.set(bodyBytes, LENGTH_PREFIX_BYTES);
  return frame;
}

export function decodeTestPing(frame: Uint8Array): TestPing | null {
  if (frame.byteLength < LENGTH_PREFIX_BYTES) {
    return null;
  }
  const view = new DataView(
    frame.buffer,
    frame.byteOffset,
    frame.byteLength,
  );
  const bodyLength = view.getUint32(0, false);
  if (bodyLength === 0 || bodyLength > MAX_FRAME_BYTES) {
    return null;
  }
  if (frame.byteLength < LENGTH_PREFIX_BYTES + bodyLength) {
    return null;
  }
  const bodyBytes = frame.subarray(
    LENGTH_PREFIX_BYTES,
    LENGTH_PREFIX_BYTES + bodyLength,
  );

  const json = utf8Decode(bodyBytes);
  if (json === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  return validateTestPing(parsed);
}

// Hermes on Android (RN 0.87) does not expose TextEncoder/TextDecoder in the
// global scope. To avoid adding a polyfill dependency (CLAUDE.md §16), we
// implement the minimal UTF-8 encode/decode inline. This handles the full
// BMP and supplementary planes via surrogate pairs. Bitwise operators are
// intrinsic to UTF-8 framing, so the `no-bitwise` lint rule is disabled below.
/* eslint-disable no-bitwise */
export function utf8Encode(input: string): Uint8Array {
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

export function utf8Decode(bytes: Uint8Array): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i] ?? 0;
    let codePoint: number;
    if (b1 < 0x80) {
      codePoint = b1;
      i += 1;
    } else if ((b1 & 0xe0) === 0xc0) {
      if (i + 1 >= bytes.length) return null;
      const b2 = bytes[i + 1] ?? 0;
      if ((b2 & 0xc0) !== 0x80) return null;
      codePoint = ((b1 & 0x1f) << 6) | (b2 & 0x3f);
      if (codePoint < 0x80) return null;
      i += 2;
    } else if ((b1 & 0xf0) === 0xe0) {
      if (i + 2 >= bytes.length) return null;
      const b2 = bytes[i + 1] ?? 0;
      const b3 = bytes[i + 2] ?? 0;
      if ((b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) return null;
      codePoint = ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      if (codePoint < 0x800) return null;
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null;
      i += 3;
    } else if ((b1 & 0xf8) === 0xf0) {
      if (i + 3 >= bytes.length) return null;
      const b2 = bytes[i + 1] ?? 0;
      const b3 = bytes[i + 2] ?? 0;
      const b4 = bytes[i + 3] ?? 0;
      if (
        (b2 & 0xc0) !== 0x80 ||
        (b3 & 0xc0) !== 0x80 ||
        (b4 & 0xc0) !== 0x80
      ) {
        return null;
      }
      codePoint =
        ((b1 & 0x07) << 18) |
        ((b2 & 0x3f) << 12) |
        ((b3 & 0x3f) << 6) |
        (b4 & 0x3f);
      if (codePoint < 0x10000 || codePoint > 0x10ffff) return null;
      i += 4;
    } else {
      return null;
    }
    if (codePoint <= 0xffff) {
      out += String.fromCharCode(codePoint);
    } else {
      const adjusted = codePoint - 0x10000;
      out += String.fromCharCode(
        0xd800 + (adjusted >> 10),
        0xdc00 + (adjusted & 0x3ff),
      );
    }
  }
  return out;
}

function validateTestPing(value: unknown): TestPing | null {
  if (!isRecord(value)) return null;
  if (value.v !== 1) return null;
  if (value.kind !== 'test.ping') return null;
  if (typeof value.id !== 'string' || !isUuidV7(value.id)) return null;
  if (typeof value.fromDeviceId !== 'string' || !isUuidV7(value.fromDeviceId)) {
    return null;
  }
  if (typeof value.textPreview !== 'string') return null;
  if (value.textPreview.length > 512) return null;
  if (typeof value.sentAt !== 'string') return null;
  if (!isIsoInstant(value.sentAt)) return null;

  return {
    v: 1,
    kind: 'test.ping',
    id: value.id as MessageId,
    fromDeviceId: value.fromDeviceId as DeviceId,
    textPreview: value.textPreview,
    sentAt: value.sentAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoInstant(value: string): boolean {
  if (value.length < 20) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}
