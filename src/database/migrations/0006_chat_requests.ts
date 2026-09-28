import type { Migration } from './types';

// Chat request V1 (D-076). Persists the 1-to-1 handshake that must complete
// before any msg.text can be exchanged between two peers.
//
// A chat_requests row is either outgoing (this device sent it) or incoming
// (this device received it). The id equals the requestId that travels on the
// wire so both sides can converge on the same row without a handshake token.
// requester_user_id / recipient_user_id are stable identity references
// (foreign keys omitted deliberately — the requester on an incoming row may
// be a user we've never seen before; the row insert is what causes their
// users row to be materialised).
//
// The pair (requester_user_id, recipient_user_id) is unique across pending
// rows only — a declined or accepted request must not prevent a later
// re-request. The partial unique index enforces this cheaply in SQLite.
//
// Rollback safety: additive. Table + indexes only, no changes to existing
// tables. Downgrading to v5 tolerates the extra table (SQLite ignores tables
// unknown to the older code path).
const statements: readonly string[] = [
  `CREATE TABLE chat_requests (
    id TEXT NOT NULL PRIMARY KEY,
    requester_user_id TEXT NOT NULL,
    recipient_user_id TEXT NOT NULL,
    requester_display_name TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX idx_chat_requests_status ON chat_requests(status, created_at)`,
  `CREATE INDEX idx_chat_requests_recipient
     ON chat_requests(recipient_user_id, status)`,
  `CREATE UNIQUE INDEX idx_chat_requests_pending_pair
     ON chat_requests(requester_user_id, recipient_user_id)
     WHERE status = 'pending'`,
];

export const chatRequests: Migration = {
  version: 6,
  name: '0006_chat_requests',
  statements,
};
