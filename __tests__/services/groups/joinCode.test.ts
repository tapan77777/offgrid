import {
  deriveJoinCode,
  joinCodesMatch,
  normalizeJoinCode,
} from '../../../src/services/groups';
import { JOIN_CODE_LENGTH } from '../../../src/services/groups/constants';
import { newUuidV7 } from '../../../src/utils/ids';
import type { GroupId } from '../../../src/types/ids';

describe('joinCode', () => {
  it('derives a deterministic uppercase code of the configured length', () => {
    const id = newUuidV7() as GroupId;
    const code = deriveJoinCode(id);
    expect(code.length).toBe(JOIN_CODE_LENGTH);
    expect(code).toMatch(/^[A-Z2-9]+$/);
    expect(deriveJoinCode(id)).toBe(code);
  });

  it('produces different codes for different group ids', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      codes.add(deriveJoinCode(newUuidV7() as GroupId));
    }
    // Codes are short so exact uniqueness is not guaranteed, but 20 random
    // UUIDs should map to well more than one distinct code.
    expect(codes.size).toBeGreaterThan(1);
  });

  it('normalizeJoinCode strips whitespace, upcases, and folds 0/O and 1/I/L', () => {
    expect(normalizeJoinCode('  a-b-c-d ')).toBe('ABCD');
    // O → 0, I and L both → 1
    expect(normalizeJoinCode('oiL0')).toBe('0110');
  });

  it('joinCodesMatch is case- and confusion-tolerant', () => {
    const id = newUuidV7() as GroupId;
    const code = deriveJoinCode(id);
    expect(joinCodesMatch(code, code.toLowerCase())).toBe(true);
    // Split with a space
    expect(joinCodesMatch(code, code.slice(0, 4) + ' ' + code.slice(4))).toBe(
      true,
    );
    expect(joinCodesMatch(code, 'ZZZZZZZZ')).toBe(false);
  });
});
