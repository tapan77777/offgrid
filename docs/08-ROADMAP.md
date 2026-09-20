# OFFGRID — Development Roadmap

**Document:** `08-ROADMAP.md`  
**Version:** 0.1  
**Status:** Draft  
**Depends on:** `01-PRD.md` through `07-API-SPEC.md`

---

## 1. Purpose

This document defines the order in which OFFGRID will be developed.

The main rule is:

> **Prove the hardest technical assumption first, then build the product around what is actually proven.**

OFFGRID should not spend months building polished screens before verifying that its offline communication architecture works on real devices.

---

# 2. Development Philosophy

Development will happen in small milestones.

Each milestone should have:

```text
Implementation
      ↓
Automated tests where practical
      ↓
Physical/device testing where required
      ↓
Acceptance criteria
      ↓
Decision
      ↓
Next milestone
```

Do not move to a major networking milestone simply because the code compiles.

---

# 3. Phase 0 — Product Documentation

### Status

Current phase.

Documents:

```text
01-PRD.md
02-ARCHITECTURE.md
03-NETWORKING.md
04-DATABASE.md
05-SECURITY.md
06-UX-FLOWS.md
07-API-SPEC.md
08-ROADMAP.md
09-TESTING.md
10-DECISIONS.md
CLAUDE.md
```

### Goal

Establish a stable source of truth before implementation.

### Exit criteria

- Core product scope approved.
- V0 networking goal defined.
- Architecture reviewed.
- Major security risks identified.
- Development milestones defined.

---

# 4. Phase 1 — Project Bootstrap

Create the real React Native project.

Target:

```text
React Native
+
TypeScript
+
Android
```

Initial setup includes:

- Repository
- TypeScript
- Linting
- Formatting
- Testing framework
- Environment configuration
- Navigation foundation
- Basic application shell

Do NOT implement mesh networking yet.

### Exit criteria

- App builds on Android.
- App launches on a physical Android device.
- Development workflow is documented.
- Basic tests run.
- No secrets are committed.

---

# 5. Phase 2 — Application Foundation

Per **D-044** and **D-046** (see `10-DECISIONS.md`), Phase 2 explicitly includes SQLite and the repository layer. Local persistence is a Phase 2 deliverable and must exist **before** Phase 3 networking begins.

Implement:

- Navigation
- Basic screens
- Theme/design system
- State management
- Error handling
- **SQLite** local database (D-006, D-044)
- **Repository layer** wrapping SQLite (D-044)
- Versioned migrations foundation (`04-DATABASE.md §29`)
- Basic identity/device model

Initial screens:

```text
Home
Groups
Create Group
Join Group
Group
Chat
Map
Members
Safety         (hosts distinct "I'm Safe" and "SOS" actions — D-041)
Settings
```

At this stage, networking can still be mocked for UI development, but mocks must be clearly marked as mocks (D-034).

### Exit criteria

- Navigation works.
- **SQLite database is initialized and versioned via migrations.**
- **Repository layer is in place; no screen contains raw SQL.**
- Local persistence works (create/read/update for at least one entity end-to-end).
- Screens are connected to application state.
- No UI directly contains database/networking implementation.

Phase 3 (V0 physical networking prototype) must not begin until these criteria are satisfied.

---

# 6. Phase 3 — V0 Networking Proof

This is the most important technical milestone.

### Objective

Prove local communication on physical Android devices.

Minimum test environment:

```text
Android Phone A
Android Phone B
Android Phone C
```

No:

```text
Mobile Internet
Internet Wi-Fi
Cloud dependency
```

Test:

```text
A discovers B
B discovers C
A ↔ B communication
B ↔ C communication
```

Then investigate whether the selected transport can support the desired relay topology.

### Important

Do not call this "mesh" until multi-hop behavior has actually been demonstrated.

### Exit criteria

- Real devices discover each other.
- Local connection works.
- Text payload can be exchanged.
- Disconnection/reconnection works.
- Local persistence works.
- Duplicate detection works.
- Transport limitations are documented.

---

# 7. Phase 4 — Messaging Engine

Implement the real messaging domain.

Components:

```text
Chat UI
   ↓
MessagingService
   ↓
MessageRepository
   ↓
SQLite
   ↓
CommunicationManager
   ↓
Transport
```

Features:

- Text messages
- Message IDs
- Local persistence
- Delivery states
- Duplicate prevention
- TTL
- Hop count
- Store-and-forward foundation

### Exit criteria

A message can be created and persisted locally before transport delivery is attempted.

---

# 8. Phase 5 — Private Groups

Implement:

- Create group
- Join group
- QR invitation
- Group membership
- Local group state
- Member list
- Authorization foundation

### Exit criteria

Three physical devices can participate in a controlled test group.

Unauthorized devices cannot simply access private group data.

---

# 9. Phase 6 — Location

Implement:

- GPS
- Location service
- Local location storage
- Location sharing
- Timestamp handling
- Current vs last-known state
- Group location display

### Exit criteria

A device can record GPS location without Internet.

Group members can receive location through the available communication path.

---

# 10. Phase 7 — Offline Maps

Implement:

- Map rendering
- Map area selection
- Offline map download
- Local map storage
- GPS position on map
- Map availability status

### Exit criteria

A previously downloaded area remains usable with:

```text
No Internet
```

---

# 11. Phase 8 — Safety

Implement:

### I'm Safe

```text
Tap
 ↓
Create safety event
 ↓
Local persistence
 ↓
Local/cloud delivery
```

### SOS

```text
Hold
 ↓
Confirm
 ↓
Create SOS event
 ↓
Persist locally
 ↓
Transmit through available paths
```

### Exit criteria

Safety events work offline and clearly communicate delivery state.

---

# 12. Phase 9 — Online Synchronization

Implement:

- Supabase authentication
- User profile
- Device registration
- Group synchronization
- Message synchronization
- Location synchronization
- Safety synchronization
- SOS synchronization
- Sync queue
- Retry logic
- Idempotency

### Exit criteria

Example:

```text
Offline

Message created
      ↓
SQLite
      ↓
Pending sync

Internet returns
      ↓
Supabase
      ↓
Synced
```

No duplicate cloud records are created after retries.

---

# 13. Phase 10 — Security Hardening

Before public beta:

- Finalize encryption
- Secure key storage
- Group authorization
- RLS policies
- Database protection
- Permission handling
- Secret management
- Logging review
- Dependency security
- Security testing

### Exit criteria

Security acceptance criteria from `05-SECURITY.md` are satisfied.

---

# 14. Phase 11 — Real-World Field Testing

Do not test only in a room.

Test environments should eventually include:

### Test A

Open outdoor area.

### Test B

Hiking trail.

### Test C

Forest/terrain.

### Test D

Devices separated by distance.

### Test E

Devices moving in different directions.

### Test F

Intermittent connectivity.

Measure:

- Discovery time
- Connection time
- Message delivery
- Message loss
- Duplicate rate
- Battery consumption
- Location freshness
- Maximum practical distance
- Maximum practical group size
- Relay behavior

---

# 15. Phase 12 — Android Beta

Release a controlled Android beta.

Target users:

- Friends
- Hiking groups
- Trekking groups
- Adventure communities

Collect feedback on:

- Reliability
- Battery
- UX
- Setup difficulty
- Offline behavior
- Location accuracy
- Emergency behavior

---

# 16. Phase 13 — iOS

Only after Android architecture is validated.

Implement:

```text
React Native
      ↓
iOS native transport layer
      ↓
Apple networking APIs
```

Do not assume Android networking behavior maps directly to iOS.

---

# 17. Phase 14 — LoRa / Meshtastic

After the phone-only architecture is stable:

```text
OFFGRID
   ↓
Bluetooth
   ↓
Meshtastic device
   ↓
LoRa mesh
```

Goals:

- Longer range
- Remote trekking
- Larger geographic coverage
- Store-and-forward communication

This should be implemented as another transport, not a rewrite of the messaging system.

---

# 18. Phase 15 — Product Expansion

Potential future features:

### Events

- Temporary event rooms
- Offline venue maps
- Emergency announcements
- Friend finder
- Lost & found

### Adventure businesses

- Guide dashboard
- Participant tracking
- Safety check-ins
- Trip management

### Organizations

- Private deployments
- Remote-site communication
- Team coordination

---

# 19. Explicitly Deferred

Until the core product is proven, do NOT prioritize:

- AI assistant
- Social feed
- Advertising
- Marketplace
- Payments
- Video calls
- Custom hardware manufacturing
- Complex public profiles
- Large-scale public discovery
- Enterprise dashboards

These features can distract from the core technical problem.

---

# 20. Milestone Dependency Graph

```text
Documentation
      ↓
Project Setup
      ↓
Application Foundation
      ↓
V0 Networking
      ↓
Messaging Engine
      ↓
Private Groups
      ↓
Location
      ↓
Offline Maps
      ↓
Safety
      ↓
Cloud Sync
      ↓
Security Hardening
      ↓
Field Testing
      ↓
Android Beta
      ↓
iOS
      ↓
LoRa / Meshtastic
      ↓
Expansion
```

---

# 21. What Claude Code May Work On

Claude may work on:

- Project setup
- UI implementation
- Local database
- Tests
- Business logic
- Networking prototypes
- Documentation updates
- Refactoring

provided it follows `CLAUDE.md`.

---

# 22. What Claude Must Not Decide Alone

Claude must not silently decide:

- Product scope
- Core networking architecture
- Cryptographic protocol
- Security model
- Data retention
- Privacy defaults
- Major dependency changes
- Cloud architecture changes
- LoRa strategy
- Major UX changes

These require human approval and should be recorded in `10-DECISIONS.md`.

---

# 23. Definition of Done

A feature is not "done" merely because:

```text
Code compiles
```

A feature is done when appropriate:

```text
Implementation
      +
Tests
      +
Error handling
      +
Documentation
      +
Physical testing if hardware/networking
      +
Acceptance criteria
```

are satisfied.

---

# 24. First Development Target

The first coding milestone should be intentionally small:

> **Create a minimal Android application capable of discovering another OFFGRID test device and exchanging a test message without Internet connectivity.**

Do not build the complete consumer UI before this proof.

---

# 25. First Physical Test

Required:

```text
Phone A
Phone B
Phone C
```

Test:

```text
No Internet

A discovers B
B discovers C

A sends:
"HELLO OFFGRID"

Record:
- Did B receive?
- Did C receive?
- How long?
- Through what transport?
- Can it reconnect?
- Are duplicates created?
- What happens when a device disappears?
```

This experiment will inform the final networking architecture.

---

# 26. Roadmap Principle

The roadmap is deliberately conservative.

The order should be:

```text
PROVE
 ↓
BUILD
 ↓
TEST
 ↓
MEASURE
 ↓
IMPROVE
 ↓
EXPAND
```

Not:

```text
BUILD EVERYTHING
 ↓
Hope networking works
```
