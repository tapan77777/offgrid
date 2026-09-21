export interface UserRow {
  id: string;
  display_name: string;
  avatar_uri: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceRow {
  id: string;
  user_id: string | null;
  device_name: string | null;
  platform: string;
  app_version: string | null;
  public_key: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status: string;
}

export interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
  left_at: string | null;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  group_id: string;
  sender_id: string;
  sender_device_id: string | null;
  message_type: string;
  payload: string;
  created_at: string;
  received_at: string | null;
  ttl: number | null;
  hop_count: number;
  delivery_status: string;
  sync_status: string;
}

export interface SettingRow {
  key: string;
  value: string | null;
  updated_at: string;
}
