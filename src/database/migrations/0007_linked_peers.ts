import type { Migration } from './types';

// Seamless connection (D-078). Reuse the existing `devices` table to mark a
// peer as "linked" — i.e. this device has completed the D-076 chat-request
// handshake with that peer at least once, so the connectivity controller is
// allowed to auto-reconnect without any further UI confirmation.
//
// Chosen shape (Option A): add columns to `devices`, do NOT introduce a
// separate linked_peers table. A linked peer is just a device row where
// linked_user_id IS NOT NULL AND linked_at IS NOT NULL. last_known_device_
// address is the transport-level address (Wi-Fi P2P MAC / mock id) most
// recently observed for this device, so the reconnect state machine can
// initiate a targeted connect without waiting for discovery to converge.
//
// Nullable everywhere: unlinked devices we merely discovered keep all three
// columns NULL. There is no separate "unlink" bit — clearing linked_user_id
// unlinks the peer.
//
// Rollback safety: additive. ADD COLUMN with NULL default, no data-loss
// path. Downgrading to v6 leaves the extra columns present in SQLite; older
// code paths ignore them.
const statements: readonly string[] = [
  `ALTER TABLE devices ADD COLUMN linked_user_id TEXT`,
  `ALTER TABLE devices ADD COLUMN linked_at TEXT`,
  `ALTER TABLE devices ADD COLUMN last_known_device_address TEXT`,
  `CREATE INDEX idx_devices_linked_user
     ON devices(linked_user_id)
     WHERE linked_user_id IS NOT NULL`,
];

export const linkedPeers: Migration = {
  version: 7,
  name: '0007_linked_peers',
  statements,
};
