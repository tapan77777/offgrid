# OFFGRID — Database Specification

**Document:** `04-DATABASE.md`  
**Version:** 0.1  
**Status:** Draft  
**Depends on:** `01-PRD.md`, `02-ARCHITECTURE.md`, `03-NETWORKING.md`

---

## 1. Purpose

This document defines OFFGRID's local and cloud data model.

The most important database principle is:

> **OFFGRID must remain useful when the device has no Internet connection.**

Therefore, local storage is a first-class part of the architecture.

---

# 2. Storage Architecture

OFFGRID has two data environments:

```text
┌──────────────────────────────┐
│          DEVICE              │
│                              │
│          SQLite              │
│                              │
│   Primary offline storage    │
└──────────────┬───────────────┘
               │
          Sync when online
               │
               ▼
┌──────────────────────────────┐
│          CLOUD               │
│                              │
│         Supabase             │
│                              │
│  Backup + online sync        │
└──────────────────────────────┘
```

### Strict rule

Core offline features must not depend on Supabase.

---

# 3. Local SQLite Responsibilities

SQLite should store enough information for the user to continue using the application without Internet.

Local data includes:

- Local user identity
- Device identity
- Groups
- Group membership
- Messages
- Locations
- Safety check-ins
- SOS events
- Peer information
- Pending outbound data
- Synchronization state
- Offline map metadata
- Application settings

---

# 4. Cloud Responsibilities

Supabase may store:

- User account information
- Cloud profile
- Groups
- Group membership
- Messages eligible for cloud synchronization
- Location history where enabled
- Safety events
- SOS event records
- Device registrations
- Synchronization metadata

The exact retention policy will be finalized in `05-SECURITY.md`.

---

# 5. Database Design Principles

1. Every important local operation should be persisted.
2. Network availability must not determine whether data can be created.
3. IDs must be generated safely and uniquely.
4. Local records must contain enough metadata for synchronization.
5. Cloud synchronization must be idempotent.
6. Duplicate records must be detectable.
7. Deleted/removed records may require tombstones or equivalent synchronization state.
8. Database migrations must be versioned.
9. Business logic should access repositories rather than scattering SQL throughout the app.
10. Sensitive data must be protected according to the security design.

---

# 5A. Naming Conventions

Per **D-042** (see `10-DECISIONS.md`), OFFGRID uses two field-naming conventions with a clear boundary between them:

| Layer | Convention | Example |
|---|---|---|
| SQLite storage (tables, columns, indexes) | `snake_case` | `group_id`, `created_at`, `sync_status` |
| TypeScript / application objects | `camelCase` | `groupId`, `createdAt`, `syncStatus` |
| JSON / network payloads (local transport and cloud API) | `camelCase` | `"groupId": "...", "createdAt": "..."` |

### Rule

The **repository layer** is the single conversion boundary between snake_case storage and camelCase application/network representations. Business logic, services, screens, and network payloads must never see snake_case field names, and SQLite tables must never store camelCase columns.

### Consequence

- The conceptual field lists later in this document (e.g. `messages`, `locations`, `sync_queue`) are written in `snake_case` because they describe storage.
- The message JSON shown in `03-NETWORKING.md §12` and the payloads in `07-API-SPEC.md` are written in `camelCase` because they describe application/network representations.
- Both are correct within their layer. Field-name mapping is a repository responsibility.

---

# 6. Entity Overview

Initial entities:

```text
User
 │
 ├── Devices
 │
 └── Group Membership
          │
          ▼
        Group
          │
     ┌────┼─────────────┐
     │    │             │
 Messages Locations   Safety/SOS
```

Additional technical entities:

```text
SyncQueue
Peer
MapDownload
Settings
```

---

# 7. Users

Conceptual table:

```text
users
```

Fields:

```text
id
display_name
avatar_uri
created_at
updated_at
```

### Notes

`id` is the application-level user identifier.

Do not use phone number as the primary identity.

A user may eventually use more than one device.

---

# 8. Devices

Conceptual table:

```text
devices
```

Fields:

```text
id
user_id
device_name
platform
app_version
public_key
created_at
last_seen_at
```

### Important distinction

```text
User
```

is the human/application account.

```text
Device
```

is the physical installation running OFFGRID.

One user may have multiple devices.

---

# 9. Groups

Conceptual table:

```text
groups
```

Fields:

```text
id
name
created_by
created_at
updated_at
status
```

Example:

```text
id: grp_123
name: Khambeswari Hiking
created_by: usr_001
```

---

# 10. Group Members

Conceptual table:

```text
group_members
```

Fields:

```text
id
group_id
user_id
role
status
joined_at
left_at
updated_at
```

Possible roles:

```text
owner
member
```

Possible membership states:

```text
active
left
removed
pending
```

The exact role model can expand later.

---

# 11. Messages

Conceptual table:

```text
messages
```

Fields:

```text
id
group_id
sender_id
sender_device_id
message_type
payload
created_at
received_at
ttl
hop_count
delivery_status
sync_status
```

Possible message types:

```text
text
system
safe_checkin
sos
location
future_voice
```

The message payload may eventually be structured/encrypted rather than plain text.

---

# 12. Message IDs

Every message must have an application-level unique ID.

Example:

```text
msg_01JXXXX
```

The ID must remain stable while the message is forwarded.

Example:

```text
A creates:

messageId = msg_123

A → B → C
```

B must NOT create a new message ID.

This enables duplicate detection.

---

# 13. Message Delivery Status

Possible local states:

```text
LOCAL
PENDING
SENDING
SENT
DELIVERED
FAILED
EXPIRED
```

These states describe transport progress.

They should not be confused with cloud synchronization.

---

# 14. Message Sync Status

Separate synchronization state:

```text
NOT_SYNCED
SYNCING
SYNCED
SYNC_FAILED
```

This is important because:

```text
Message delivered locally
```

does not necessarily mean:

```text
Message synchronized to Supabase
```

---

# 15. Locations

Conceptual table:

```text
locations
```

Fields:

```text
id
user_id
device_id
group_id
latitude
longitude
accuracy
altitude
source
created_at
expires_at
sync_status
```

Possible sources:

```text
gps
peer
cloud
```

The system must retain timestamps.

A location record must never be treated as current solely because it exists.

---

# 16. Current vs Last-Known Location

The application should calculate display state using timestamp and connection information.

Example:

```text
Location timestamp:
10:42 AM

Current time:
10:44 AM
```

Display:

```text
Last known 2 min ago
```

not:

```text
Currently here
```

unless the system has sufficient evidence that the location is current.

---

# 17. Safety Check-ins

Conceptual table:

```text
safety_checkins
```

Fields:

```text
id
group_id
user_id
device_id
location_id
created_at
delivery_status
sync_status
```

Example:

```text
Tapan
SAFE
10:42 AM
```

---

# 18. SOS Events

Conceptual table:

```text
sos_events
```

Fields:

```text
id
group_id
user_id
device_id
location_id
message
created_at
cancelled_at
status
delivery_status
sync_status
```

Possible states:

```text
triggered
acknowledged
cancelled
expired
```

The SOS record must preserve when it was created and what location information was available at the time.

---

# 19. Peer Devices

Conceptual table:

```text
peers
```

Fields:

```text
device_id
transport
last_seen_at
connection_state
capabilities
created_at
updated_at
```

Example:

```text
device_id: dev_123
transport: wifi_p2p
connection_state: connected
last_seen_at: 10:43 AM
```

Peer records may be temporary and should have lifecycle/expiration rules.

---

# 20. Sync Queue

This is a critical offline-first component.

Conceptual table:

```text
sync_queue
```

Fields:

```text
id
entity_type
entity_id
operation
payload_reference
attempt_count
status
created_at
last_attempt_at
next_attempt_at
error_code
```

Possible operations:

```text
create
update
delete
```

Possible states:

```text
pending
processing
completed
failed
```

Example:

```text
User sends message
       ↓
SQLite message
       ↓
sync_queue
       ↓
Internet unavailable
       ↓
Wait
       ↓
Internet returns
       ↓
Sync
```

---

# 21. Map Downloads

Conceptual table:

```text
map_downloads
```

Fields:

```text
id
name
region
min_zoom
max_zoom
storage_path
size_bytes
status
created_at
updated_at
```

The actual map tile/data storage format will be finalized during map implementation.

The database should store metadata, not necessarily every map tile as relational rows.

---

# 22. Settings

Conceptual table:

```text
settings
```

Possible fields:

```text
key
value
updated_at
```

Potential settings:

```text
location_sharing
background_discovery
battery_mode
notification_preferences
map_preferences
privacy_preferences
```

Sensitive settings should be protected appropriately.

---

# 23. Local Database Relationships

Conceptually:

```text
users
  │
  ├──────────────┐
  │              │
  ▼              ▼
devices       groups
                 │
                 ▼
          group_members
                 │
        ┌────────┼──────────┐
        ▼        ▼          ▼
     messages locations safety
                            │
                            ▼
                           SOS
```

---

# 24. Cloud Database Relationships

Supabase should broadly mirror the logical domain model.

However:

> **Cloud schema must not dictate offline behavior.**

The local schema may contain additional technical tables such as:

```text
sync_queue
peers
local_state
```

that do not need to exist in the cloud.

---

# 25. Synchronization Model

OFFGRID should use an explicit synchronization process.

### Create locally

```text
User action
   ↓
Validate
   ↓
SQLite transaction
   ↓
Sync queue entry
```

### When online

```text
Connectivity restored
        ↓
SyncService
        ↓
Read pending queue
        ↓
Send to Supabase
        ↓
Verify response
        ↓
Mark synced
```

---

# 26. Idempotency

Cloud synchronization must be safe to retry.

Example:

```text
Message msg_123
```

is uploaded.

Network fails after the server accepts it.

The app retries.

The server must recognize:

```text
msg_123
```

and avoid creating a second copy.

Application-level IDs must therefore be stable and unique.

---

# 27. Conflict Handling

Conflicts can occur when the device and cloud both have changes.

Initial strategy:

- Prefer explicit conflict rules.
- Do not silently overwrite important data.
- Messages should generally be append-only.
- Safety/SOS events should preserve event history.
- Group membership changes require explicit rules.
- Location is time-series data and should not simply overwrite previous points.

Detailed conflict resolution will be defined as the product evolves.

---

# 28. Transactions

Operations that modify related local records should use SQLite transactions.

Example:

```text
Send message

BEGIN TRANSACTION

Insert message
Insert sync queue item

COMMIT
```

If one operation fails:

```text
ROLLBACK
```

This prevents a message from existing without its required synchronization state.

---

# 29. Database Migrations

Database schema changes must use versioned migrations.

Example:

```text
001_initial_schema
002_add_devices
003_add_sos_events
004_add_message_sync_status
```

Never modify production schemas manually without a migration.

---

# 30. Data Retention

Retention rules will be finalized in `05-SECURITY.md`.

The system must eventually define:

- Message retention
- Location retention
- SOS retention
- Group history
- Deleted-account data
- Local cache cleanup
- Cloud backup retention

Do not implement permanent retention by assumption.

---

# 31. Offline Deletion

Deleting local data does not automatically mean deleting cloud data.

Example:

```text
Delete local message
```

may mean:

```text
Remove local cache
```

while cloud history remains subject to account/group retention rules.

Deletion semantics must therefore be explicitly defined.

---

# 32. Repository Layer

Application code should use repositories.

Example:

```text
MessageService
      ↓
MessageRepository
      ↓
SQLite
```

Not:

```text
ChatScreen
   ↓
raw SQL
```

Repositories should expose domain-friendly methods such as:

```text
createMessage()
getMessages()
markDelivered()
markSynced()
getPendingSyncItems()
```

---

# 33. Encryption and Sensitive Data

The database design must support the security requirements defined in `05-SECURITY.md`.

Do not store highly sensitive information in plain text unless explicitly approved.

Potential protections include:
- Encrypted message payloads
- Secure key storage
- Protected local database
- Minimal cloud retention

The exact implementation will be specified separately.

---

# 34. Initial SQLite Schema Summary

```text
users
devices

groups
group_members

messages
locations

safety_checkins
sos_events

peers
sync_queue

map_downloads
settings
```

This is a conceptual schema.

Exact SQL types, indexes, foreign keys, constraints, and library-specific definitions should be finalized during implementation.

---

# 35. Important Indexes

The implementation should consider indexes for:

```text
messages(group_id, created_at)
messages(id)
messages(sync_status)

locations(group_id, created_at)
locations(user_id, created_at)

group_members(group_id)
group_members(user_id)

sync_queue(status, next_attempt_at)

peers(last_seen_at)
```

Exact indexing should be verified against actual query patterns rather than blindly implementing every suggested index.

---

# 36. Database Acceptance Criteria

The database architecture is acceptable when:

- OFFGRID can create and read core data without Internet.
- Messages persist locally.
- Group membership persists locally.
- Location data persists locally.
- SOS/check-in data persists locally.
- Pending cloud operations survive app restarts.
- Synchronization can retry safely.
- Duplicate cloud records are prevented.
- Database migrations are versioned.
- Local and cloud responsibilities are clearly separated.

---

# 37. Open Database Decisions

These decisions will be finalized during implementation:

1. Exact SQLite library
2. ORM vs lightweight repository approach
3. UUID/ULID/other ID format
4. Local database encryption mechanism
5. Exact Supabase schema
6. Row-level security rules
7. Location retention policy
8. Message retention policy
9. Conflict-resolution details
10. Sync batching strategy
11. Background synchronization behavior
12. Offline map storage implementation

Do not allow Claude Code to silently make these product/security decisions.

Record major decisions in `10-DECISIONS.md`.
