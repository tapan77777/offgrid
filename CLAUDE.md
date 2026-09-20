# OFFGRID — Claude Code Instructions

**Project:** OFFGRID  
**Version:** 0.1  
**Status:** Active  
**Purpose:** Operating rules for Claude Code working inside the OFFGRID repository.

---

# 1. Mission

OFFGRID is an offline-first group communication and safety application.

Core principle:

> **Stay connected when the network disappears.**

The application is initially focused on:

- Hiking
- Trekking
- Camping
- Outdoor adventure groups

The system must be designed around unreliable or unavailable Internet connectivity.

---

# 2. Read Before Coding

Before writing application code, Claude Code MUST read:

```text
CLAUDE.md

docs/01-PRD.md
docs/02-ARCHITECTURE.md
docs/03-NETWORKING.md
docs/04-DATABASE.md
docs/05-SECURITY.md
docs/06-UX-FLOWS.md
docs/07-API-SPEC.md
docs/08-ROADMAP.md
docs/09-TESTING.md
docs/10-DECISIONS.md
```

Do not begin major implementation before understanding these documents.

---

# 3. First Task in a New Repository

When starting work on OFFGRID for the first time:

## Do NOT immediately write application code.

First:

1. Read all project documentation.
2. Identify contradictions.
3. Identify missing dependencies.
4. Identify technically risky assumptions.
5. Identify requirements that cannot yet be verified.
6. Propose the first implementation milestone.
7. Explain the files that will be created/modified.
8. Explain how the milestone will be tested.

Then wait for approval before making major architectural changes.

---

# 4. Product Principles

Always preserve these principles:

### Offline First

Core functionality must work without cloud connectivity.

### Local First

Locally created data should be persisted locally before relying on synchronization.

### Private By Default

Nearby discovery must not automatically expose private group information.

### Honest Connectivity

Never tell the user that something was delivered when delivery has not been confirmed.

### Safety Over Convenience

Safety-critical behavior must fail visibly rather than silently.

### Simple UX

Users should not need to understand networking internals.

---

# 5. Architecture Rules

Expected high-level structure:

```text
React Native
     │
     ├── UI
     ├── State
     ├── Services
     ├── Repositories
     └── SQLite
             │
             ↓
     Communication Manager
             │
       Transport Layer
             │
       ┌─────┼──────┐
       ↓     ↓      ↓
    Wi-Fi   BLE   Future
     P2P          LoRa
```

Cloud:

```text
SQLite
   ↓
Sync Queue
   ↓
Supabase
   ↓
PostgreSQL
```

Do not bypass these boundaries without a documented reason.

---

# 6. Separation of Responsibilities

## UI

Responsible for:

- Rendering
- User interaction
- Navigation
- Display state

UI must not contain complex networking or database logic.

## Services

Responsible for:

- Messaging
- Location
- Groups
- Safety
- Sync
- Connectivity

## Repositories

Responsible for:

- Data persistence
- Queries
- Transactions
- Database abstraction

## Communication Manager

Responsible for:

- Peer communication
- Transport selection
- Connection state
- Message transmission

## Transport Layer

Responsible for platform/network-specific communication.

---

# 7. Networking Rules

Networking is the highest-risk part of OFFGRID.

## Never fake networking.

Mock networking may be used for:

- Unit tests
- UI development
- Automated integration tests

But a mock is not evidence of real offline communication.

## Never claim mesh works without physical testing.

Wi-Fi P2P/Wi-Fi Direct is currently an experimental V0 transport candidate.

Do not assume:

```text
A ↔ B
B ↔ C
```

means:

```text
A → B → C
```

Multi-hop behavior must be physically demonstrated.

---

# 8. Physical Testing Requirement

For networking milestones, use real devices.

Minimum:

```text
Android Device A
Android Device B
Android Device C
```

Whenever practical, test with different manufacturers and Android versions.

Required test conditions include:

```text
Internet OFF
Wi-Fi/local radio enabled as required
Real physical devices
```

Do not mark networking functionality as production-ready based only on:

- Emulator
- Simulator
- Unit tests
- Logs
- Mock transport

---

# 9. Message Rules

Every message must have a unique application-level ID.

Messages should support:

- Local persistence
- Delivery state
- Duplicate detection
- Retry
- TTL
- Hop count
- Store-and-forward foundation

A message must not be inserted twice merely because it was received through different paths.

---

# 10. Database Rules

SQLite is the local persistence layer.

Important rules:

- Persist important data before depending on network delivery.
- Use transactions where multiple records must change atomically.
- Never silently discard user-created data.
- Database migrations must be versioned.
- Existing user data must survive application updates.
- Do not directly access SQLite from arbitrary UI components.

---

# 11. Sync Rules

Cloud synchronization is separate from local communication.

Remember:

```text
Local delivery
≠
Cloud sync
```

A message can be:

```text
Delivered locally
+
Pending cloud sync
```

Retries must be idempotent.

Do not create duplicate cloud records when the same event is retried.

---

# 12. Security Rules

Never:

- Invent custom cryptography
- Hard-code secrets
- Commit API keys
- Log private keys
- Log sensitive user information unnecessarily
- Bypass authorization for convenience
- Disable security controls just to make development easier

Use established cryptographic libraries and platform security mechanisms.

Security-sensitive changes must be explicitly documented.

---

# 13. Privacy Rules

Private groups are private.

Do not expose:

- Group membership
- Messages
- Locations
- Safety events

to unauthorized devices.

Nearby device discovery does not equal authorization.

---

# 14. SOS Rules

SOS is safety-critical.

Never show:

```text
SOS DELIVERED
```

unless the application has evidence that it was delivered through a communication path.

Use honest states such as:

```text
Created
Sending
Sent
Delivered
Acknowledged
No connection
Failed
```

If there is no communication path, tell the user clearly.

Do not imply that emergency services have been contacted unless an actual supported emergency-service integration exists and confirms that action.

---

# 15. Location Rules

Location is sensitive.

Support clear states:

```text
Current
Last known
Unknown
Sharing disabled
```

Do not silently share location with nearby devices or groups.

Respect OS permissions.

---

# 16. Dependency Rules

Do not add a dependency merely because it is convenient.

Before adding a significant dependency, evaluate:

- Why it is needed
- Maintenance status
- License
- Bundle size
- Native complexity
- Security implications
- Offline behavior
- Alternatives

Avoid dependency sprawl.

---

# 17. TypeScript Rules

Use strict TypeScript.

Avoid:

```ts
any
```

unless there is a documented technical reason.

Prefer:

- Explicit types
- Discriminated unions
- Narrow interfaces
- Runtime validation at external boundaries
- Small modules
- Clear naming

Do not silence TypeScript errors just to make builds pass.

---

# 18. Error Handling

Do not hide errors.

Bad:

```ts
try {
  await doSomething();
} catch {}
```

Unless there is a deliberate documented reason.

Errors should be:

- Handled
- Logged appropriately
- Converted into useful application states where appropriate

Never expose sensitive internal information to users.

---

# 19. Offline Error Handling

Assume any network operation can fail.

Examples:

```text
No Internet
No peer
Peer disconnected
Permission denied
GPS unavailable
Database unavailable
Cloud unavailable
Transport unavailable
```

The application should degrade gracefully.

---

# 20. UI Rules

UI should communicate actual system state.

Do not show:

```text
Connected
```

when the system has not established a connection.

Do not show:

```text
Delivered
```

when the message only exists locally.

Do not show:

```text
Location shared
```

if location transmission has not actually occurred.

---

# 21. Testing Rules

For every meaningful business-logic feature:

- Add unit tests where practical.
- Add integration tests where appropriate.
- Test failure states.
- Preserve existing tests.
- Add regression tests for important bugs.

Never delete tests just to make CI pass.

If an existing test appears wrong:

1. Explain why.
2. Verify the requirement.
3. Change the test deliberately.
4. Document the reason when significant.

---

# 22. Networking Testing Rules

Every networking feature must define:

```text
Happy path
Failure path
Disconnect path
Reconnect path
Duplicate path
Restart path
Offline path
```

For physical networking:

```text
Device A
Device B
Device C
```

must be used for relevant milestones.

---

# 23. No Future Feature Creep

Do not implement roadmap features early.

For example, if the current task is V0 networking, do not spontaneously build:

- LoRa integration
- AI assistant
- Social feed
- Marketplace
- Payments
- Event platform
- Enterprise dashboard

unless explicitly requested.

---

# 24. No Architecture Drift

Do not silently replace:

- SQLite
- Supabase
- React Native
- TypeScript
- CommunicationManager
- Transport abstraction

with another architecture.

If a change appears necessary:

1. Explain the problem.
2. Present alternatives.
3. Identify affected documents.
4. Request approval.
5. Update `10-DECISIONS.md`.
6. Then implement.

---

# 25. Before Major Implementation

Before implementing a major feature, provide:

### 1. Goal

What is being built?

### 2. Files

Which files will be created/modified?

### 3. Architecture

How does it connect to the existing architecture?

### 4. Dependencies

What new dependencies are required?

### 5. Risks

What can go wrong?

### 6. Tests

How will it be tested?

### 7. Acceptance Criteria

How will we know it works?

---

# 26. Small Changes

For small, obvious changes, do not create unnecessary bureaucracy.

Examples:

- Typo fixes
- Formatting
- Minor UI copy
- Small isolated refactors

Still preserve project architecture and tests.

---

# 27. Code Quality

Prefer:

```text
Simple
Readable
Testable
Modular
Explicit
```

over:

```text
Clever
Highly abstract
Over-engineered
```

Do not build abstractions without a real requirement.

---

# 28. Logging

Development logs may include useful diagnostic information.

Production logs must not unnecessarily contain:

- Private messages
- Private keys
- Authentication secrets
- Sensitive locations
- Personal information

Logs should help diagnose failures without becoming a privacy risk.

---

# 29. Git Rules

Make changes in logical units.

Prefer commits such as:

```text
feat: add local message repository
feat: add peer discovery prototype
fix: prevent duplicate messages
test: add message deduplication tests
docs: document transport limitation
```

Avoid giant commits containing unrelated changes.

---

# 30. Before Declaring a Feature Complete

Check:

```text
[ ] Code implemented
[ ] TypeScript passes
[ ] Tests pass
[ ] Error states handled
[ ] Offline behavior checked
[ ] Documentation updated
[ ] Security implications reviewed
[ ] Physical testing completed if required
[ ] Acceptance criteria satisfied
```

---

# 31. If Requirements Are Ambiguous

Do not invent important product behavior.

If ambiguity affects:

- Security
- Privacy
- Data integrity
- Networking
- Product scope
- Architecture
- User safety

stop and ask for clarification.

For low-risk implementation details, choose the simplest reasonable option and document it when useful.

---

# 32. If a Platform Limitation Appears

Do not work around a platform limitation by pretending the feature works.

Instead:

```text
Identify limitation
      ↓
Explain impact
      ↓
Research alternatives
      ↓
Prototype
      ↓
Test
      ↓
Update decision log
```

---

# 33. Research Rule

When a technical requirement depends on current platform behavior, verify current official documentation before making a major architectural claim.

Especially:

- Android networking
- Android permissions
- iOS networking
- React Native compatibility
- Supabase APIs
- Map libraries
- Encryption libraries
- OS background execution

Do not rely on outdated assumptions.

---

# 34. First Claude Code Session

After the repository and documentation are present, the first instruction should be:

> Read `CLAUDE.md` and every document in `/docs`.
>
> Do not write application code yet.
>
> Review the requirements and architecture.
>
> Identify:
> - contradictions
> - missing technical decisions
> - risky assumptions
> - dependencies
> - platform limitations
> - requirements needed for V0
>
> Then propose a concrete implementation plan for the first technical milestone.
>
> Do not modify architecture or add major dependencies without approval.

---

# 35. First Implementation Milestone

The first real implementation target is:

> **A minimal Android application that can discover another OFFGRID test device and exchange a test message without Internet connectivity.**

Then expand toward:

```text
3 devices
   ↓
Private test group
   ↓
Messaging
   ↓
Persistence
   ↓
Duplicate prevention
   ↓
Disconnect/reconnect
   ↓
Relay experiment
```

---

# 36. V0 Priority Order

Claude should prioritize:

```text
1. Toolchain
2. Project skeleton
3. Architecture skeleton
4. SQLite
5. Device identity
6. Wi-Fi P2P prototype
7. Peer discovery
8. Direct messaging
9. 3-device physical test
10. Duplicate prevention
11. Store-and-forward experiment
12. GPS
13. Offline maps
14. Private groups
15. Safety/SOS
16. Cloud sync
17. Security hardening
18. UI polish
19. Beta
```

Do not reorder this merely to build attractive screens earlier.

---

# 37. Definition of Success

OFFGRID succeeds technically when:

```text
Internet disappears
       ↓
OFFGRID remains useful
       ↓
Devices communicate through available paths
       ↓
Data remains locally persisted
       ↓
Failures are visible
       ↓
Connectivity returns
       ↓
Data synchronizes safely
```

The system must remain predictable when connectivity is unreliable.

---

# 38. Final Rule

When uncertain, prefer:

```text
Evidence over assumption
Simple over clever
Local over cloud dependency
Explicit state over fake success
Tested networking over claimed networking
Security over convenience
Documented decisions over silent changes
```

**OFFGRID must be built as a real offline communication system, not as a normal Internet app with an "offline mode."**
