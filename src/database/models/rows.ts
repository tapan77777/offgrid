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
  // Stored as INTEGER 0/1 in SQLite; adapter surfaces it as number. D-074.
  is_direct: number;
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

export interface LocationRow {
  id: string;
  user_id: string;
  device_id: string | null;
  group_id: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  source: string;
  created_at: string;
  expires_at: string | null;
  sync_status: string;
}

export interface GroupLocationSharingRow {
  id: string;
  group_id: string;
  user_id: string;
  // Stored as INTEGER 0/1 in SQLite; adapter surfaces it as number.
  enabled: number;
  created_at: string;
  updated_at: string;
}

// D-076. Chat request handshake row. The id equals the requestId sent on
// the wire so both peers converge on the same row (see migration 0006).
export interface ChatRequestRow {
  id: string;
  requester_user_id: string;
  recipient_user_id: string;
  requester_display_name: string;
  direction: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
}
