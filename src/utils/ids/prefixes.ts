import type { RawUuid } from './uuidv7';

export type IdPrefix =
  | 'usr'
  | 'dev'
  | 'grp'
  | 'gmb'
  | 'msg'
  | 'loc'
  | 'chk'
  | 'sos'
  | 'peer'
  | 'sq'
  | 'map';

export function withPrefix(prefix: IdPrefix, raw: RawUuid): string {
  return `${prefix}_${raw}`;
}

export function stripPrefix(prefix: IdPrefix, prefixed: string): RawUuid {
  const head = `${prefix}_`;
  if (!prefixed.startsWith(head)) {
    throw new Error(`ID does not start with expected prefix "${head}"`);
  }
  return prefixed.slice(head.length);
}

export function shortPrefixed(prefix: IdPrefix, raw: RawUuid): string {
  return `${prefix}_${raw.slice(0, 8)}…`;
}
