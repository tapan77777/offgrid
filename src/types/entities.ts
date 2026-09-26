import type {
  DeviceId,
  GroupId,
  GroupLocationSharingId,
  GroupMemberId,
  LocationId,
  MessageId,
  UserId,
} from './ids';

export interface User {
  id: UserId;
  displayName: string;
  avatarUri: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DevicePlatform = 'android' | 'ios' | 'web' | 'other';

export interface Device {
  id: DeviceId;
  userId: UserId | null;
  deviceName: string | null;
  platform: DevicePlatform;
  appVersion: string | null;
  publicKey: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

export type GroupStatus = 'active' | 'archived';

export interface Group {
  id: GroupId;
  name: string;
  createdBy: UserId | null;
  createdAt: string;
  updatedAt: string;
  status: GroupStatus;
  // D-074: synthetic 1-to-1 direct-conversation groups have `isDirect=true`.
  // Regular user-created groups have `isDirect=false`.
  isDirect: boolean;
}

export type GroupMemberRole = 'admin' | 'member';
export type GroupMemberStatus = 'active' | 'left' | 'removed';

export interface GroupMember {
  id: GroupMemberId;
  groupId: GroupId;
  userId: UserId;
  role: GroupMemberRole;
  status: GroupMemberStatus;
  joinedAt: string;
  leftAt: string | null;
  updatedAt: string;
}

export type MessageType =
  | 'text'
  | 'system'
  | 'safe_checkin'
  | 'sos'
  | 'location'
  | 'future_voice';

export type MessageDeliveryStatus =
  | 'LOCAL'
  | 'PENDING'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'EXPIRED';

export type MessageSyncStatus =
  | 'NOT_SYNCED'
  | 'SYNCING'
  | 'SYNCED'
  | 'SYNC_FAILED';

export interface Message {
  id: MessageId;
  groupId: GroupId;
  senderId: UserId;
  senderDeviceId: DeviceId | null;
  messageType: MessageType;
  payload: string;
  createdAt: string;
  receivedAt: string | null;
  ttl: number | null;
  hopCount: number;
  deliveryStatus: MessageDeliveryStatus;
  syncStatus: MessageSyncStatus;
}

export interface Setting {
  key: string;
  value: string | null;
  updatedAt: string;
}

export type LocationSource = 'gps' | 'peer' | 'cloud';

export type LocationSyncStatus =
  | 'NOT_SYNCED'
  | 'SYNCING'
  | 'SYNCED'
  | 'SYNC_FAILED';

export interface Location {
  id: LocationId;
  userId: UserId;
  deviceId: DeviceId | null;
  groupId: GroupId | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  source: LocationSource;
  createdAt: string;
  expiresAt: string | null;
  syncStatus: LocationSyncStatus;
}

// Explicit per-(user, group) opt-in flag for local-first group location
// sharing (D-023 + D-072). One row per (group_id, user_id); the `enabled`
// bit is authoritative. Absence of a row is treated as OFF.
export interface GroupLocationSharing {
  id: GroupLocationSharingId;
  groupId: GroupId;
  userId: UserId;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
