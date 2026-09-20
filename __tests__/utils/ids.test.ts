import { isUuidV7, newUuidV7 } from '../../src/utils/ids/uuidv7';
import { shortPrefixed, stripPrefix, withPrefix } from '../../src/utils/ids/prefixes';

describe('newUuidV7', () => {
  it('produces syntactically valid UUIDv7 values', () => {
    for (let i = 0; i < 20; i++) {
      const id = newUuidV7();
      expect(isUuidV7(id)).toBe(true);
    }
  });

  it('produces monotonically non-decreasing values when generated in order', () => {
    const ids = Array.from({ length: 50 }, () => newUuidV7());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});

describe('prefix helpers', () => {
  it('roundtrips a prefixed id back to raw', () => {
    const raw = newUuidV7();
    const prefixed = withPrefix('dev', raw);
    expect(prefixed.startsWith('dev_')).toBe(true);
    expect(stripPrefix('dev', prefixed)).toBe(raw);
  });

  it('rejects strip with wrong prefix', () => {
    const raw = newUuidV7();
    expect(() => stripPrefix('dev', `msg_${raw}`)).toThrow();
  });

  it('short form is deterministic and truncated', () => {
    const raw = newUuidV7();
    expect(shortPrefixed('dev', raw)).toBe(`dev_${raw.slice(0, 8)}…`);
  });
});
