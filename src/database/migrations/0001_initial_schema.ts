import type { Migration } from './types';

const statements: readonly string[] = [
  `CREATE TABLE users (
    id TEXT NOT NULL PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar_uri TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE devices (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    device_name TEXT,
    platform TEXT NOT NULL,
    app_version TEXT,
    public_key TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  )`,

  `CREATE TABLE groups (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  )`,

  `CREATE TABLE group_members (
    id TEXT NOT NULL PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active',
    joined_at TEXT NOT NULL,
    left_at TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE(group_id, user_id)
  )`,

  `CREATE TABLE messages (
    id TEXT NOT NULL PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    sender_device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
    message_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    received_at TEXT,
    ttl INTEGER,
    hop_count INTEGER NOT NULL DEFAULT 0,
    delivery_status TEXT NOT NULL DEFAULT 'LOCAL',
    sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
  )`,

  `CREATE TABLE locations (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    altitude REAL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
  )`,

  `CREATE TABLE safety_checkins (
    id TEXT NOT NULL PRIMARY KEY,
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
    location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'LOCAL',
    sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
  )`,

  `CREATE TABLE sos_events (
    id TEXT NOT NULL PRIMARY KEY,
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
    location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
    message TEXT,
    created_at TEXT NOT NULL,
    cancelled_at TEXT,
    status TEXT NOT NULL DEFAULT 'triggered',
    delivery_status TEXT NOT NULL DEFAULT 'LOCAL',
    sync_status TEXT NOT NULL DEFAULT 'NOT_SYNCED'
  )`,

  `CREATE TABLE peers (
    id TEXT NOT NULL PRIMARY KEY,
    device_id TEXT NOT NULL,
    transport TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    connection_state TEXT NOT NULL,
    capabilities TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(device_id, transport)
  )`,

  `CREATE TABLE sync_queue (
    id TEXT NOT NULL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_reference TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    last_attempt_at TEXT,
    next_attempt_at TEXT,
    error_code TEXT
  )`,

  `CREATE TABLE map_downloads (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    region TEXT,
    min_zoom INTEGER,
    max_zoom INTEGER,
    storage_path TEXT,
    size_bytes INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE settings (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
  )`,

  `CREATE INDEX idx_messages_group_created ON messages(group_id, created_at)`,
  `CREATE INDEX idx_messages_sync_status ON messages(sync_status)`,
  `CREATE INDEX idx_locations_group_created ON locations(group_id, created_at)`,
  `CREATE INDEX idx_locations_user_created ON locations(user_id, created_at)`,
  `CREATE INDEX idx_group_members_group ON group_members(group_id)`,
  `CREATE INDEX idx_group_members_user ON group_members(user_id)`,
  `CREATE INDEX idx_sync_queue_pending ON sync_queue(status, next_attempt_at)`,
  `CREATE INDEX idx_peers_last_seen ON peers(last_seen_at)`,
];

export const initialSchema: Migration = {
  version: 1,
  name: '0001_initial_schema',
  statements,
};
