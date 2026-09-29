import {
  GroupsError,
  QR_INVITE_HOST,
  QR_INVITE_SCHEME,
  QR_INVITE_VERSION,
  decodeInvitePayload,
  deriveJoinCode,
  encodeInvitePayload,
} from '../../../src/services/groups';
import {
  GROUP_NAME_MAX_LENGTH,
  JOIN_CODE_LENGTH,
} from '../../../src/services/groups/constants';
import { newUuidV7 } from '../../../src/utils/ids';
import type { GroupId } from '../../../src/types/ids';

describe('qrInvite', () => {
  const groupId = newUuidV7() as GroupId;
  const joinCode = deriveJoinCode(groupId);
  const groupName = 'Hampta Trek';

  describe('encodeInvitePayload', () => {
    it('produces the offgrid://join?v=1 URL shape', () => {
      const raw = encodeInvitePayload({ groupId, groupName, joinCode });
      expect(raw.startsWith(`${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?`)).toBe(
        true,
      );
      // URLSearchParams stringifies to key=value&... — check both known keys.
      expect(raw).toContain(`v=${QR_INVITE_VERSION}`);
      expect(raw).toContain(`code=${joinCode}`);
      // URLSearchParams.toString() encodes spaces as '+' (application/
      // x-www-form-urlencoded). Both '+' and '%20' round-trip through decode.
      expect(raw).toContain('name=Hampta+Trek');
    });

    it('trims and truncates a very long group name', () => {
      const longName = 'x'.repeat(GROUP_NAME_MAX_LENGTH + 20);
      const raw = encodeInvitePayload({
        groupId,
        groupName: `  ${longName}  `,
        joinCode,
      });
      const decoded = decodeInvitePayload(raw);
      expect(decoded.name.length).toBe(GROUP_NAME_MAX_LENGTH);
    });

    it('omits the name parameter when the name is blank', () => {
      const raw = encodeInvitePayload({ groupId, groupName: '   ', joinCode });
      expect(raw).not.toContain('name=');
      expect(decodeInvitePayload(raw).name).toBe('');
    });

    it('throws INVALID_JOIN_CODE if the code is the wrong length', () => {
      expect(() =>
        encodeInvitePayload({ groupId, groupName, joinCode: 'ABC' }),
      ).toThrow(GroupsError);
    });

    it('normalizes the join code before writing it into the URL', () => {
      // Lowercase code with a space — encoder must upper-case and strip.
      const messy = `${joinCode.slice(0, 4).toLowerCase()} ${joinCode.slice(4).toLowerCase()}`;
      const raw = encodeInvitePayload({
        groupId,
        groupName,
        joinCode: messy,
      });
      expect(raw).toContain(`code=${joinCode}`);
    });
  });

  describe('decodeInvitePayload', () => {
    it('round-trips a valid invite', () => {
      const raw = encodeInvitePayload({ groupId, groupName, joinCode });
      const decoded = decodeInvitePayload(raw);
      expect(decoded).toEqual({ code: joinCode, name: groupName });
    });

    it('accepts leading/trailing whitespace and mixed-case scheme', () => {
      const raw = encodeInvitePayload({ groupId, groupName, joinCode });
      const noisy = `  ${raw.replace('offgrid', 'OffGrid')}  `;
      const decoded = decodeInvitePayload(noisy);
      expect(decoded.code).toBe(joinCode);
    });

    it('rejects empty input', () => {
      expect(() => decodeInvitePayload('')).toThrow(GroupsError);
      expect(() => decodeInvitePayload('   ')).toThrow(GroupsError);
    });

    it('rejects a wrong scheme', () => {
      const url = `https://join?v=1&code=${joinCode}`;
      expect(() => decodeInvitePayload(url)).toThrow(/OFFGRID group invite/i);
    });

    it('rejects a wrong host', () => {
      const url = `${QR_INVITE_SCHEME}://sos?v=1&code=${joinCode}`;
      expect(() => decodeInvitePayload(url)).toThrow(/OFFGRID group invite/i);
    });

    it('rejects an unknown version', () => {
      const url = `${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?v=99&code=${joinCode}`;
      expect(() => decodeInvitePayload(url)).toThrow(/newer format/i);
    });

    it('rejects a missing version', () => {
      const url = `${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?code=${joinCode}`;
      expect(() => decodeInvitePayload(url)).toThrow(/newer format/i);
    });

    it('rejects a code that is too short after normalization', () => {
      const url = `${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?v=1&code=ABC`;
      expect(() => decodeInvitePayload(url)).toThrow(GroupsError);
    });

    it('rejects a missing code parameter', () => {
      const url = `${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?v=1&name=Test`;
      expect(() => decodeInvitePayload(url)).toThrow(GroupsError);
    });

    it('tolerates a URL-encoded, whitespace-padded, mixed-case join code', () => {
      const messy = `${joinCode.slice(0, 4).toLowerCase()}%20${joinCode.slice(4).toLowerCase()}`;
      const url = `${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?v=1&code=${messy}`;
      expect(decodeInvitePayload(url).code).toBe(joinCode);
    });

    it('produces a code that a subsequent requestJoinByCode call would accept', () => {
      // The manual entry screen calls normalizeJoinCode + checks length; the
      // decoded code must satisfy the same contract so the two paths converge.
      const raw = encodeInvitePayload({ groupId, groupName, joinCode });
      const decoded = decodeInvitePayload(raw);
      expect(decoded.code.length).toBe(JOIN_CODE_LENGTH);
      expect(decoded.code).toBe(joinCode);
    });

    it('truncates a name longer than GROUP_NAME_MAX_LENGTH', () => {
      const longName = 'x'.repeat(GROUP_NAME_MAX_LENGTH + 50);
      const encoded = encodeURIComponent(longName);
      const url = `${QR_INVITE_SCHEME}://${QR_INVITE_HOST}?v=1&code=${joinCode}&name=${encoded}`;
      expect(decodeInvitePayload(url).name.length).toBe(GROUP_NAME_MAX_LENGTH);
    });
  });

  describe('privacy — payload contains only join info', () => {
    it('does not include GPS, keys, MAC, Wi-Fi, or user identifiers', () => {
      const raw = encodeInvitePayload({ groupId, groupName, joinCode });
      const lowered = raw.toLowerCase();
      for (const forbidden of [
        'lat',
        'lng',
        'longitude',
        'latitude',
        'ssid',
        'bssid',
        'mac',
        'psk',
        'password',
        'secret',
        'key',
        'token',
        'user',
        'device',
      ]) {
        expect(lowered).not.toContain(forbidden);
      }
    });
  });
});
