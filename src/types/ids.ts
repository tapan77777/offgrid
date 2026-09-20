import type { RawUuid } from '../utils/ids';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<RawUuid, 'UserId'>;
export type DeviceId = Brand<RawUuid, 'DeviceId'>;
export type GroupId = Brand<RawUuid, 'GroupId'>;
export type GroupMemberId = Brand<RawUuid, 'GroupMemberId'>;
export type MessageId = Brand<RawUuid, 'MessageId'>;
export type LocationId = Brand<RawUuid, 'LocationId'>;
export type SafetyCheckinId = Brand<RawUuid, 'SafetyCheckinId'>;
export type SosEventId = Brand<RawUuid, 'SosEventId'>;
export type PeerId = Brand<RawUuid, 'PeerId'>;
export type SyncQueueId = Brand<RawUuid, 'SyncQueueId'>;
export type MapDownloadId = Brand<RawUuid, 'MapDownloadId'>;
