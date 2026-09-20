# OFFGRID — Testing Strategy

**Document:** `09-TESTING.md`  
**Version:** 0.1  
**Status:** Draft  
**Depends on:** `01-PRD.md` through `08-ROADMAP.md`

---

## 1. Purpose

OFFGRID is a safety-oriented offline communication application.

Testing must therefore verify more than whether the UI works.

The system must be tested at four levels:

```text
Unit
  ↓
Integration
  ↓
Physical Device
  ↓
Real-World Field
```

The most important rule is:

> **Networking behavior must be proven on physical devices.**

A passing mock or simulator test does not prove offline communication works.

---

# 2. Testing Principles

1. Test offline behavior first.
2. Test failure states intentionally.
3. Never assume network connectivity.
4. Test with real Android devices.
5. Test multiple devices simultaneously.
6. Test duplicate messages.
7. Test device disappearance.
8. Test reconnection.
9. Test battery impact.
10. Test security boundaries.
11. Test data persistence after app restart.
12. Test upgrades and migrations.
13. Never mark networking as working based only on logs or mocked transports.

---

# 3. Test Levels

## 3.1 Unit Tests

Test isolated logic.

Examples:

- Message ID generation
- TTL handling
- Hop count
- Duplicate detection
- Message state transitions
- Group authorization logic
- Location freshness
- Safety event state
- Sync queue logic
- Retry logic
- Conflict resolution
- Validation

Unit tests should be fast and deterministic.

---

# 4. Integration Tests

Test multiple application components together.

Examples:

```text
MessagingService
      ↓
Repository
      ↓
SQLite
```

and:

```text
MessagingService
      ↓
CommunicationManager
      ↓
Transport abstraction
```

Test:

- Database transactions
- Repository behavior
- Message creation
- Persistence
- Queue processing
- Sync logic
- Authentication state
- Group membership
- API client behavior

---

# 5. Database Testing

Every database migration must be tested.

Test:

- Fresh installation
- Existing installation
- Migration from previous version
- Duplicate insertion
- Transaction rollback
- Foreign keys
- Indexes
- Invalid data
- Large message history
- Large location history

Important:

```text
App update
   ↓
Database migration
   ↓
Existing data remains usable
```

---

# 6. Networking Test Environment

The minimum physical environment for networking development is:

```text
Device A
Device B
Device C
```

Preferably:

- Three different Android phones
- Different manufacturers where possible
- Different Android versions where practical
- Bluetooth enabled
- Wi-Fi enabled
- Internet disabled during offline tests

Later testing should include additional devices.

---

# 7. Network Test Modes

Every networking test must clearly state its mode.

### Mode A — Internet Connected

Used for:

- Cloud sync
- Authentication
- Normal online operation

### Mode B — Local Connectivity, No Internet

Used for:

- Offline discovery
- Local messaging
- Location exchange

### Mode C — Completely Offline

Used to determine whether the application behaves correctly without any external network.

### Mode D — Intermittent Connectivity

Example:

```text
Internet ON
   ↓
Internet OFF
   ↓
Offline operation
   ↓
Internet ON
   ↓
Synchronization
```

---

# 8. V0 Physical Networking Tests

## Test N-001 — Device Discovery

### Setup

Three physical Android devices.

### Procedure

1. Launch OFFGRID on A.
2. Launch OFFGRID on B.
3. Launch OFFGRID on C.
4. Disable Internet.
5. Enable required local radios.
6. Start discovery.

### Expected

Devices discover each other according to the selected transport design.

Record:

- Discovery time
- Device identity
- Connection state
- Errors
- Battery impact

---

# 9. Test N-002 — Direct Message

```text
A → B
```

Send:

```text
HELLO OFFGRID
```

Expected:

- B receives message.
- Message appears once.
- Message is persisted.
- Message ID is identical across sender/receiver.
- Delivery state updates correctly.

---

# 10. Test N-003 — Reverse Message

```text
B → A
```

Repeat the same validation.

---

# 11. Test N-004 — Three-Device Communication

Test:

```text
A ↔ B
B ↔ C
A ↔ C
```

Document which paths actually work.

Do not assume A can communicate with C merely because B exists between them.

---

# 12. Test N-005 — Relay / Multi-Hop

This is a critical experiment.

Desired conceptual topology:

```text
A ←→ B ←→ C
```

Then:

```text
A → C
```

with B acting as a relay if the transport and application architecture permit it.

### Expected

If multi-hop works:

- C receives the message.
- Original message ID is preserved.
- Duplicate delivery is prevented.
- Hop count changes correctly.
- TTL is respected.

If multi-hop does not work:

- Record the limitation.
- Do not fake the behavior.
- Update `03-NETWORKING.md` and `10-DECISIONS.md`.

---

# 13. Test N-006 — Duplicate Message

Send the same message multiple times through different paths.

Expected:

```text
One logical message
+
One message ID
+
One stored record
```

---

# 14. Test N-007 — Device Disappearance

Procedure:

1. Connect A and B.
2. Disconnect B.
3. Attempt delivery.
4. Reconnect B.

Expected:

- App detects disconnection.
- Message remains locally stored.
- Message is not silently lost.
- Delivery retries when an appropriate path returns.

---

# 15. Test N-008 — Store-and-Forward

Example:

```text
A creates message
        ↓
A has no path to C
        ↓
B later becomes reachable
        ↓
B receives/relays message
        ↓
C receives message
```

Validate:

- Message ID
- Timestamp
- TTL
- Hop count
- Duplicate prevention
- Delivery state

---

# 16. Test N-009 — App Restart

Procedure:

1. Send messages.
2. Force-close app.
3. Reopen app.
4. Reconnect devices.

Expected:

- Local messages remain.
- Queued messages remain.
- Database remains consistent.
- Duplicate messages are not created.

---

# 17. Test N-010 — Phone Restart

Repeat after a complete device restart.

---

# 18. Test N-011 — Battery / Background Behavior

Measure:

- Battery drain
- CPU usage where available
- Background behavior
- Discovery frequency
- Location frequency
- Connection maintenance

Test over meaningful periods rather than only a few minutes.

---

# 19. Messaging Tests

Test:

- Empty message
- Very long message
- Unicode
- Emojis
- Rapid messages
- Identical messages
- Offline messages
- Messages created during disconnection
- Messages after reconnection
- Duplicate packets
- Out-of-order delivery

Expected:

The application must preserve message identity and ordering semantics defined by the product.

---

# 20. Group Tests

Test:

### Create

User A creates group.

### Join

User B joins using invitation.

### Unauthorized

User C attempts access without valid authorization.

### Removal

Remove B.

### Rejoin

Test whether B can rejoin using an old invitation.

### Membership Changes

Test membership changes while offline and online.

---

# 21. Security Tests

Test:

- Invalid invitation
- Expired invitation
- Modified invitation
- Unauthorized message
- Unauthorized group access
- Device identity mismatch
- Replay attempts
- Duplicate events
- Invalid API requests
- Local storage exposure
- Logging of sensitive information

Security tests must verify the actual implemented security model.

---

# 22. Location Tests

Test:

- GPS unavailable
- GPS permission denied
- Location disabled
- Poor GPS signal
- Offline GPS
- Stale location
- Rapid movement
- Background location behavior
- App restart
- Device restart

Display:

```text
Current
Last known
Unknown
```

correctly.

---

# 23. Offline Map Tests

Test:

1. Download map area.
2. Disable Internet.
3. Force-close application.
4. Reopen.
5. Open map.
6. Move around downloaded area.

Expected:

Downloaded map remains usable without Internet.

Also test:

- Partial download
- Interrupted download
- Storage full
- Corrupt map data
- Delete map
- Redownload

---

# 24. Safety / SOS Tests

Test:

- Create safety check-in offline
- Send when connected
- SOS offline
- SOS with local path
- SOS without any communication path
- Cancel SOS
- Duplicate SOS
- App restart during SOS
- Incoming SOS
- Acknowledgement
- Cloud synchronization

Critical UX rule:

> Never display an SOS as successfully delivered unless the system has evidence of delivery through an available communication path.

---

# 25. Online/Offline Transition Tests

Test:

```text
ONLINE
 ↓
OFFLINE
 ↓
ONLINE
```

and:

```text
OFFLINE
 ↓
ONLINE
 ↓
OFFLINE
```

Validate:

- Messages
- Locations
- Safety events
- SOS
- Group changes
- Sync queue
- Cloud state

---

# 26. Sync Tests

Test:

### Normal

```text
Local → Cloud
```

### Retry

```text
Local
 ↓
Cloud failure
 ↓
Retry
```

### Duplicate retry

Same event sent multiple times.

Expected:

One logical cloud record.

### Conflict

Two devices modify related state while offline.

Expected:

Conflict behavior follows documented rules.

---

# 27. Permission Tests

Test every important permission in these states:

```text
Allow
Deny
Allow once
Previously denied
Restricted
Disabled at OS level
```

Relevant permissions may include:

- Nearby devices
- Bluetooth
- Location
- Notifications
- Camera
- Storage/files where applicable

The exact permissions depend on the final Android/iOS implementation.

---

# 28. UI/UX Tests

Test:

- First launch
- Onboarding
- Group creation
- Group joining
- Chat
- Map
- Members
- Safety
- SOS
- Settings
- Empty states
- Error states
- Loading states
- Offline states

Test both:

```text
Fast interaction
```

and:

```text
Slow/failing operation
```

---

# 29. Accessibility Tests

Check:

- Font scaling
- Touch target size
- Screen reader labels
- Contrast
- Error messages
- Icon-only controls
- SOS interaction clarity

Safety-critical actions must remain understandable.

---

# 30. Performance Tests

Measure:

- App startup
- Database queries
- Message insertion
- Message rendering
- Map loading
- GPS updates
- Peer discovery
- Memory usage
- Battery usage

Do not optimize based only on assumptions.

Measure first.

---

# 31. Field Testing

After lab tests pass, test outdoors.

Suggested scenarios:

### F-001 — Open Area

Devices separated progressively.

### F-002 — Forest

Test with natural obstacles.

### F-003 — Hiking Trail

Devices moving at different speeds.

### F-004 — Group Separation

One person moves away from the group.

### F-005 — Reconnection

Person returns to communication range.

### F-006 — Long Duration

Run OFFGRID during a realistic trip.

Record:

```text
Distance
Terrain
Time
Battery
Connectivity
Message delivery
Location freshness
Failures
```

---

# 32. Test Evidence

For important networking milestones, keep evidence.

Possible evidence:

- Device model
- Android version
- App version
- Transport used
- Test date
- Network state
- Logs
- Screen recordings
- Message IDs
- Observed range
- Battery measurements

The goal is reproducibility.

---

# 33. Bug Severity

## P0 — Critical

Examples:

- Data loss
- False SOS delivery
- Unauthorized private-group access
- App crash during critical safety action

Must block release.

## P1 — Major

Examples:

- Messaging fails
- Location fails
- Sync corruption
- Group membership corruption

Normally blocks release.

## P2 — Normal

Examples:

- UI issue
- Non-critical performance problem

Can be scheduled.

## P3 — Minor

Examples:

- Cosmetic issue
- Small usability improvement

---

# 34. Regression Testing

Every major release should repeat:

```text
Build
 ↓
Unit tests
 ↓
Integration tests
 ↓
Database migration tests
 ↓
Core offline tests
 ↓
Networking tests
 ↓
Security checks
 ↓
Field tests where applicable
```

---

# 35. Networking Release Gate

No release may claim that OFFGRID's offline networking is production-ready unless:

- Physical-device tests pass.
- Failure cases are tested.
- Duplicate handling works.
- Reconnection works.
- Persistence works.
- Battery behavior is understood.
- Known transport limitations are documented.
- Multi-hop behavior is explicitly documented as tested or unproven.

---

# 36. V0 Definition of Done

V0 is complete when:

```text
3 physical Android devices
+
No Internet
+
Real local transport
+
Device discovery
+
Direct messaging
+
Local persistence
+
Duplicate prevention
+
Disconnect/reconnect behavior
```

have been demonstrated and documented.

Multi-hop is a separate acceptance item and must not be assumed.

---

# 37. V1 Definition of Done

V1 should include:

- Private groups
- Offline messaging
- Proven communication transport
- Location
- Offline maps
- Safety check-in
- SOS with honest delivery state
- Local persistence
- Online synchronization
- Security baseline
- Android beta testing
- Field testing

---

# 38. Claude Code Testing Rules

Claude Code must:

1. Add tests for new business logic.
2. Preserve existing tests.
3. Not delete failing tests just to make CI pass.
4. Explain failures before changing expected behavior.
5. Separate mocked networking tests from physical-device tests.
6. Never claim a physical networking feature is verified without physical evidence.
7. Add regression tests for fixed bugs where practical.
8. Update documentation when test results change architectural assumptions.

---

# 39. Final Testing Principle

OFFGRID is designed for situations where normal connectivity may fail.

Therefore:

> **Failure is not an edge case. Failure is the primary test condition.**

The application should be judged by what happens when:

```text
Internet disappears
Devices disappear
Connections break
GPS becomes weak
Messages arrive late
Devices restart
Apps restart
Battery becomes limited
```

That is where OFFGRID must remain predictable and honest.
