import type {
  DeviceId,
  GroupId,
  GroupMemberId,
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
