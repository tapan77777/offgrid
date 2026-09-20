import { v7 as uuidV7 } from 'uuid';

export type RawUuid = string;

export function newUuidV7(): RawUuid {
  return uuidV7();
}

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}
