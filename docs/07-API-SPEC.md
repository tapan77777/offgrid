# OFFGRID — API Specification

**Document:** `07-API-SPEC.md`  
**Version:** 0.1  
**Status:** Draft  
**Depends on:** `01-PRD.md`, `02-ARCHITECTURE.md`, `03-NETWORKING.md`, `04-DATABASE.md`, `05-SECURITY.md`, `06-UX-FLOWS.md`

---

## 1. Purpose

This document defines the online/backend interface for OFFGRID.

The API layer is responsible for:

- Authentication
- Cloud account data
- Group synchronization
- Cloud message synchronization
- Location synchronization where enabled
- Safety check-in synchronization
- SOS event synchronization
- Device registration
- Offline-to-online synchronization

The API is NOT responsible for local device-to-device communication.

---

# 2. Critical Architecture Rule

OFFGRID has two separate communication systems.

### Local communication

```text
Phone
 ↓
Local transport
 ↓
Nearby phone
```

### Cloud synchronization

```text
Phone
 ↓
Internet
 ↓
Supabase
```

The backend must never be required for basic offline messaging.

---

# 3. Backend Platform

Initial backend:

**Supabase**

Potential services:

```text
Supabase Auth
Supabase PostgreSQL
Supabase Row Level Security
Supabase Realtime
Storage (only where required)
```

The exact use of Realtime should be determined by the online synchronization requirements.

---

# 4. API Design Principles

1. Offline operations happen locally first.
2. Cloud operations must be retryable.
3. Requests must be idempotent where possible.
4. Authentication is required for protected cloud data.
5. Authorization must be enforced server-side.
6. Never trust client-provided group membership.
7. Sensitive operations require stronger validation.
8. API responses should not expose unnecessary private data.
9. API contracts should be versioned if breaking changes are introduced.
10. The API must work as a synchronization backend, not as the local mesh.

---

# 5. Authentication

Per **D-045** (see `10-DECISIONS.md`), authentication described in this document applies **only to cloud / synchronization functionality**. Core offline usage of OFFGRID — local group creation, local messaging, local device identity, offline maps, local safety events — must not require a Supabase account or any cloud authentication.

Every endpoint defined in this document is a cloud-sync endpoint and therefore assumes an authenticated session. Local device-to-device communication is out of scope for this document and does not use these endpoints.

Potential initial flow (cloud sync only):

```text
App (cloud sync feature)
 ↓
Authentication
 ↓
Supabase Auth
 ↓
Session
```

The exact onboarding model remains an open product decision (P-002 for account recovery and multi-device).

Potential options:

```text
Email/password
Email OTP
Magic link
OAuth
Anonymous/local identity + optional account
```

Do not implement multiple authentication methods until the product decision is finalized.

An unauthenticated user must still be able to fully use the offline core of OFFGRID.

---

# 6. User Profile

Conceptual operation:

```text
GET /profile
```

Returns the authenticated user's basic profile.

Potential data:

```json
{
  "id": "usr_123",
  "displayName": "Tapan",
  "avatarUrl": null
}
```

---

## Update Profile

```text
PATCH /profile
```

Example:

```json
{
  "displayName": "Tapan"
}
```

Server must derive the user identity from the authenticated session rather than accepting arbitrary user IDs from the client.

---

# 7. Device Registration

Conceptual operation:

```text
POST /devices
```

Example:

```json
{
  "deviceId": "dev_123",
  "platform": "android",
  "appVersion": "0.1.0",
  "publicKey": "..."
}
```

The server must associate the device with the authenticated user.

Do not trust a client-provided `userId` for ownership.

---

# 8. Groups

## Create Group

```text
POST /groups
```

Example:

```json
{
  "name": "Khambeswari Hiking"
}
```

Response:

```json
{
  "id": "grp_123",
  "name": "Khambeswari Hiking",
  "role": "owner"
}
```

The server must automatically determine the creator from the authenticated session.

---

## Get Group

```text
GET /groups/{groupId}
```

Only authorized members may retrieve private group information.

---

## List My Groups

```text
GET /groups
```

Returns groups the authenticated user is authorized to access.

---

# 9. Group Membership

## Join Group

Conceptually:

```text
POST /groups/{groupId}/join
```

The actual invitation mechanism may use a secure invitation token rather than exposing the group ID directly.

Example:

```json
{
  "inviteToken": "..."
}
```

Server verifies:

```text
Token valid?
       ↓
Not expired?
       ↓
Allowed?
       ↓
Add membership
```

---

## Leave Group

```text
POST /groups/{groupId}/leave
```

The server must validate that the authenticated user is actually a member.

---

## Remove Member

Administrative operation:

```text
POST /groups/{groupId}/members/{userId}/remove
```

Only authorized group roles may perform this operation.

Exact role permissions will be finalized later.

---

# 10. Group Synchronization

The mobile application may request group changes since a known synchronization point.

Conceptually:

```text
GET /groups/{groupId}/sync?cursor=...
```

The server returns authorized changes.

Example:

```json
{
  "cursor": "...",
  "changes": []
}
```

The exact cursor/version mechanism will be defined during implementation.

---

# 11. Message Synchronization

Messages are created locally first.

Example:

```text
User sends message
      ↓
SQLite
      ↓
Local delivery
      ↓
sync queue
      ↓
Internet available
      ↓
Cloud synchronization
```

---

## Upload Messages

Conceptually:

```text
POST /sync/messages
```

Example:

```json
{
  "messages": [
    {
      "id": "msg_123",
      "groupId": "grp_123",
      "createdAt": "2026-09-20T10:00:00Z",
      "payload": "..."
    }
  ]
}
```

The server must treat message IDs as idempotency keys.

If `msg_123` is submitted twice, it must not create two cloud messages.

---

# 12. Message Download / Sync

Conceptually:

```text
GET /groups/{groupId}/messages?cursor=...
```

Only authorized group members may retrieve messages.

Per **D-039** (see `10-DECISIONS.md`), the production direction is that the cloud must **not** have plaintext access to private group message content. Production-stored message payloads are intended to be encrypted; the server sees ciphertext only.

The specific end-to-end encryption protocol is **OPEN** (P-007) and will be selected during the security design phase. No custom cryptography (D-021). Until the protocol is selected, private message content must not be uploaded to the cloud in plaintext, except in explicitly labelled prototype or automated-test contexts.

---

# 13. Location Synchronization

Location is optional and must follow user/group privacy settings.

Conceptually:

```text
POST /sync/locations
```

Example:

```json
{
  "locations": [
    {
      "id": "loc_123",
      "groupId": "grp_123",
      "createdAt": "2026-09-20T10:42:00Z",
      "latitude": 22.0000,
      "longitude": 84.0000,
      "accuracy": 8
    }
  ]
}
```

The server must verify:

- Authenticated user
- Group membership
- Permission to share location

---

# 14. Location Retrieval

Conceptually:

```text
GET /groups/{groupId}/locations
```

The server must return only locations the requesting user is authorized to see.

The client must display timestamps clearly.

---

# 15. Safety Check-in Synchronization

Conceptually:

```text
POST /sync/safety-checkins
```

Example:

```json
{
  "id": "safe_123",
  "groupId": "grp_123",
  "createdAt": "2026-09-20T10:42:00Z",
  "locationId": "loc_123"
}
```

---

# 16. SOS Synchronization

Conceptually:

```text
POST /sync/sos
```

Example:

```json
{
  "id": "sos_123",
  "groupId": "grp_123",
  "createdAt": "2026-09-20T10:47:00Z",
  "locationId": "loc_123"
}
```

The server must verify:

- User authentication
- Group membership
- Authorization
- Valid group
- Valid location reference if supplied

The backend must not claim that an SOS reached a person merely because the server accepted the request.

---

# 17. SOS Acknowledgement

Potential future operation:

```text
POST /sos/{sosId}/acknowledge
```

Example:

```json
{
  "acknowledgedAt": "2026-09-20T10:48:00Z"
}
```

The system should distinguish:

```text
Server received SOS
```

from:

```text
Group member received SOS
```

and:

```text
Group member acknowledged SOS
```

---

# 18. Sync Queue API

The client may batch multiple pending operations.

Conceptually:

```text
POST /sync
```

Example:

```json
{
  "operations": [
    {
      "type": "message.create",
      "id": "msg_123",
      "payload": {}
    },
    {
      "type": "location.create",
      "id": "loc_123",
      "payload": {}
    }
  ]
}
```

A batch response should identify success/failure per operation.

Example:

```json
{
  "results": [
    {
      "id": "msg_123",
      "status": "synced"
    },
    {
      "id": "loc_123",
      "status": "rejected"
    }
  ]
}
```

---

# 19. Idempotency

Every synchronization entity should have a stable client-generated ID.

Examples:

```text
msg_xxx
loc_xxx
safe_xxx
sos_xxx
```

If a request is retried:

```text
same ID
```

must not create a duplicate.

This is especially important when:

```text
Server accepts request
       ↓
Connection drops
       ↓
Client doesn't receive response
       ↓
Client retries
```

---

# 20. Authorization

Server-side authorization is mandatory.

Example:

```text
GET group
     ↓
Authenticated?
     ↓
Member?
     ↓
Allowed?
```

Frontend checks are not sufficient.

Supabase Row Level Security should enforce database-level access rules.

---

# 21. Group Data Isolation

A user must never be able to request:

```text
Group A data
```

while only belonging to:

```text
Group B
```

The backend must enforce this.

---

# 22. Error Format

Use a consistent error structure.

Example:

```json
{
  "error": {
    "code": "GROUP_ACCESS_DENIED",
    "message": "You do not have access to this group."
  }
}
```

Do not expose internal database errors or sensitive implementation details.

---

# 23. Common Error Codes

Potential codes:

```text
AUTH_REQUIRED
AUTH_INVALID
GROUP_NOT_FOUND
GROUP_ACCESS_DENIED
INVITE_INVALID
INVITE_EXPIRED
MESSAGE_INVALID
LOCATION_NOT_ALLOWED
SOS_NOT_ALLOWED
RATE_LIMITED
SYNC_CONFLICT
SERVER_ERROR
```

Exact codes can be finalized during implementation.

---

# 24. Rate Limiting

Sensitive/high-volume endpoints should have rate limits.

Examples:

```text
Group creation
Invitation creation
Message synchronization
Location uploads
SOS operations
Authentication attempts
```

SOS rate limiting must be designed carefully so abuse can be controlled without accidentally blocking legitimate emergency use.

---

# 25. API Versioning

Initial internal API may begin as:

```text
/v1
```

Breaking changes should introduce a new version rather than silently changing behavior.

Example:

```text
/api/v1/...
```

The exact Supabase implementation may use database functions/RPCs and tables rather than a traditional REST server.

---

# 26. Realtime

Supabase Realtime may be used when Internet connectivity exists.

Potential uses:

```text
Online group chat
Online location updates
Online membership changes
SOS notifications
```

However:

> Realtime is not a replacement for local offline networking.

When Internet disappears, local transport remains responsible for offline communication.

---

# 27. Push Notifications

When Internet exists, platform push notifications may be used for:

- Group messages
- Group invitations
- SOS alerts
- Safety events

When Internet is unavailable:

```text
Push notification
      ↓
Unavailable
```

OFFGRID must rely on local communication instead.

---

# 28. API Security Rules

1. Never trust client-provided ownership.
2. Never trust client-provided group membership.
3. Validate all IDs.
4. Validate payload size.
5. Validate timestamps.
6. Enforce authorization server-side.
7. Apply Row Level Security.
8. Never expose service-role credentials.
9. Do not return unnecessary private data.
10. Log security events without logging message plaintext or secrets.

---

# 29. API Does Not Replace Local Networking

This distinction must remain explicit throughout development.

```text
                    OFFGRID
                       │
              ┌────────┴────────┐
              │                 │
           LOCAL              CLOUD
              │                 │
         Phone Mesh          Supabase
              │                 │
         Offline use       Online sync
```

If Supabase is unavailable:

```text
OFFGRID local functionality
        ↓
must continue operating
```

---

# 30. API Acceptance Criteria

The backend design is acceptable when:

- Authenticated users can create/retrieve authorized groups.
- Membership is enforced server-side.
- Messages can synchronize safely.
- Duplicate sync requests do not create duplicates.
- Locations are only visible to authorized users.
- SOS events can synchronize safely.
- Offline data can synchronize after reconnection.
- Server authorization does not depend on frontend checks.
- Supabase cannot be used as a bypass around local privacy rules.
- Local communication remains independent of the API.

---

# 31. Open API Decisions

The following must be finalized before backend implementation:

1. Authentication method
2. Exact Supabase schema
3. RLS policies
4. Sync cursor strategy
5. Batch synchronization format
6. Conflict resolution
7. Realtime usage
8. Push notification architecture
9. Rate limits
10. API versioning
11. Location retention
12. Message retention
13. Account recovery
14. Invitation token format

Record major decisions in `10-DECISIONS.md`.

---

## Backend Philosophy

The backend should be treated as:

```text
Identity
   +
Authorization
   +
Cloud backup
   +
Synchronization
   +
Online coordination
```

It should NOT become:

```text
The thing OFFGRID depends on to communicate.
```

The application must remain useful when the cloud disappears.
