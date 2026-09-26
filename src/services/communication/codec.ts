import type {
  EnvelopeBody,
  GroupLocationBody,
  MessageEnvelope,
  MsgTextBody,
  TestPing,
  TestPingBody,
} from '../../types/communication';
import {
  MAX_ENVELOPE_HOP_COUNT,
  MAX_ENVELOPE_TTL,
  MAX_MSG_TEXT_UTF8_BYTES,
} from '../../types/communication';
import type {
  DeviceId,
  GroupId,
  LocationId,
  MessageId,
  UserId,
} from '../../types/ids';
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

export function encodeEnvelope(envelope: MessageEnvelope): Uint8Array {
  const json = JSON.stringify(envelope);
  const bodyBytes = utf8Encode(json);
  if (bodyBytes.byteLength > MAX_FRAME_BYTES) {
    throw new Error(
      `MessageEnvelope frame ${bodyBytes.byteLength}B exceeds max ${MAX_FRAME_BYTES}B`,
    );
  }
  const frame = new Uint8Array(LENGTH_PREFIX_BYTES + bodyBytes.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, bodyBytes.byteLength, false);
  frame.set(bodyBytes, LENGTH_PREFIX_BYTES);
  return frame;
}

export function decodeEnvelope(frame: Uint8Array): MessageEnvelope | null {
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
  return validateEnvelope(parsed);
}

export function validateEnvelope(value: unknown): MessageEnvelope | null {
  if (!isRecord(value)) return null;
  if (value.v !== 1) return null;
  if (value.kind !== 'msg.envelope') return null;
  if (typeof value.id !== 'string' || !isUuidV7(value.id)) return null;
  if (
    typeof value.originDeviceId !== 'string' ||
    !isUuidV7(value.originDeviceId)
  ) {
    return null;
  }
  if (value.destinationDeviceId !== null) {
    if (
      typeof value.destinationDeviceId !== 'string' ||
      !isUuidV7(value.destinationDeviceId)
    ) {
      return null;
    }
  }
  if (!isIntegerInRange(value.ttl, 0, MAX_ENVELOPE_TTL)) return null;
  if (!isIntegerInRange(value.hopCount, 0, MAX_ENVELOPE_HOP_COUNT)) {
    return null;
  }
  if (typeof value.sentAt !== 'string' || !isIsoInstant(value.sentAt)) {
    return null;
  }
  const body = validateEnvelopeBody(value.body);
  if (body === null) return null;

  return {
    v: 1,
    kind: 'msg.envelope',
    id: value.id as MessageId,
    originDeviceId: value.originDeviceId as DeviceId,
    destinationDeviceId:
      value.destinationDeviceId === null
        ? null
        : (value.destinationDeviceId as DeviceId),
    ttl: value.ttl,
    hopCount: value.hopCount,
    sentAt: value.sentAt,
    body,
  };
}

function validateEnvelopeBody(value: unknown): EnvelopeBody | null {
  if (!isRecord(value)) return null;
  if (typeof value.kind !== 'string') return null;
  if (value.kind === 'test.ping') {
    return validateTestPingBody(value);
  }
  if (value.kind === 'group.location') {
    return validateGroupLocationBody(value);
  }
  if (value.kind === 'msg.text') {
    return validateMsgTextBody(value);
  }
  return null;
}

function validateMsgTextBody(
  value: Record<string, unknown>,
): MsgTextBody | null {
  const payload = value.payload;
  if (!isRecord(payload)) return null;
  if (typeof payload.groupId !== 'string' || !isUuidV7(payload.groupId)) {
    return null;
  }
  if (
    typeof payload.senderUserId !== 'string' ||
    !isUuidV7(payload.senderUserId)
  ) {
    return null;
  }
  if (typeof payload.messageId !== 'string' || !isUuidV7(payload.messageId)) {
    return null;
  }
  if (typeof payload.text !== 'string') return null;
  const trimmed = payload.text.trim();
  if (trimmed.length === 0) return null;
  // Count UTF-8 bytes, not JS chars: multi-byte code points must not slip
  // past the cap by looking short in JS's UTF-16 string length.
  const bytes = utf8Encode(payload.text);
  if (bytes.byteLength > MAX_MSG_TEXT_UTF8_BYTES) return null;
  if (typeof payload.createdAt !== 'string' || !isIsoInstant(payload.createdAt)) {
    return null;
  }
  return {
    kind: 'msg.text',
    payload: {
      groupId: payload.groupId as GroupId,
      senderUserId: payload.senderUserId as UserId,
      messageId: payload.messageId as MessageId,
      text: payload.text,
      createdAt: payload.createdAt,
    },
  };
}

function validateTestPingBody(value: Record<string, unknown>): TestPingBody | null {
  const payload = value.payload;
  if (!isRecord(payload)) return null;
  if (typeof payload.textPreview !== 'string') return null;
  if (payload.textPreview.length > 512) return null;
  return {
    kind: 'test.ping',
    payload: { textPreview: payload.textPreview },
  };
}

function validateGroupLocationBody(
  value: Record<string, unknown>,
): GroupLocationBody | null {
  const payload = value.payload;
  if (!isRecord(payload)) return null;
  if (typeof payload.groupId !== 'string' || !isUuidV7(payload.groupId)) {
    return null;
  }
  if (
    typeof payload.senderUserId !== 'string' ||
    !isUuidV7(payload.senderUserId)
  ) {
    return null;
  }
  if (typeof payload.locationId !== 'string' || !isUuidV7(payload.locationId)) {
    return null;
  }
  if (!isLatitude(payload.latitude)) return null;
  if (!isLongitude(payload.longitude)) return null;
  const accuracy = normalizeOptional(payload.accuracy, 0, Number.POSITIVE_INFINITY);
  if (accuracy === undefined) return null;
  const altitude = normalizeOptional(
    payload.altitude,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  if (altitude === undefined) return null;
  const heading = normalizeOptional(payload.heading, 0, 360);
  if (heading === undefined) return null;
  const speed = normalizeOptional(payload.speed, 0, Number.POSITIVE_INFINITY);
  if (speed === undefined) return null;
  if (typeof payload.capturedAt !== 'string' || !isIsoInstant(payload.capturedAt)) {
    return null;
  }
  return {
    kind: 'group.location',
    payload: {
      groupId: payload.groupId as GroupId,
      senderUserId: payload.senderUserId as UserId,
      locationId: payload.locationId as LocationId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy,
      altitude,
      heading,
      speed,
      capturedAt: payload.capturedAt,
    },
  };
}

function isLatitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isLongitude(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

// Returns:
//   - the number when present and inside [min, max]
//   - null when explicitly missing (null / undefined)
//   - undefined when the value is present but invalid (out of range,
//     non-finite, wrong type) — callers treat undefined as "reject envelope"
function normalizeOptional(
  value: unknown,
  min: number,
  max: number,
): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

function isIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
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
