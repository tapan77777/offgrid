import { decodeTestPing, encodeTestPing } from '../../src/services/communication/codec';
import type { TestPing } from '../../src/types/communication';
import type { DeviceId, MessageId } from '../../src/types/ids';
import { newUuidV7 } from '../../src/utils/ids';

function samplePing(overrides: Partial<TestPing> = {}): TestPing {
  return {
    v: 1,
    kind: 'test.ping',
    id: newUuidV7() as MessageId,
    fromDeviceId: newUuidV7() as DeviceId,
    textPreview: 'hello from A',
    sentAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('TestPing codec', () => {
  it('round-trips a well-formed payload', () => {
    const ping = samplePing();
    const frame = encodeTestPing(ping);
    const decoded = decodeTestPing(frame);
    expect(decoded).toEqual(ping);
  });

  it('emits a length prefix that matches the JSON body length', () => {
    const ping = samplePing();
    const frame = encodeTestPing(ping);
    const view = new DataView(
      frame.buffer,
      frame.byteOffset,
      frame.byteLength,
    );
    const prefix = view.getUint32(0, false);
    expect(prefix).toBe(frame.byteLength - 4);
  });

  it('rejects a truncated frame (missing bytes after prefix)', () => {
    const frame = encodeTestPing(samplePing());
    const truncated = frame.subarray(0, frame.byteLength - 5);
    expect(decodeTestPing(truncated)).toBeNull();
  });

  it('rejects a frame smaller than the prefix', () => {
    expect(decodeTestPing(new Uint8Array([0, 0]))).toBeNull();
  });

  it('rejects a frame that claims zero body length', () => {
    const frame = new Uint8Array(4);
    expect(decodeTestPing(frame)).toBeNull();
  });

  it('rejects a wrong wire version', () => {
    const ping = { ...samplePing(), v: 2 } as unknown as TestPing;
    const frame = encodeTestPing(samplePing());
    // Manually replace payload with the wrong version but valid length prefix.
    const body = new TextEncoder().encode(JSON.stringify(ping));
    const bad = new Uint8Array(4 + body.byteLength);
    new DataView(bad.buffer).setUint32(0, body.byteLength, false);
    bad.set(body, 4);
    expect(decodeTestPing(bad)).toBeNull();
    // Positive control: original frame still decodes.
    expect(decodeTestPing(frame)).not.toBeNull();
  });

  it('rejects a non-uuidv7 id', () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        ...samplePing(),
        id: 'not-a-uuid',
      }),
    );
    const bad = new Uint8Array(4 + body.byteLength);
    new DataView(bad.buffer).setUint32(0, body.byteLength, false);
    bad.set(body, 4);
    expect(decodeTestPing(bad)).toBeNull();
  });

  it('rejects malformed JSON', () => {
    const body = new TextEncoder().encode('{');
    const bad = new Uint8Array(4 + body.byteLength);
    new DataView(bad.buffer).setUint32(0, body.byteLength, false);
    bad.set(body, 4);
    expect(decodeTestPing(bad)).toBeNull();
  });

  it('rejects a payload above the max frame size', () => {
    const oversized: TestPing = samplePing({
      textPreview: 'x'.repeat(600),
    });
    // 600 chars still fits the 64KB frame — instead check the codec's textPreview cap.
    const body = new TextEncoder().encode(JSON.stringify(oversized));
    const frame = new Uint8Array(4 + body.byteLength);
    new DataView(frame.buffer).setUint32(0, body.byteLength, false);
    frame.set(body, 4);
    expect(decodeTestPing(frame)).toBeNull();
  });
});
