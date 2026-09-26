import { deriveDirectGroupId } from '../../../src/utils/ids/directGroupId';
import { isUuidV7, newUuidV7 } from '../../../src/utils/ids';
import type { UserId } from '../../../src/types/ids';

describe('deriveDirectGroupId', () => {
  it('is deterministic for the same pair', () => {
    const a = newUuidV7() as UserId;
    const b = newUuidV7() as UserId;
    expect(deriveDirectGroupId(a, b)).toBe(deriveDirectGroupId(a, b));
  });

  it('is commutative: order does not matter', () => {
    const a = newUuidV7() as UserId;
    const b = newUuidV7() as UserId;
    expect(deriveDirectGroupId(a, b)).toBe(deriveDirectGroupId(b, a));
  });

  it('produces a syntactically valid UUIDv7', () => {
    for (let i = 0; i < 20; i += 1) {
      const a = newUuidV7() as UserId;
      const b = newUuidV7() as UserId;
      const id = deriveDirectGroupId(a, b);
      expect(isUuidV7(id)).toBe(true);
    }
  });

  it('yields different ids for different pairs', () => {
    const a = newUuidV7() as UserId;
    const b = newUuidV7() as UserId;
    const c = newUuidV7() as UserId;
    expect(deriveDirectGroupId(a, b)).not.toBe(deriveDirectGroupId(a, c));
    expect(deriveDirectGroupId(a, b)).not.toBe(deriveDirectGroupId(b, c));
  });

  it('rejects self-with-self', () => {
    const a = newUuidV7() as UserId;
    expect(() => deriveDirectGroupId(a, a)).toThrow();
  });
});
