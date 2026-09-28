# OFFGRID — Architecture & Product Decision Log

**Document:** `10-DECISIONS.md`  
**Version:** 0.1  
**Status:** Active Decision Register  
**Purpose:** Record important decisions so the product and implementation remain consistent.

---

## 1. How to Use This Document

This file is the decision history for OFFGRID.

Important architectural, security, product, and technical decisions should be recorded here.

A decision should include:

```text
Decision
Why
Alternatives considered
Consequences
Status
```

Do not silently reverse a major decision in code.

If a decision needs to change:

1. Identify the existing decision.
2. Explain why it no longer works.
3. Record the replacement decision.
4. Update affected documentation.
5. Then implement the change.

---

# 2. Decision Status

Use:

- `PROPOSED` — under discussion
- `ACCEPTED` — approved for implementation
- `EXPERIMENTAL` — being tested
- `REJECTED` — explicitly not selected
- `SUPERSEDED` — replaced by a newer decision
- `BLOCKED` — cannot proceed until another dependency is resolved

---

# 3. Core Product Decisions

## D-001 — Offline-First Architecture

**Status:** ACCEPTED

### Decision

OFFGRID is an offline-first application.

Core functionality must not depend on cloud availability.

### Reason

The primary use case is communication in places where Internet connectivity may be unavailable.

### Consequence

SQLite/local device state is fundamental.

Cloud synchronization is secondary.

---

## D-002 — Initial Target

**Status:** ACCEPTED

### Decision

The first product focus is:

> Hiking, trekking, camping, and outdoor adventure groups.

### Consequence

Safety, location, offline maps, and group communication receive priority over general social features.

---

## D-003 — Android First

**Status:** ACCEPTED

### Decision

Android is the first production platform.

### Reason

The initial networking proof requires deep experimentation with Android native networking capabilities.

### Consequence

iOS is implemented after the Android architecture has been validated.

---

# 4. Technology Decisions

## D-004 — Application Framework

**Status:** ACCEPTED

### Decision

Use:

```text
React Native
+
TypeScript
```

### Reason

Provides a shared application layer while allowing native networking implementations.

---

## D-005 — Native Networking Layer

**Status:** ACCEPTED

### Decision

Platform-specific communication will be isolated behind a native transport abstraction.

Android-specific networking may be implemented in Kotlin.

### Consequence

The React Native application must not directly depend on one specific networking technology.

---

## D-006 — Local Database

**Status:** ACCEPTED

### Decision

Use SQLite for local persistence.

### Reason

OFFGRID must continue operating without Internet.

---

## D-007 — State Management

**Status:** ACCEPTED

### Decision

Use a lightweight state-management solution such as Zustand.

### Constraint

UI state management must not become the source of truth for persistent data.

SQLite/repositories remain authoritative for persisted application data.

---

## D-008 — Backend

**Status:** ACCEPTED

### Decision

Use Supabase/PostgreSQL for online synchronization and cloud services.

### Constraint

Supabase must not become a dependency for core offline communication.

---

## D-009 — Maps

**Status:** ACCEPTED

### Decision

Use a MapLibre-based approach with an offline-capable map data strategy.

### Constraint

The final map tile/data provider must be selected according to licensing, storage, offline-download, and production requirements.

---

# 5. Networking Decisions

## D-010 — Primary V0 Transport Investigation

**Status:** EXPERIMENTAL

### Decision

Investigate Android Wi-Fi P2P / Wi-Fi Direct as the primary V0 transport candidate.

### Reason

The first technical objective is local device-to-device communication without Internet access.

### Critical constraint

Wi-Fi Direct is not automatically equivalent to a multi-hop mesh.

### Required action

Physical testing must determine:

- Discovery behavior
- Connection behavior
- Simultaneous peers
- Topology limitations
- Relay feasibility
- Battery behavior

---

## D-011 — BLE Role

**Status:** ACCEPTED

### Decision

BLE may be used for discovery, signaling, or supporting communication functions.

BLE is not assumed to be the primary high-throughput messaging transport.

---

## D-012 — True Mesh

**Status:** EXPERIMENTAL

### Decision

OFFGRID will use the term "mesh" only for functionality that has been demonstrated through actual multi-hop communication.

### Rule

Do not market or document multi-hop as guaranteed before physical validation.

---

## D-013 — Transport Abstraction

**Status:** ACCEPTED

### Decision

Networking is represented through an abstraction such as:

```text
Transport
CommunicationManager
```

Possible future transports:

```text
Wi-Fi P2P
BLE
Wi-Fi Aware
Internet
Meshtastic / LoRa
```

The messaging layer should not need to know which physical transport is being used.

---

# 6. Messaging Decisions

## D-014 — Unique Message IDs

**Status:** ACCEPTED

Every message must have a globally unique application-level identifier.

### Reason

Required for:

- Duplicate prevention
- Relay
- Retry
- Synchronization
- Idempotency

---

## D-015 — Store-and-Forward

**Status:** ACCEPTED

The architecture must support storing messages locally and forwarding them when a communication path becomes available.

### Constraint

The exact routing algorithm will be implemented incrementally.

---

## D-016 — TTL / Hop Limit

**Status:** ACCEPTED

Relayed messages must have a bounded lifetime/hop limit.

### Reason

Prevent uncontrolled propagation and routing loops.

---

## D-017 — Delivery vs Sync

**Status:** ACCEPTED

These are separate concepts.

```text
Local delivery
      ≠
Cloud synchronization
```

A message can be delivered locally while still waiting for cloud synchronization.

---

# 7. Group Decisions

## D-018 — Private Groups

**Status:** ACCEPTED

Groups are private by default.

A nearby device should not automatically gain access to private group messages merely because it can discover another OFFGRID device.

---

## D-019 — QR Invitations

**Status:** ACCEPTED

QR codes may be used for convenient group invitations.

### Constraint

The QR mechanism must not expose unnecessary sensitive information.

---

## D-020 — Public Nearby Discovery

**Status:** DEFERRED

A public mode where strangers can discover each other is not part of the initial product.

### Reason

Privacy and safety are more important for the initial outdoor group use case.

---

# 8. Security Decisions

## D-021 — No Custom Cryptography

**Status:** ACCEPTED

Do not invent cryptographic algorithms.

Use established, audited cryptographic primitives and platform-supported secure storage where appropriate.

---

## D-022 — Security Before Public Beta

**Status:** ACCEPTED

Security hardening is a release requirement, not a future enhancement.

---

## D-023 — Location Privacy

**Status:** ACCEPTED

Location sharing must be explicitly controlled.

The app must distinguish:

```text
Location sharing enabled
Location sharing disabled
Current location
Last-known location
Unknown
```

---

## D-024 — SOS Honesty

**Status:** ACCEPTED

OFFGRID must never imply that an SOS was delivered when no communication path confirmed delivery.

Possible states:

```text
Created
Sending
Sent
Delivered
Acknowledged
No connection
Failed
```

---

# 9. Data Decisions

## D-025 — Local Source of Truth

**Status:** ACCEPTED

During offline operation, local device storage is authoritative for locally created data.

Cloud state is reconciled when connectivity returns.

---

## D-026 — Idempotent Synchronization

**Status:** ACCEPTED

Sync operations must be safe to retry.

Repeated synchronization must not create duplicate logical records.

---

## D-027 — Conflict Handling

**Status:** PROPOSED

Conflict behavior must be defined per entity.

Examples:

- Messages
- Group membership
- Locations
- Safety events
- Profile data

Do not implement generic "last write wins" everywhere without evaluating the entity semantics.

---

# 10. UX Decisions

## D-028 — Hide Networking Complexity

**Status:** ACCEPTED

Users should not need to understand:

- Wi-Fi P2P
- BLE
- Routing
- TTL
- Hop counts
- Transport selection

The application should communicate useful states such as:

```text
Connected
Nearby
Offline
Trying to connect
Last seen 2 min ago
No communication path
```

---

## D-029 — Offline State Must Be Visible

**Status:** ACCEPTED

The UI should clearly indicate when the application is offline.

It should not look like a normal Internet application while silently failing.

---

## D-030 — Safety Actions Must Be Clear

**Status:** ACCEPTED

Safety-critical interactions should minimize ambiguity.

SOS should require deliberate activation to reduce accidental triggers.

---

# 11. Development Decisions

## D-031 — Physical Networking Tests Are Mandatory

**Status:** ACCEPTED

No networking milestone is considered complete based only on:

- Unit tests
- Simulator
- Emulator
- Mock transport
- Static analysis

Physical devices are required.

---

## D-032 — Do Not Build Future Features Early

**Status:** ACCEPTED

Claude Code must not implement future roadmap features unless explicitly requested.

Example:

If V0 requires Wi-Fi P2P testing, Claude should not simultaneously build:

- LoRa
- AI assistant
- Event marketplace
- Social feed

---

## D-033 — Documentation Before Major Architecture Changes

**Status:** ACCEPTED

A major architecture change must be documented before or alongside implementation.

Affected documents must be updated.

---

## D-034 — No Fake Networking

**Status:** ACCEPTED

Mocks may be used for UI development and automated tests.

Mocks must never be presented as evidence that real offline communication works.

---

# 12. V0 Decisions

## D-035 — V0 Objective

**Status:** ACCEPTED

The first meaningful technical milestone is:

> Three physical Android devices communicating locally without Internet.

Minimum capability:

```text
Discovery
+
Connection
+
Message exchange
+
Local persistence
+
Duplicate prevention
```

---

## D-036 — Multi-Hop Is a Separate Proof

**Status:** ACCEPTED

Three-device testing must explicitly determine whether the selected transport supports the required topology.

Do not assume:

```text
A ↔ B
B ↔ C
```

means:

```text
A ↔ C through B
```

---

# 13. Decisions Still Required

These require explicit product/technical decisions before the relevant implementation stage.

## P-001 — Initial Group Size

Options to evaluate:

```text
5–20
20–50
50+
```

Need to consider:

- Discovery overhead
- Message fan-out
- Battery
- Routing
- UI
- Safety use case

---

## P-002 — Account Requirement

Current direction:

```text
Offline use
→ no mandatory cloud account

Cloud features
→ account may be required
```

Final authentication/recovery flow remains to be decided.

---

## P-003 — Voice Messages

Status:

```text
DEFERRED
```

Initial messaging should focus on text.

---

## P-004 — Public Nearby Mode

Status:

```text
DEFERRED
```

Private group communication is the initial priority.

---

## P-005 — Final Map Provider

Status:

```text
OPEN
```

Must evaluate:

- Licensing
- Offline storage
- Download mechanism
- Coverage
- Cost
- Usage limits

D-073 has since locked the *shape* of the tile-provider abstraction (single `MapProviderConfig`, `downloadPolicy` default `disabled`, OSM public tile server blocked for downloads). The final vendor choice remains open — see D-073's "OSM-derived vector, offline-capable" direction.

---

## P-006 — Final V0 Transport

Status:

```text
EXPERIMENTAL
```

Wi-Fi P2P is the current investigation candidate.

Physical testing determines the final decision.

---

## P-007 — Encryption Protocol

Status:

```text
OPEN
```

Must be selected before production messaging/security implementation.

Do not invent a custom protocol.

---

## P-008 — Group Key Rotation

Status:

```text
OPEN
```

Required behavior after:

- Member removal
- Invitation compromise
- Device loss
- Key compromise

---

## P-009 — Conflict Resolution

Status:

```text
OPEN
```

Must be defined before complex cloud synchronization.

---

# 14. Decision Change Process

When changing a decision:

```text
Old Decision
     ↓
Problem discovered
     ↓
Evidence
     ↓
Alternatives
     ↓
New Decision
     ↓
Documentation update
     ↓
Implementation
     ↓
Testing
```

Evidence may include:

- Physical test results
- Performance measurements
- Security review
- API limitations
- Platform restrictions
- User testing
- Product requirements

---

# 15. Decision Quality Rule

A decision should be based on evidence whenever possible.

Especially for networking:

```text
Documentation
      +
Prototype
      +
Physical test
      +
Measurement
```

is stronger than assumptions.

---

# 16. Current Architecture Summary

At the current stage:

```text
React Native + TypeScript
        │
        ├── UI
        ├── State
        ├── Services
        ├── Repositories
        └── Local SQLite
                 │
                 ↓
        Communication Manager
                 │
        ┌────────┼─────────┐
        ↓        ↓         ↓
     Wi-Fi P2P  BLE     Future LoRa
        │
        ↓
   Local Devices

When Internet exists:

Local Data
    ↓
Sync Queue
    ↓
Supabase
    ↓
PostgreSQL
```

This architecture is intentionally designed so that future transport experiments do not require rewriting the application layer.

---

# 17. Current Highest-Priority Unknown

The most important unresolved technical question is:

> **What local Android communication topology can OFFGRID reliably use for discovery, direct communication, and eventually application-level relay without Internet?**

This must be answered through prototype + physical testing.

---

# 18. Rule for Claude Code

If implementation conflicts with this decision log:

> **Stop and surface the conflict before making a major architectural change.**

Do not silently choose a different architecture.

---

# 19. Documentation Consistency Resolutions (2026-09-20)

Resolutions to the ten contradictions (C-1 through C-10) identified in the documentation review of 2026-09-20. These decisions supersede or clarify prior entries where noted. No architectural changes are made beyond what is written below.

---

## D-037 — BLE Role Confirmed (resolves C-1)

**Status:** ACCEPTED

### Decision

BLE is an accepted **supporting / signaling** transport for V0 (peer discovery, device identification, potential bootstrap of another transport). BLE is **NOT** the primary V0 messaging transport.

The exact BLE implementation (advertisement format, GATT design, discovery cadence) remains subject to physical experimental validation.

### Consequence

Reconciles `03-NETWORKING.md §5` ("investigate") with D-011 ("ACCEPTED"): BLE's *role* is accepted; its *implementation details* are experimental.

BLE must not be used for high-volume or high-throughput message payloads.

---

## D-038 — Map Rendering vs. Tile Provider (resolves C-2)

**Status:** ACCEPTED (renderer) + OPEN (tile/data provider)

### Decision

- Map rendering technology: **MapLibre** (confirms D-009).
- Actual tile / data provider: **OPEN** until licensing, offline-download capability, coverage, and cost are evaluated (confirms P-005).

### Consequence

Renderer choice is fixed. Tile-source selection is a separate, later decision that must not be made silently during implementation.

---

## D-039 — Cloud Message Confidentiality Direction (resolves C-3)

**Status:** ACCEPTED (direction) + OPEN (protocol)

### Decision

OFFGRID's production direction is that the cloud must **not** have plaintext access to private group message content.

The specific end-to-end encryption protocol remains **OPEN** (P-007) and will be selected during the security design phase. No custom cryptography (reaffirms D-021).

### Consequence

`07-API-SPEC.md §12` is aligned with `05-SECURITY.md §10`: any server-stored message payloads must be encrypted in the production design.

Until the E2E protocol is selected, private message content must not be uploaded to the cloud in plaintext, except in explicitly labelled prototype or automated-test contexts.

### Blocked on

P-007 (encryption protocol selection).

---

## D-040 — Public Nearby Discovery Deferred; No V1 Nav Destination (resolves C-4)

**Status:** DEFERRED

### Decision

Public / open "Nearby" discovery remains DEFERRED (reaffirms D-020 and P-004).

"Nearby" is **removed** as a primary V1 navigation destination.

Private device discovery remains an internal capability of the CommunicationManager — it is not a user-facing tab in V1.

### Consequence

`06-UX-FLOWS.md §3` navigation model requires a follow-up documentation pass to reflect this. Any private-connection diagnostics can live under Settings → Connection Diagnostics (`06-UX-FLOWS.md §27`).

---

## D-041 — Safety Actions Are Distinct (resolves C-5)

**Status:** ACCEPTED

### Decision

"I'm Safe" and "SOS" are **separate user-facing actions** within the Group / Safety experience.

No unified generic "Emergency" screen will be created unless justified by concrete implementation need.

### Consequence

The "EmergencyScreen" placeholder in `02-ARCHITECTURE.md §6.1` is superseded in intent by the distinct safety surfaces described in `06-UX-FLOWS.md §§20–22`. Screen names in implementation should reflect this distinction.

---

## D-042 — Naming Convention Boundary (resolves C-6)

**Status:** ACCEPTED

### Decision

- **SQLite / database storage fields:** `snake_case`.
- **TypeScript / application objects and JSON / network payloads:** `camelCase`.
- **Repositories / services** perform the conversion at the boundary between persistence and application layers.

### Consequence

`04-DATABASE.md` (snake_case) and `03-NETWORKING.md` / `07-API-SPEC.md` (camelCase) are each valid within their own layer. Field-name conversion is a repository-layer responsibility.

---

## D-043 — Directory Naming: `services/communication` (resolves C-7)

**Status:** ACCEPTED

### Decision

The directory previously shown as `services/mesh/` in `02-ARCHITECTURE.md §16` is renamed to **`services/communication/`**.

### Reason

Mesh functionality is EXPERIMENTAL (D-012). The folder structure must not presume a capability that has not been physically demonstrated.

### Consequence

Actual folder creation happens in Phase 1 bootstrap.

---

## D-044 — SQLite Belongs in Phase 2 (resolves C-8)

**Status:** ACCEPTED

### Decision

SQLite local persistence is implemented in **Phase 2** (Application Foundation), before **Phase 3** (V0 networking prototype).

### Reason

Local persistence is a stated V0 acceptance criterion (D-035, `03-NETWORKING.md §27`). It cannot be built inside the V0 networking phase; it must exist first so V0 tests can verify persistence.

### Consequence

Phase 2 exit criteria explicitly include a working local SQLite database and repository layer, in addition to the criteria already listed in `08-ROADMAP.md §5`.

---

## D-045 — Offline Core Does Not Require a Cloud Account (resolves C-9)

**Status:** ACCEPTED

### Decision

- Offline core usage MUST NOT require a Supabase account.
- Local group creation, local messaging, and local device identity must function without any cloud authentication.
- Cloud synchronization features may require authentication.

### Consequence

`07-API-SPEC.md §5` applies only to cloud-synchronization endpoints, not to core offline features.

`01-PRD.md §14 Q5` and P-002 remain partially open only with respect to *account recovery* and *multi-device* flows. The offline default — **no account required** — is now fixed.

---

## D-046 — Explicit Phase Order (resolves C-10)

**Status:** ACCEPTED

### Decision

- **Phase 1** = Project / toolchain bootstrap.
- **Phase 2** = Application foundation + SQLite + repositories.
- **Phase 3** = V0 physical networking prototype (three-device Android test).

### Consequence

`08-ROADMAP.md §§4–6` and `CLAUDE.md §36` V0 priority order are aligned. SQLite is a Phase 2 deliverable per D-044. Networking implementation begins only after Phase 2 exit criteria are met.

---

# 20. Toolchain & Bootstrap Decisions (2026-09-20)

Approved decisions for the Phase 1 project bootstrap. These fix the toolchain floor. Any change to these versions later must be recorded as a new decision that supersedes the entry below.

---

## D-047 — React Native Distribution: Bare CLI

**Status:** ACCEPTED

### Decision

Use the **bare React Native CLI** for the OFFGRID application. Do not use Expo.

### Reason

OFFGRID requires direct native Android / Kotlin integration for Wi-Fi P2P, BLE, and future background transport work. Bare RN gives unrestricted access to the native module surface, foreground services, and platform manifest without going through Expo's config plugins or dev-client abstraction.

### Consequence

- The `android/` directory is a first-class part of the repository and is edited directly.
- Native Kotlin modules for the CommunicationManager transport implementations live under `android/app/src/main/java/...`.
- No Expo runtime, no Expo config plugins, no `app.json` / `app.config.ts` Expo semantics.

---

## D-048 — React Native Version: 0.87.x

**Status:** ACCEPTED

### Decision

Use React Native **0.87.x**, the current stable release, for Phase 1 bootstrap.

### Consequence

- The template used for `npx @react-native-community/cli init` (or equivalent) must pin to a 0.87.x release.
- Upgrades within 0.87.x patch releases are permitted; major/minor upgrades require a new decision.
- The New Architecture (TurboModules / Fabric) posture that ships as default in 0.87.x is accepted as the baseline.

---

## D-049 — Node.js Runtime: 22.11+

**Status:** ACCEPTED

### Decision

Use **Node.js 22.11 or newer** (current LTS line) for local development and CI.

### Consequence

- The repository will declare the required Node version in `package.json` `engines` and in an `.nvmrc` file at bootstrap time.
- Toolchain scripts assume Node 22 semantics (native `fetch`, modern ESM behavior, etc.).

---

## D-050 — Java Development Kit: JDK 17

**Status:** ACCEPTED

### Decision

Use **JDK 17** for the Android build toolchain (Gradle, Kotlin compilation, Android Gradle Plugin).

### Consequence

- Android Gradle Plugin and Kotlin versions selected by the RN 0.87.x template are used as-is where compatible with JDK 17.
- Developers must have JDK 17 available on `JAVA_HOME`; documentation will note this in the Phase 1 `README.md`.

---

## D-051 — Package Manager: pnpm

**Status:** ACCEPTED

### Decision

Use **pnpm** as the JavaScript package manager for OFFGRID.

### Consequence

- The exact pnpm version used during Phase 1 bootstrap will be pinned via `package.json` `packageManager` field and documented in `README.md`.
- A `pnpm-lock.yaml` file is committed to the repository.
- No mixed use of `npm`, `yarn`, or `bun` for OFFGRID application dependencies.
- Native `android/` Gradle dependencies are unaffected.

---

## D-052 — Android SDK Platform: 35

**Status:** SUPERSEDED by D-054 (2026-09-20)

### Decision

Use **Android SDK Platform 35** as the current development target, following the current React Native Android setup requirements.

### Consequence

- `compileSdkVersion` and `targetSdkVersion` are set to 35 in the Android Gradle configuration produced by the RN 0.87.x template.
- Permission model considerations for API 33+ (`NEARBY_WIFI_DEVICES`, granular Bluetooth permissions, `POST_NOTIFICATIONS`) apply.
- Minimum SDK version follows the RN 0.87.x template default unless a subsequent decision changes it.

---

## D-053 — Phase 1 Test Hardware Requirement

**Status:** ACCEPTED

### Decision

Phase 1 bootstrap is **not** blocked on having three specific Android devices. An Android emulator **or** a single physical Android phone is sufficient for Phase 1 verification (app builds, app launches, smoke test passes).

The three-device compatibility floor (specific models + OS versions) will be finalized **before** Phase 3 physical networking tests begin.

### Reason

Phase 1's exit criteria (build + launch + tooling) do not exercise local networking. Requiring three devices for Phase 1 would delay foundational work without adding evidence.

### Consequence

- Phase 3 planning must explicitly include a decision recording the chosen three devices (models, OS versions, chipsets) before any V0 networking claim can be validated.
- Physical-device testing rules in `09-TESTING.md §6` and D-031 remain in force for Phase 3 and later.

---

## D-054 — Android SDK Platform: 37 (supersedes D-052)

**Status:** ACCEPTED (2026-09-20)

### Decision

Amend D-052. The React Native 0.87.1 template pins `compileSdkVersion = 37`, `targetSdkVersion = 36`, `buildToolsVersion = "37.0.0"` in `android/build.gradle`. During the Phase 1 bootstrap build, Gradle auto-installed `platforms;android-37.0` (v2.0.0) and `build-tools;37.0.0` under `$ANDROID_HOME`, then produced a successful debug APK that launched on the Pixel 6 API 35 emulator.

Effective Phase 1 baseline:
- `compileSdkVersion = 37`
- `targetSdkVersion = 36`
- `minSdkVersion = 24`
- `buildToolsVersion = 37.0.0`
- Also on disk: platforms 35 + 36.1 (unused by build), build-tools 35.0.0 + 36.0.0 + 36.1.0

### Reason

D-052 assumed the RN 0.87.x template would still target Platform 35. It does not. Silently downshifting `compileSdkVersion` to keep D-052 verbatim would violate CLAUDE.md §17/§24 (no silent architecture drift, no forced downgrades to hide reality) and risks build breakage from AGP/Kotlin compatibility matrices that assume Platform 37.

### Consequence

- The **emulator target** (Android 15 / API 35) is unchanged — this is only about the SDK the app *compiles against*, not the OS it runs on.
- Runtime permission model gains API 36 considerations layered on top of the API 33+ ones already noted in D-052 (`NEARBY_WIFI_DEVICES`, granular BT, `POST_NOTIFICATIONS`).
- Phase 3 physical-device floor (D-053) is unaffected — devices still need to run API ≥ 24.
- D-052's "Platform 35" line is now historical; the platform version follows the RN template baseline going forward.

---

## D-055 — Exact toolchain versions recorded at Phase 1 bootstrap

**Status:** ACCEPTED

### Decision

Record, for reproducibility, the exact tool versions that produced the first successful OFFGRID debug build (`com.offgrid.app`) on the Pixel 6 API 35 emulator on 2026-09-20.

| Layer | Tool | Version |
|---|---|---|
| Host runtime | Node.js | 24.15.0 (satisfies D-049 `≥ 22.11`) |
| Package manager | pnpm (via Corepack) | 9.15.9 (pinned in `packageManager`) |
| Android toolchain | JDK (Temurin) | 17.0.20.1+1 |
| Android toolchain | Gradle wrapper | 9.4.1 |
| Android toolchain | Kotlin (per Gradle) | 2.3.0 |
| Android toolchain | Android SDK Platform | 37.0 (see D-054) |
| Android toolchain | Android Build-Tools | 37.0.0 |
| Android toolchain | Android NDK | 27.1.12297006 |
| Android toolchain | CMake | 3.22.1 |
| Android toolchain | cmdline-tools | 23.0.0 (channel `latest`) |
| Android toolchain | Emulator | Pixel 6, API 35, arm64-v8a, Google APIs |
| RN framework | react-native | 0.87.1 |
| RN framework | react | 19.2.3 |
| RN framework | @react-native-community/cli | 20.2.0 |
| RN framework | @react-native/new-app-screen | 0.87.1 |
| Navigation | @react-navigation/native | 7.4.1 |
| Navigation | @react-navigation/native-stack | 7.19.2 |
| Navigation | react-native-screens | 4.28.0 |
| Navigation | react-native-safe-area-context | 5.10.0 |
| Types & lint | typescript | 6.0.3 |
| Types & lint | @types/react | 19.3.0 |
| Types & lint | @react-native/typescript-config | 0.87.1 |
| Types & lint | eslint | 8.57.1 |
| Types & lint | @react-native/eslint-config | 0.87.1 |
| Format | prettier | 2.8.8 |
| Test | jest | 29.7.0 |
| Test | @react-native/jest-preset | 0.87.1 |
| Test | react-test-renderer | 19.2.3 |
| Test | @types/jest | 29.5.14 |
| Test | @types/react-test-renderer | 19.3.0 |
| Babel | @babel/core | 7.29.7 |
| Babel | @babel/preset-env | 7.29.7 |
| Babel | @babel/runtime | 7.29.7 |
| Babel | @react-native/babel-preset | 0.87.1 |
| Metro | @react-native/metro-config | 0.87.1 |

### Reason

Locks a known-good baseline for future upgrades and lets contributors reproduce the Phase 1 environment exactly.

### Consequence

- `pnpm-lock.yaml` is the authoritative resolver for JS packages; this table is the human-readable summary.
- Future upgrades that change a row here should reference D-055 and record what changed.
- Deviations discovered between this table and installed reality on any contributor's machine should be reconciled before shipping Phase 2 work.

---

## D-056 — Android application identifier: `com.offgrid.app`

**Status:** ACCEPTED

### Decision

Use `com.offgrid.app` as the Android application ID (`applicationId`), Java/Kotlin package root, and iOS bundle identifier root produced during Phase 1 bootstrap by `@react-native-community/cli init`.

### Consequence

- Play Store publication (post-beta) is bound to this identifier — changing it later requires a new listing.
- Deep-link schemes, notification channels, keystore aliases, and Supabase auth redirect URIs should be namespaced under this ID from Phase 5+ onward.
- Instrumentation tests, R8/ProGuard rules, and `AndroidManifest.xml` permission strings all resolve against this package.

---

## D-057 — Navigation library: React Navigation v7 (native-stack)

**Status:** ACCEPTED

### Decision

Use **React Navigation v7** with `@react-navigation/native` + `@react-navigation/native-stack` as the navigation stack for OFFGRID, backed by `react-native-screens` and `react-native-safe-area-context`.

### Reason

- `native-stack` uses `UINavigationController` / `Fragment`-backed transitions rather than a JS-driven stack, giving lower latency on low-end Android devices that OFFGRID must support in the field.
- React Navigation v7 is the current supported major line for RN 0.87.x; v6 is on maintenance-only.
- Well-understood, community-standard, no bespoke primitives.

### Consequence

- All new screens register on the `RootStackParamList` in `src/navigation/RootStack.tsx`.
- Deep-linking (Phase 5+) will use React Navigation's `linking` config — no manual URL routing.
- Modal / bottom-sheet flows in later phases layer on top of native-stack rather than replacing it.

---

## D-058 — Metro `node-linker=hoisted` under pnpm

**Status:** ACCEPTED

### Decision

The repository ships with `.npmrc` containing `node-linker=hoisted`, `strict-peer-dependencies=false`, and `auto-install-peers=true` so that pnpm produces a flat `node_modules` layout compatible with Metro's default module resolver.

### Reason

Metro (RN 0.87.1) does not correctly follow pnpm's default symlinked `node_modules/.pnpm` layout for autolinked native modules; several community-maintained RN modules resolve their peer imports assuming hoisted layout. Hoisted linking sidesteps this without patching Metro or the affected libraries.

### Consequence

- Disk footprint is larger than pnpm's default and duplicate-installation detection is weaker — an acceptable tradeoff at Phase 1 scale.
- If a future Metro release adds first-class pnpm support, this decision should be revisited and, if possible, reverted to the default `isolated` linker.

---

## D-059 — SQLite driver: `@op-engineering/op-sqlite`

**Status:** ACCEPTED (2026-09-20)

### Decision

Use **`@op-engineering/op-sqlite`** as the React Native SQLite driver. This resolves open item #1 in `docs/04-DATABASE.md §37` ("Exact SQLite library"). D-006 remains the parent decision that SQLite is the local persistence engine.

### Reason

- **New Architecture compatibility:** op-sqlite is a JSI/TurboModule library; RN 0.87.1 ships with the New Architecture on by default. Bridge-based drivers (e.g. `react-native-sqlite-storage`) will not survive a Fabric build cleanly.
- **Synchronous JSI reads:** boot-time device-identity lookup can complete synchronously before the first React render, avoiding a `dbReady` false state at app cold start.
- **SQLCipher upgrade path:** an opt-in build flag adds SQLCipher without changing the query layer — required to satisfy D-061 in Phase 10.
- **Active maintenance:** >2M weekly downloads, current release track keeps pace with RN patch releases.
- **Bare RN CLI compatible:** does not require `expo-modules-core` (D-047 chose the bare CLI template).

### Consequence

- A thin `OffgridDb` interface wraps op-sqlite so that the same repositories can run on a Node SQLite driver during unit tests (Jest cannot execute JSI).
- Node-side tests use `better-sqlite3` (dev dependency only, not shipped to devices) via the same interface.
- Any future driver swap requires updating the adapters, not the repositories.
- Phase 10 must revisit this decision to enable SQLCipher and to define the key-derivation/keystore integration (open items S-2/S-3/S-4 in `05-SECURITY.md §36`).

---

## D-060 — Application-level ID format: UUIDv7 (RFC 9562)

**Status:** ACCEPTED (2026-09-20)

### Decision

Use **UUIDv7 (RFC 9562)** as the canonical application-level identifier for every entity that requires a stable unique ID (users, devices, groups, messages, locations, safety check-ins, SOS events, peers, sync-queue entries, map-download records).

**Storage rule (amended from original proposal):**

- The **canonical persisted ID stored in the SQLite database is the raw UUIDv7 value only**, stored as `TEXT PRIMARY KEY`.
- **Typed prefixes** such as `dev_`, `usr_`, `grp_`, `msg_`, `loc_`, `chk_`, `sos_`, `peer_`, `sq_`, `map_` are **never stored inside the database ID column**.
- Typed prefixes exist only at the **domain / display / logging / helper layer** for human readability — for example `dev_<uuidv7>`, `msg_<uuidv7>` — and are constructed on demand by prefix helpers in `src/utils/ids/`.

### Reason

- UUIDv7 is time-ordered (48-bit millisecond timestamp + 74 random bits), giving natural insertion order for time-series tables (`messages`, `locations`, `sync_queue`) — tighter B-tree locality, fewer page splits, better tail latency.
- Storing the raw UUID (no prefix) keeps future Supabase / PostgreSQL columns straightforward: they can be declared as native `uuid` type without a string-parsing step at the sync boundary.
- Typed prefixes remain valuable for logs, debug UIs, and error messages (matches the illustrative style of `docs/04-DATABASE.md §12`) — but they belong to presentation, not storage.
- RFC 9562 is a published IETF standard — using it does not violate D-021 / CLAUDE.md §12 (no custom cryptography or bespoke identifier schemes).
- Uniqueness satisfies D-014.

### Consequence

- All schema `id` columns are `TEXT NOT NULL PRIMARY KEY` and contain only raw UUIDv7 strings (36 chars, lowercase hex with dashes).
- Repositories convert between the raw UUID (storage) and the prefixed form (`withPrefix('msg', uuid)`) only when a domain type explicitly declares a prefixed brand.
- Sync-time payloads to Supabase send the raw UUID string — the server can rely on `uuid` column semantics.
- Any Phase 4+ message-relay code must forward the original UUID unchanged (D-014, DB §12).

---

## D-061 — Local database encryption: plain SQLite in Phase 2, SQLCipher deferred to Phase 10

**Status:** ACCEPTED (2026-09-20)

### Decision

Phase 2 ships plain (unencrypted) SQLite. At-rest database encryption via SQLCipher (or equivalent) is deferred to **Phase 10 — Security Hardening** (`docs/08-ROADMAP.md §13`). This resolves the Phase 2 posture for `docs/04-DATABASE.md §37 #4` and `docs/05-SECURITY.md §36 #6`.

### Reason

- Phase 2 tables (`users`, `devices`, `groups`, `group_members`, `messages`, `locations`, `safety_checkins`, `sos_events`, `peers`, `sync_queue`, `map_downloads`, `settings`) are being created but Phase 2 stores no sensitive payloads yet — no messages are sent, no locations are captured, no SOS is transmitted, no cryptographic keys exist.
- Enabling SQLCipher at Phase 2 would force premature resolution of open security items S-2 (device key storage), S-3 (group key model), and S-4 (key rotation) in `05-SECURITY.md §36` — Phase 10 concerns per the roadmap.
- The chosen driver (D-059) supports a drop-in SQLCipher build flag, so query-layer code written now will not need to change to enable encryption later.
- Ad-hoc column-level encryption in Phase 2 is explicitly forbidden by CLAUDE.md §12 / D-021.

### Consequence

- Phase 10 must add SQLCipher via op-sqlite's `sqlcipher` build flag, decide the key-derivation method (recommended candidate: Android Keystore-backed random key → PBKDF2/HKDF), and wire it in **before** the Android beta (`docs/08-ROADMAP.md §15`).
- Until Phase 10 lands, the codebase must not persist any material the security spec would classify as sensitive (message plaintext, private keys, session tokens, precise location traces) — enforced by the fact that no such features exist yet in Phase 2.
- `05-SECURITY.md §36 #6` is superseded by this decision for the Phase 2–9 window only; Phase 10 will reopen and finalize it.

---

## D-062 — Phase 3 V0 transport is Android Wi-Fi Direct (`WifiP2pManager`)

**Status:** ACCEPTED (2026-09-20)

### Decision

The sole V0 physical transport implemented in Phase 3 is **Android Wi-Fi Direct** via `android.net.wifi.p2p.WifiP2pManager`. BLE remains a supporting-only role (D-011, D-037) and is not implemented in Phase 3. Wi-Fi Aware (NAN) and LoRa remain deferred.

### Reason

- Wi-Fi Direct has the widest hardware coverage of the pre-BLE-mesh options. `PackageManager.FEATURE_WIFI_AWARE` is unavailable on a significant portion of mid-range Android hardware, so NAN cannot be the primary V0 path.
- `03-NETWORKING.md` §2 and §5 already position Wi-Fi Direct as the initial V0 transport.
- Focused scope keeps Phase 3 provable: one transport, one code path, one physical test. This matches the user's Phase 3 spec ("first prove PHONE A ↔ PHONE B only").

### Consequence

- Phase 3 code declares a single `Transport` implementation (`WifiP2pTransport`). The `CommunicationManager` still consumes a `Transport` interface so BLE/LoRa can be added later without changing UI code (D-013).
- If physical testing shows Wi-Fi Direct fails to negotiate on the target OEM pair, that is a STOP condition — not a signal to silently switch transport.

---

## D-063 — Native integration surface: classic `ReactContextBaseJavaModule` in Phase 3; Codegen'd TurboModule deferred to Phase 4

**Status:** AMENDED (2026-09-20)

### Decision

The Kotlin native module that exposes Wi-Fi Direct to JavaScript is a **classic bridged `ReactContextBaseJavaModule`** that emits events via `RCTDeviceEventEmitter`. Under RN 0.87.1's New Architecture (D-048), the interop layer runs classic modules unchanged.

Kotlin implementation: `android/app/src/main/java/com/offgrid/p2p/`. TypeScript surface: `src/services/communication/transports/nativeSurface.ts` loads via `NativeModules.OffgridP2p` and subscribes via `DeviceEventEmitter`.

The forward-looking TurboModule spec is kept at `specs/NativeOffgridP2p.ts` as documentation only (no `codegenConfig` entry in `package.json`). Phase 4 will migrate to Codegen using this spec as the starting point.

### Reason

- RN 0.87.1 (D-048) has the New Architecture ON by default, but its interop layer runs classic bridged modules faithfully — the TurboModule contract is not a hard requirement for a V0 diagnostic transport.
- `TurboModuleRegistry.getEnforcing<Spec>('OffgridP2p')` throws at module-load if Codegen has not registered the module correctly. That is fragile for Jest and error-prone when the New Architecture Codegen toolchain has not been exercised for this project before. The failure mode makes the whole app un-bootable rather than degrading the transport.
- The classic-module path is understood, uniformly documented, and has zero build-graph risk. It lets Phase 3 focus on the Wi-Fi Direct behavior itself rather than on Codegen bring-up.
- The original D-063 already contained an explicit consequence clause allowing this fallback: *"If the generated `NativeOffgridP2pSpec.kt` base class does not produce the expected `emitOnFoo(...)` shape for `EventEmitter<T>`, Phase 3 falls back to `RCTDeviceEventEmitter` via the interop layer and this decision is amended in-place — the change is documented, not silent."*

### Consequence

- No `codegenConfig` entry in `package.json`; no Codegen Gradle step for this module in Phase 3.
- Event names are stable string constants (`OffgridP2p:peersChanged`, `OffgridP2p:connectionStateChanged`, `OffgridP2p:payloadReceived`) declared in `specs/NativeOffgridP2p.ts` and imported by both sides through TypeScript.
- Phase 4 migration path: fill in `codegenConfig`, promote `IntendedSpec` in `specs/NativeOffgridP2p.ts` to a proper `TurboModule` interface, replace `ReactContextBaseJavaModule` with the generated `NativeOffgridP2pSpec` base class.
- No new npm dependency; no new Kotlin dependency.

---

## D-064 — Phase 3 Android permissions

**Status:** ACCEPTED (2026-09-20) — location entries superseded by D-071 (2026-09-21)

### Decision

`android/app/src/main/AndroidManifest.xml` declares exactly these permissions for Phase 3:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission
    android:name="android.permission.NEARBY_WIFI_DEVICES"
    android:usesPermissionFlags="neverForLocation"
    tools:targetApi="tiramisu" />
<uses-permission
    android:name="android.permission.ACCESS_FINE_LOCATION"
    android:maxSdkVersion="32" />
```

- `INTERNET`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`: install-time. `INTERNET` is required because the socket API is still Java sockets even though there is no actual Internet path.
- `NEARBY_WIFI_DEVICES` (runtime/dangerous) with `neverForLocation`: required from API 33+. `neverForLocation` avoids the location-permission prompt.
- `ACCESS_FINE_LOCATION` with `maxSdkVersion="32"` (runtime/dangerous): fallback for API ≤32 only. Discovery on those OS versions additionally requires system Location Mode to be ON.

No `CHANGE_NETWORK_STATE`. No foreground service is declared in Phase 3 — discovery only runs while the diagnostics screen is foregrounded (Security §21: nearby discovery does not equal authorization; do not run silent background scans).

> **Supersession note (D-071, 2026-09-21):** The GPS/Location Foundation milestone needs runtime location on API 33+ as well (for the GPS UX itself, not for Wi-Fi Direct). D-071 removes the `maxSdkVersion="32"` cap on `ACCESS_FINE_LOCATION`, adds `ACCESS_COARSE_LOCATION`, and keeps `NEARBY_WIFI_DEVICES` with `neverForLocation` unchanged. The permissions are semantically independent: Wi-Fi Direct discovery still uses `NEARBY_WIFI_DEVICES` (never location), and the location prompt is only shown when a user opens the location diagnostic surface. See D-071 for the current manifest and rationale.

### Reason

- `NEARBY_WIFI_DEVICES` with `neverForLocation` is the current documented pattern from `developer.android.com` for apps that use Wi-Fi P2P for peer-to-peer communication, not for deriving user location.
- Keeping `ACCESS_FINE_LOCATION` `maxSdkVersion` bounded to 32 avoids over-requesting on modern Android — the user should not see a location prompt on any device shipped in 2023 or later.
- No foreground service in Phase 3 keeps the security/privacy surface minimal until the V0 path is proven.

### Consequence

- Phase 3 diagnostics screen must call `PermissionsAndroid.request(NEARBY_WIFI_DEVICES)` on 33+ or `ACCESS_FINE_LOCATION` on ≤32 before invoking `startDiscovery`.
- Phase 4+ background scanning, relay, or persistent connections will require re-opening this decision (foreground service, `foregroundServiceType`, possibly additional privacy disclosures).

---

## D-065 — Phase 3 wire format: length-prefixed JSON on TCP port 8988

**Status:** ACCEPTED (2026-09-20)

### Decision

Phase 3 payloads on the Wi-Fi Direct group are framed as:

```
[ uint32 big-endian length ][ UTF-8 JSON body ]
```

on TCP port **8988**. The Wi-Fi Direct group owner listens on `ServerSocket(8988)`; the non-owner opens `Socket(WifiP2pInfo.groupOwnerAddress, 8988)`. Sockets open only inside the `onConnectionInfoAvailable` callback after `groupFormed && groupOwnerAddress != null`.

### Reason

- Length-prefixed framing avoids ambiguous message boundaries on a stream socket (JSON alone cannot self-frame without a delimiter that collides with JSON string content).
- Port 8988 is inside the IANA user range and not commonly used by system services on Android; it is deliberately a fixed constant so both sides do not need to negotiate a port.
- Server-on-owner / client-on-non-owner matches the pattern in the official `developer.android.com` Wi-Fi Direct guide.
- JSON is chosen for Phase 3 only because it is human-readable in `adb logcat` and easy to validate with Jest tests. A binary framing (protobuf/CBOR) is deferred until real chat messages exist.

### Consequence

- Real chat messages (Phase 5+), encryption (Phase 10), and any binary payloads will re-open this format decision.
- The `codec.ts` module owns encoding and MUST reject frames with `v ≠ 1`, unknown `kind`, or malformed JSON. No custom crypto here (CLAUDE.md §12).
- Client `Socket` opens include a bounded retry (5×, exponential backoff) on `ECONNREFUSED` because the group-owner server may not have finished binding when the client first tries.

---

## D-066 — Phase 3 diagnostic payload: `TestPing v1`

**Status:** ACCEPTED (2026-09-20)

### Decision

The only payload defined for Phase 3 is `TestPing v1`:

```json
{
  "v": 1,
  "kind": "test.ping",
  "id": "<uuidv7>",
  "fromDeviceId": "<uuidv7>",
  "textPreview": "hello from A",
  "sentAt": "2026-09-20T18:03:44.221Z"
}
```

Received `TestPing`s are persisted via `messageRepository.insertMessageIfAbsent` (D-014) into a reserved Phase-3-only diagnostic group:

- `id`: `00000000-0000-7000-8000-000000000003` (valid UUIDv7 by pattern, deliberately fixed for both devices).
- `name`: `__phase3_diagnostics`.
- `createdBy`: `NULL`.

The diagnostic group is seeded only when the setting `phase3.diagnostics.enabled` is `true`. Migration 0002 inserts the flag with value `false` by default so behavior is opt-in.

### Reason

- Diagnostic pings are not chat messages. Keeping them under a reserved group id makes them trivially filterable out of any consumer chat query.
- Using the existing `messages` table + `insertMessageIfAbsent` proves the deduplication path (D-014) with real code, not a stub.
- Opt-in flag matches Security §21 (nothing runs silently) and lets automated tests exercise the path without polluting a device's default state.

### Consequence

- The diagnostic group id is reserved forever; no user-created group may reuse it.
- Phase 3 UI must not display messages from this group in any consumer chat surface — it appears only in the Diagnostics screen event log.
- Test payload includes `fromDeviceId` (persistent UUIDv7 from `ensureLocalDevice`) so the receiver can identify the sender even though the Wi-Fi Direct MAC may be per-session randomized.

---

## D-067 — Phase 3 physical-test compatibility floor: 2 devices (narrows D-053)

**Status:** ACCEPTED (2026-09-20)

### Decision

The Phase 3 physical-test compatibility floor is **2 Android devices** (PHONE A + PHONE B). The 3-device compatibility floor introduced in D-053 applies to **Phase 4** (relay / multi-hop / mesh), not Phase 3.

### Reason

The user's Phase 3 spec is explicit: "first prove PHONE A ↔ PHONE B only. Not mesh." A relay path requires three devices by definition; a one-hop path does not. Requiring three devices for Phase 3 would delay the direct A↔B proof without adding evidence.

### Consequence

- Phase 3 completion is not blocked on a third device. Phase 3 report may mark relay/mesh testing as OUT-OF-SCOPE.
- Phase 4 planning must include a decision recording the three chosen devices (models, OS versions, chipsets) before any relay claim can be validated.
- D-053's "three-device compatibility floor" text is now understood to activate at the Phase 4 boundary — its language is not being rewritten, but this decision narrows its scope.

---

## D-068 — Phase 4 relay wire format: `MessageEnvelope v1`

**Status:** ACCEPTED (2026-09-21)

### Decision

Phase 4 introduces a new envelope wire format that carries the relay metadata Phase 3's `TestPing v1` (D-066) does not:

```json
{
  "v": 1,
  "kind": "msg.envelope",
  "id": "<uuidv7 — preserved across every hop>",
  "originDeviceId": "<uuidv7 — original creator>",
  "destinationDeviceId": "<uuidv7 | null>",
  "ttl": 5,
  "hopCount": 0,
  "sentAt": "<ISO instant — creator's local clock>",
  "body": { "kind": "test.ping", "payload": { "textPreview": "hello from A" } }
}
```

Framing is unchanged from D-065: 4-byte big-endian uint32 length prefix + UTF-8 JSON body on TCP port 8988; max frame 64 KB.

Field constraints (enforced by `validateEnvelope` in `src/services/communication/codec.ts`):

- `v` MUST equal `1`.
- `kind` MUST equal `'msg.envelope'`.
- `id`, `originDeviceId` MUST be valid UUIDv7.
- `destinationDeviceId` MUST be `null` (broadcast / any-forwarder for diagnostics) or a valid UUIDv7.
- `ttl` MUST be an integer in `[0, 5]`. `MAX_TTL = 5` on origin; the ceiling is re-decidable after physical evidence in Phase 4B without a code rewrite (only a schema change if the ceiling moves above 5).
- `hopCount` MUST be an integer in `[0, 64]`.
- `sentAt` MUST be a parseable ISO instant of length ≥ 20.
- `body.kind` MUST be a string. For `body.kind === 'test.ping'`: `body.payload.textPreview` MUST be a string of length ≤ 512.

Malformed / oversize / bad-version frames decode to `null`. The router emits `{ kind: 'envelopeRejected', reason }` and does not write to the DB or forward. This is the same discipline as D-065.

### Reason

- D-066's `TestPing v1` has no `ttl`, `hopCount`, `originDeviceId`, or `destinationDeviceId` — the exact fields multi-hop routing requires. A wrapping envelope keeps the existing framing (D-065) and dedupe (D-014) unchanged and lets future body kinds (`chat.text`, `location.ping`, `sos.signal`) reuse the same routing layer without further envelope changes.
- `MAX_TTL = 5` is the illustration used in `docs/03-NETWORKING.md §14`. Bounding it now makes accidental propagation impossible; loosening it later is a versioned decision, not a silent config knob.
- 64 KB frame cap is carried over unchanged (D-065); envelope overhead is ~256 bytes, leaving ~60 KB safe for `body.payload`.

### Consequence

- The router only accepts `v = 1`; any `v ≥ 2` frame is dropped with a rejected reason. Test #1 in `relay.test.ts` proves this.
- Adding a new body kind is a codec change (add validator for `body.kind === 'new-kind'`) — no envelope-schema change, no D-068 amendment.
- Renaming/removing a top-level envelope field (or changing a type) requires `v = 2` and a decision superseding D-068.
- Phase 3's `TestPing v1` codec (D-066) remains supported for the Phase 3 diagnostic path in this repo; Phase 4 code paths use envelopes. The two do not share a wire message.

---

## D-069 — Phase 4 relay algorithm: sequential handoff

**Status:** ACCEPTED (2026-09-21)

### Decision

The Phase 4A relay algorithm is **sequential handoff**, not group-owner fan-out. For a line topology `A → B → C`:

1. B connects to A, receives the envelope, decodes / validates / dedupes / persists.
2. If B is not the destination, B computes `ttl-1, hopCount+1` and enqueues the mutated envelope for forwarding.
3. B disconnects from A's Wi-Fi Direct group, then connects to C's, then drains the queue by sending on the C socket.

The full router semantics (dedupe via `MessageRepo.insertMessageIfAbsent`, `receivedFromAddress` exclusion, drainOnConnect) are specified in `docs/PHASE4-PLAN.md §4` and implemented in `src/services/communication/RelayRouter.ts`.

The router uses the existing `Transport` interface unchanged — no `sendPayload(peer, bytes)` signature change. It layers on top of Phase 3's `WifiP2pTransport` and Phase 3's `SocketWorker` without any Kotlin modification.

### Reason

- Android `WifiP2pManager` allows one P2P group per device at a time. Phase 3's `SocketWorker` (`android/app/src/main/java/com/offgrid/p2p/SocketWorker.kt:44`, `:131-139`) is single-socket by construction: installing a new socket closes the previous one.
- Sequential handoff requires **zero Kotlin change**. Group-owner fan-out requires B to accept two client sockets in one P2P group plus a discovery/connect flow that lets A and C find B simultaneously — a much larger native surface change with its own OEM-negotiation risk.
- Sequential handoff also matches the store-and-forward mental model in `docs/03-NETWORKING.md §15` (B temporarily loses connection to A, later meets C, forwards) — the same code path serves both scenarios.
- Latency cost (a few seconds of reconnect on real Wi-Fi Direct) is acceptable for a V0 proof. If Phase 4B measurements show this is unacceptable for a trekking group's real usage, GO fan-out becomes an evidence-driven optimization decision — not a leap into native code first.

### Consequence

- The router owns an in-memory `forwardQueue`. Envelopes persist to `messages` in step 1 (so the row survives an app crash), but the queue entry does not survive a restart in Phase 4A. Persistent queue is a Phase 4B+ concern.
- **Loop / duplicate discipline** is defence-in-depth: (a) `receivedFromAddress` exclusion prevents forwarding an envelope back to the peer who just handed it to us; (b) `insertMessageIfAbsent` dedupe by `id` rejects any envelope we've already stored, including one that looped back through another path.
- If Phase 4B measurements demand fan-out, a follow-up decision supersedes D-069 and admits concurrent sockets in Kotlin. D-069 is not a permanent commitment to sequential-only.
- The Phase 4A tests exercise this algorithm without any native code (`MockRelayNetwork` triangle). Physical evidence comes in Phase 4B under D-070.

---

## D-070 — Phase 4B 3-device physical test matrix

**Status:** ACCEPTED (2026-09-21)

### Decision

The Phase 4B physical run uses three Android devices:

| Role | Model | Android | Notes |
|---|---|---|---|
| **A** — Origin | Motorola Edge 50 Neo | 15 | Confirmed working in Phase 3 (2026-09-21) |
| **B** — Relay | iQOO Neo7 Pro | 14 | Confirmed working in Phase 3 (2026-09-21) |
| **C** — Destination | Redmi 9i | 11 | Confirmed by user 2026-09-21; oldest Android in the matrix — surfaces API-32-fallback permission path (`ACCESS_FINE_LOCATION`, per D-064) and MIUI Wi-Fi Direct behavior |

Six scenarios (S1–S6) are enumerated in `docs/PHASE4-PLAN.md §5`: line-forward, line-reverse, broadcast, duplicate suppression, TTL exhaustion, broken path. Any scenario that cannot be run is marked **BLOCKED** in `docs/PHASE4-REPORT.md`; no pass may be claimed without on-device evidence (CLAUDE.md §7 §8 §38; `docs/09-TESTING.md §N-005:290`).

### Reason

- D-053 established a 3-device compatibility floor; D-067 narrowed it to activate at the Phase 4 boundary. D-070 fills in the specific devices.
- Reusing A and B from Phase 3 keeps prior evidence composable (their Wi-Fi Direct behavior is already characterized on the exact build).
- Explicitly nominating the third device *before* physical evidence is collected prevents a "we tested with whatever was on the desk" outcome; the model and Android version become part of the record even if C is a loaner.

### Consequence

- Phase 4A completion does not depend on choosing C — the JS-side proof is independent of physical hardware.
- Phone C is now confirmed (Redmi 9i, Android 11). The device-selection blocker is cleared; D-070 can be flipped PROPOSED → ACCEPTED at the same time as D-068/D-069 when the Phase 4A design is approved.
- Android 11 (API 30) means Phone C uses the `ACCESS_FINE_LOCATION` fallback branch of D-064, not `NEARBY_WIFI_DEVICES` (API 33+). Phase 4B must verify the permission flow works on that path on a physical device, not just via the unit test in `__tests__/permissions/nearbyWifiPermission.test.ts`.
- MIUI's Wi-Fi Direct stack has historically added extra prompts / battery-saver interference; document any OEM-specific behavior encountered in `docs/PHASE4-REPORT.md` and, if it forces a code path change, open a new decision — not a silent workaround.
- If C's Wi-Fi Direct implementation exposes an OEM-specific failure mode not observed on A/B, that becomes a new decision entry — not a silent workaround.

---

## D-071 — GPS/Location Foundation: Android LocationManager, foreground-only, no Play Services

**Status:** ACCEPTED (2026-09-21)

### Decision

The GPS/Location Foundation milestone (Phase 5-adjacent local-only prerequisite) uses `android.location.LocationManager` directly — **not** `com.google.android.gms.location.FusedLocationProviderClient`.

Foreground-only: no `FOREGROUND_SERVICE_LOCATION`, no background updates, no continuous tracking. A user must have a foregrounded OFFGRID screen open (initially the location diagnostic surface under Settings → Advanced) for a fix to be requested.

`android/app/src/main/AndroidManifest.xml` declares:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />

<uses-permission
    android:name="android.permission.NEARBY_WIFI_DEVICES"
    android:usesPermissionFlags="neverForLocation"
    tools:targetApi="tiramisu" />

<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

- `ACCESS_FINE_LOCATION` (runtime/dangerous): required for high-accuracy GPS fixes across all supported API levels. The `maxSdkVersion="32"` cap from D-064 is removed — hikers need GPS on modern Android just as much as on Android ≤12.
- `ACCESS_COARSE_LOCATION` (runtime/dangerous): declared so the module can fall back to network provider fixes if the user grants only "approximate location" on API 31+.
- `NEARBY_WIFI_DEVICES` with `neverForLocation`: unchanged from D-064. Wi-Fi Direct discovery is still explicitly not location-derivation.

### Reason

- **No Play Services dependency.** OFFGRID's user base includes hikers who deliberately run degoogled / AOSP Android builds (LineageOS, GrapheneOS). Depending on `play-services-location` would silently exclude them and add ~200KB. Raw `LocationManager` is documented, stable, and works on any AOSP-compatible device.
- **Foreground-only** keeps the security / privacy surface minimal for V0 (CLAUDE.md §15: respect OS permissions; §Privacy Rules: private groups are private). Background location + `FOREGROUND_SERVICE_LOCATION` is a much larger UX and Play Store surface — deferred until a real product feature (e.g., group live-location sharing) is scoped and approved.
- **Two permissions, not one.** Android 12+ lets users grant "approximate" (coarse) only. Declaring both means the module can present an honest state (fine, coarse, denied, or provider disabled) instead of failing opaquely.
- **Independent from Wi-Fi Direct.** D-064's `NEARBY_WIFI_DEVICES + neverForLocation` still holds. Users who never open the location screen never see a location prompt.

### Consequence

- Native module `com.offgrid.location.OffgridLocationModule` (classic bridged `ReactContextBaseJavaModule` per D-063) exposes `checkPermission()`, `isLocationEnabled()`, and `getCurrentLocation({ timeoutMs, maxAgeMs })`. No streaming subscriptions. No fake fallback: the promise rejects with `E_PERMISSION_DENIED`, `E_TIMEOUT`, or `E_LOCATION_REQUEST` and JS surfaces that state visibly (CLAUDE.md §14 §20).
- SQLite `locations` table (migration 0001) + additive migration 0003 (`heading`, `speed`) is the source of truth. Every successful fix is inserted before any UI or network path treats it as delivered (§Local First; §Message Rules).
- Cross-references: D-023 (Location Privacy: distinguish current vs last-known vs unknown vs sharing-disabled), D-042 (snake_case DB, camelCase TS), D-060 (UUIDv7 raw storage), D-063 (bridged module surface).
- Any future need for background location, geofencing, or continuous tracking re-opens this decision. It will add `FOREGROUND_SERVICE_LOCATION`, a notification, and probably `ACCESS_BACKGROUND_LOCATION` (with the associated Play Store data disclosure).
- Any future decision to adopt Play Services (e.g., for indoor Wi-Fi positioning) must document why AOSP support is being dropped — and probably keep the raw-LocationManager path as a fallback.

---

## D-072 — Real Map Rendering: MapLibre React Native (bare CLI, no Expo runtime)

**Status:** ACCEPTED

### Decision

The Group Map (D-023) is rendered by `@maplibre/maplibre-react-native@10.4.2`. The GroupMapScreen keeps its `MapCanvasComponent` abstraction; `MapLibreMapCanvas` becomes the default, and `SchematicMapCanvas` is retained as a fallback for unit / snapshot tests and dev environments without a working native module.

Concretely:

- Package: `@maplibre/maplibre-react-native@10.4.2` (last release before the 11.x line required `expo >= 54` as a peer, which conflicts with D-047 "no Expo").
- Android side: `minSdkVersion=24` already satisfies MapLibre RN 10.x's `minSdk=21`. `mavenCentral()` in `android/build.gradle` provides `org.maplibre.gl:*` transitively — no extra Maven repo declarations required. Autolinking wires `MLRNPackage` through RN 0.87's default `PackageList`.
- Runtime: `MapLibreGL.Logger.setLogLevel('warning')` at module load. `MapView.onDidFailLoadingMap` flips a local `styleFailed` state so a style-load failure surfaces a clear fallback card ("Map style unavailable") instead of a silently blank map (CLAUDE.md §20 "UI must communicate actual system state").
- Camera: initial stop is chosen by pure logic in `src/components/map/mapCameraFit.ts` — `bounds` fit for multiple markers (48px padding), `center + zoom 13` for a single marker, midpoint + zoom 15 for near-identical markers, and a deliberate world view `(0, 20) @ zoom 1.2` when there is nothing to show (D-023 §"no invented coordinates").
- Markers: `PointAnnotation` per marker; variant → style is a pure function in `src/components/map/mapMarkerStyle.ts`. Invalid coordinates are filtered before render.
- Attribution: rendered under the canvas from the provider config (never hard-coded).
- Scope: foreground-only, consistent with D-071. No background rendering; no location-tracking mode enabled; no telemetry.

### Reason

- **MapLibre GL** is the only mature, permissively licensed vector renderer that works with our stack. Google Maps SDK is rejected by D-009 (privacy + AOSP support).
- **10.x vs 11.x.** MapLibre RN 11 declares `expo` as a required peer. D-047 forbids Expo runtime for OFFGRID (bare RN CLI, no Expo modules core). 10.4.2 is the newest release that ships without that peer while still supporting RN 0.87 / Android SDK 24+.
- **Preserving the `MapCanvasComponent` abstraction** keeps the map renderer replaceable. If MapLibre proves unsuitable on real devices (e.g., GPU crashes on specific vendors), we can swap the canvas without touching `GroupMapScreen` or the location pipeline.
- **Style-load failure fallback** is required by CLAUDE.md §20: a blank map is a form of lying about state.

### Alternatives considered

- MapLibre RN 11.x — rejected: forces Expo runtime; conflicts with D-047.
- `react-native-maps` (Google) — rejected by D-009 (privacy, no AOSP-only path).
- MapLibre GL JS in a WebView — considered; deferred. Pure-JS renderer would work offline but adds a WebView-shaped attack surface and complicates the pluggable style path.
- Custom WebGL renderer — out of scope for V0.

### Consequence

- New files: `src/components/map/MapLibreMapCanvas.tsx`, `src/components/map/mapCameraFit.ts`, `src/components/map/mapMarkerStyle.ts`, `src/services/maps/maplibreOfflineDriver.ts`, `__mocks__/@maplibre/maplibre-react-native.js` (Jest manual mock so tests do not require the native module).
- `GroupMapScreen` default `MapCanvas` prop is now `MapLibreMapCanvas`. Tests that need a stub still pass `SchematicMapCanvas` explicitly.
- All existing tests continue to pass (239 total); new tests cover camera fit, marker style, and offline-region service invariants.
- Any bump past 10.x requires re-evaluating D-047 (Expo runtime) or waiting for a fork/branch that drops the Expo peer.

---

## D-073 — Map Tile Provider Abstraction (resolves P-005 direction, provider still replaceable)

**Status:** ACCEPTED (direction). P-005 remains **OPEN** on the exact production provider.

### Decision

All tile-provider details (style URL, attribution, offline download policy, offline tile cap) live in a single config module: `src/config/mapProvider.ts`. `MapLibreMapCanvas` and the offline-region service both read the active provider through `getMapProvider()`; no provider URL is embedded in a screen, canvas, or service.

The config object:

```ts
interface MapProviderConfig {
  id: string;
  styleUrl: string;
  attribution: string;
  downloadPolicy: 'disabled' | 'permitted';
  maxOfflineTileCount: number;
}
```

Rules the abstraction enforces:

- **Default `downloadPolicy` is `disabled`.** The out-of-the-box `DEFAULT_MAP_PROVIDER` points at `https://demotiles.maplibre.org/style.json` and cannot download offline regions. A production build swaps the provider explicitly.
- **Blocklist for OSM's public tile server.** `assertProviderAllowsOfflineDownload()` rejects any style URL whose host matches `tile.openstreetmap.org` (and standard subdomain variants), even when `downloadPolicy=permitted`. This is enforced by the offline-region service before any `createPack` call. Rationale: OSMF's Tile Usage Policy explicitly forbids bulk downloads / prefetch of the public tile server.
- **OSM-derived vector tiles are the intended production direction.** The V1 plan is to ship a provider whose style/tiles are OSM-derived but served by an OSM-derived vector-tile provider (e.g., MapTiler / Stadia / self-hosted planetiler) that permits offline caching. **P-005 remains open** on the exact vendor; this decision only locks the *shape* of the abstraction and forbids the public OSM tile server for downloads.
- **Attribution is a required field.** Empty attribution is not allowed for permitted providers.

### Reason

- CLAUDE.md §13 (privacy), §16 (dependency evaluation), §31 (do not invent product behavior): committing to a specific commercial provider without evaluating cost + licensing + coverage would be premature. Locking the *shape* (single config object, guard, blocklist) is not premature and unblocks the real-map milestone.
- CLAUDE.md §23 (no feature creep): the abstraction avoids scattering provider knowledge across the codebase, so a future swap is a one-file change.
- OSMF Tile Usage Policy is explicit; getting this wrong would result in the public tile server blocking our clients — a form of "honest connectivity" failure (CLAUDE.md §Honest Connectivity).

### Alternatives considered

- Hard-code the style URL in `MapLibreMapCanvas` — rejected: makes the provider unreplaceable and puts provider policy in a UI file.
- Skip the guard and rely on operator discipline — rejected: the guard is the mechanical enforcement of a policy the docs already require.
- Fully hard-code an OSM-derived provider in this milestone — rejected: P-005 is still open on cost/licensing; the direction (OSM-derived vector, offline-capable) is decided, the exact vendor is not.

### Consequence

- New file: `src/config/mapProvider.ts` with `DEFAULT_MAP_PROVIDER`, `getMapProvider`, `setMapProvider`, `resetMapProvider`, `assertProviderAllowsOfflineDownload`, and `DISALLOWED_OFFLINE_HOSTS`.
- New service: `src/services/maps/offlineRegions.ts` (`OfflineRegionsService`) with an in-memory driver for tests and `src/services/maps/maplibreOfflineDriver.ts` for the real MapLibre `OfflineManager`. `create()` validates bounds + zoom + finite coords and calls `assertProviderAllowsOfflineDownload` before touching the driver.
- P-005 stays open: the final vendor selection remains a product/licensing decision. When that decision is made, the change is a `setMapProvider({...})` in the app bootstrap; no other file changes.
- Cross-references: D-009 (map choice / no Google Maps), D-023 (location privacy states), D-038 (renderer vs. provider split), D-072 (real map rendering), P-005 (final map provider).

---

## D-075 — Group-Join Query/Invite Envelope Protocol (fixes local-only join code lookup)

**Status:** ACCEPTED

### Decision

Group joining by code is a two-phase flow. The first phase is a local
fast-path (existing `joinGroupByCode`). If it fails with
`INVALID_JOIN_CODE`, the second phase broadcasts a nearby request over the
existing CommunicationManager / Wi-Fi Direct transport and waits for a
matching invite.

Two new `MessageEnvelope` body kinds are introduced, both direct-only
(`ttl=0`, `hopCount=0`) and never eligible for RelayRouter forwarding:

- **`group.join.request`** — broadcast from the joiner. Payload:
  `{code, joinerUserId, joinerDisplayName}`. `destinationDeviceId=null`.
- **`group.join.invite`** — unicast reply to `originDeviceId` of a matching
  request. Payload:
  `{code, groupId, groupName, groupCreatedAt, joinerUserId, members[]}`.
  `members[]` is an active-member snapshot at the responder's side, capped
  at `MAX_JOIN_INVITE_MEMBERS = 50` (matches `GROUP_MEMBER_LIMIT`).

Both envelopes are validated at the codec boundary (UUIDv7 ids, normalized
code of exact length, name/display-name length caps, ISO instants).

`RelayRouter.handlePayload` early-returns for both kinds — same guard
pattern as `msg.text` in D-074. They are never written to the diagnostic
group, never forwarded.

Responder rules (`groupJoinResponder`):

- Only groups where the local user is an **active member** of a non-direct
  group are eligible to respond. A random stale row on a non-member device
  cannot leak group metadata (CLAUDE.md §13).
- On match, the responder first ensures a local `users` row exists for the
  joiner (with the display name from the request), then delegates to
  `joinGroupByCode` (which uses the existing `reactivateMembership` /
  `MEMBER_LIMIT_REACHED` semantics). Only then does it unicast an invite.
- Silent on failure — no rejection reason is sent to the requester. Stable
  `[group-join-responder]` log prefix for diagnostics.

Joiner rules (`groupJoinService.requestJoinByCode`):

- Local fast-path first. Only if that returns `INVALID_JOIN_CODE` do we
  fall through to the nearby request.
- No manager registered → throws
  `GroupsError('NO_CONNECTION', …)` so the UI can prompt the user to enable
  connectivity (CLAUDE.md §20).
- Timeout on invite (`DEFAULT_JOIN_TIMEOUT_MS = 8000`) → throws
  `GroupsError('INVALID_JOIN_CODE', …)`. The user cannot tell "wrong code"
  from "no nearby member hosts this code", and lying either way would be a
  §14/§20 honesty violation.
- On invite, install the group + every member in `members[]` idempotently
  (INSERT-if-absent for both users and memberships; reactivate
  previously-left rows). Ensure the joiner's local membership is present as
  `member` and `active`.

Runtime lifecycle (`groupJoinRuntime`) mirrors `chatRuntime` from D-074:
subscribe to `commsRuntime`, attach the responder to whichever
CommunicationManager is active. `bootstrapApp` calls
`startGroupJoinRuntime` once at app start.

`JoinGroupScreen` is unchanged visually; only the handler swaps from a
synchronous local-DB lookup to `await requestJoinByCode(...)`. The polished
UI, layout, testIDs, and error copy path stay intact.

### Reason

- **The V1 join UX must not be a hidden internet dependency in disguise.**
  Before this change, B could enter a valid code that A had just generated
  and get "No group matches the code" because the search was local-only.
  That silently failed CLAUDE.md §Offline First and §Honest Connectivity.
- **Reuse the existing transport.** Wi-Fi P2P is already proven in D-070's
  physical test matrix; the RelayRouter's direct-only guard for `msg.text`
  provides the exact pattern needed here.
- **Codes are not secrets.** `joinCode.ts` §8 and `docs/05-SECURITY.md` §8
  already document that the code is a typeable convenience token — the
  privacy check is "am I an active member of this group?", not code entropy.
  The responder rule enforces this correctly.
- **Silent responder failures.** Never tell the requester "you asked me,
  but I said no." An adversarial device could probe for group ownership;
  privacy §13 forbids leaking membership.
- **8-second timeout.** Chosen empirically from Phase 3's A↔B pairing
  latency (~2–4s cold, faster warm). Doubling that gives headroom for the
  responder's DB writes + reply frame without frustrating the user.

### Alternatives considered

- **Extend `msg.text` with a "join" flavor** — rejected: overloads chat
  routing, mixes privacy tiers, and violates the direct-only chat contract.
- **Multi-hop via RelayRouter** — rejected for V1: relay's diagnostic-group
  persistence path is wrong for join, and the acceptance test only requires
  A and the joiner to be in physical proximity (matches the product
  narrative "ask the admin for the code, be near them").
- **QR code first / instead** — deferred (ComingSoonNotice already visible
  on the screen). Same envelope protocol will back the QR flow: scanning
  the QR bypasses only the code-typing step, not the request/invite pair.
- **Cryptographic join tokens** — Phase 10 concern (05-SECURITY.md §Real
  cryptographic invitations). Would replace the raw `code` field with a
  signed capability without touching the envelope routing.

### Consequence

- New types: `GroupJoinRequestBody`, `GroupJoinInviteBody`,
  `GroupJoinInviteMember` in `src/types/communication.ts`; envelope body
  union extended.
- New codec validators in `src/services/communication/codec.ts`.
- `CommunicationManager` gains `sendGroupJoinRequestEnvelope`,
  `sendGroupJoinInviteEnvelope`, and four new events
  (`groupJoinRequestEnvelopeSent/Received`,
  `groupJoinInviteEnvelopeSent/Received`).
- `RelayRouter.handlePayload` gains an early-return guard for both new
  kinds.
- New files: `src/services/groups/groupJoinResponder.ts`,
  `src/services/groups/groupJoinService.ts`,
  `src/services/groups/groupJoinRuntime.ts`.
- `src/services/appBootstrap.ts` calls `startGroupJoinRuntime` after
  `startChatRuntime`.
- `src/services/groups/errors.ts` gains `NO_CONNECTION`.
- `src/screens/JoinGroupScreen.tsx` handler now async; **layout unchanged**.
- Tests: `__tests__/services/groups/groupJoinService.test.ts` (3-node mock
  triangle) + codec round-trip coverage in
  `__tests__/communication/groupJoinCodec.test.ts`. Physical 3-phone run
  remains untested — deferred to the same test matrix that covered D-070.
- Cross-references: D-014 (dedupe), D-058 (private groups), D-062 (Wi-Fi
  P2P V0), D-069 (relay handoff), D-074 (chat V1 direct-only pattern),
  05-SECURITY.md §8 (join code is not a secret).

---

## D-076 — Consumer 1-to-1 Chat Request Handshake (privacy-first Nearby flow)

**Status:** ACCEPTED

### Decision

Introduce a consumer-friendly 1-to-1 chat flow anchored on a Home → Nearby
screen and a three-envelope handshake. Users tap a nearby device, the
recipient sees an incoming chat request with the requester's display name,
and after Accept the direct-conversation group (D-074) opens on both sides.

Three new `MessageEnvelope` body kinds are introduced, all direct-only
(`ttl=0`, `hopCount=0`) and never eligible for RelayRouter forwarding:

- **`chat.request`** — broadcast from the requester. Payload:
  `{requestId, fromUserId, fromDisplayName, toUserId}`.
  `destinationDeviceId=null`. `toUserId` is **nullable**: `null` means
  "for whoever receives this directly over the Wi-Fi Direct link that has
  already formed" — used by the Nearby flow where Alice has not yet learned
  Bob's OFFGRID userId. A concrete UUIDv7 preserves the strict-addressing
  semantic for future flows where identity was previously exchanged.
- **`chat.request.accept`** — unicast reply to the requester's
  `originDeviceId`. Payload:
  `{requestId, accepterUserId, accepterDisplayName, requesterUserId}`.
  Carries the accepter's identity so the requester can create the local
  `users` row and open the direct chat even when they never persisted an
  outgoing `chat_requests` row (Nearby toUserId=null case).
- **`chat.request.decline`** — unicast reply to the requester's
  `originDeviceId`. Payload:
  `{requestId, declinerUserId, requesterUserId}`. Best-effort — if the wire
  send fails, the local decline still stands and the requester's row stays
  `pending` (honest CLAUDE.md §20 outcome).

Validation at the codec boundary (all IDs UUIDv7, self-loop rejected on
`chat.request` when `toUserId` is non-null, self-loop rejected on
`chat.request.accept` / `chat.request.decline`, display names trimmed and
capped at `MAX_CHAT_REQUEST_DISPLAY_NAME_LENGTH = 64`).

`RelayRouter.handlePayload` early-returns for all three kinds — same guard
pattern as `msg.text` in D-074 and the join envelopes in D-075. They are
never written to the diagnostic group, never forwarded.

New table `chat_requests` (migration `0006_chat_requests`) — one row per
handshake, `id` equals the wire `requestId` so both peers converge on the
same row without a token. `direction` is `'incoming'`/`'outgoing'` (from the
local perspective), `status` is `'pending'/'accepted'/'declined'/'cancelled'`.
Partial unique index enforces "at most one pending row per ordered pair".

Responder rules (`chatRequestResponder`):

- Subscribes to `chatRequestEnvelopeReceived`,
  `chatRequestAcceptEnvelopeReceived`, `chatRequestDeclineEnvelopeReceived`
  on the active manager (via `chatRequestRuntime` singleton, same pattern
  as `chatRuntime` / `groupJoinRuntime`).
- On `chat.request`: silently ignore if `payload.toUserId` is non-null and
  does not match the local user; also ignore self-loopback. Ensure the
  requester's `users` row exists (from the payload's `fromDisplayName`) and
  insert a pending incoming `chat_requests` row. Idempotent on duplicate
  `requestId`. If a different pending row for this ordered pair already
  exists, do nothing (partial unique index would reject it anyway).
- On `chat.request.accept`: ensure the accepter's `users` row exists FIRST
  (even when no outgoing row is present locally — Nearby toUserId=null
  case requires this). Then, only if a pending outgoing row for the same
  requestId exists on this device, flip it to `accepted`.
- On `chat.request.decline`: same shape, flips to `declined` if a matching
  pending outgoing row exists.
- All handlers wrap in `try/catch` and log via
  `[chat-request-responder] …` prefix; never leak reasons over the wire.

Service rules (`chatRequestService`):

- `sendChatRequest` — persists an outgoing row locally FIRST when
  `toUserId` is known (deduping against a prior pending row for the same
  ordered pair); when `toUserId` is null, no outgoing row is persisted and
  the caller's UI (`nearbyStore`) holds ephemeral state until the accept
  envelope returns. Then broadcasts the `chat.request` envelope. Throws
  `NO_CONNECTION` if no manager is registered.
- `acceptChatRequest` — creates the direct group via
  `ensureDirectConversation` (D-074), flips the local row to `accepted`,
  then unicasts the accept envelope to the requester's `originDeviceId`.
  If the transport is unavailable, the local state stands and the caller
  gets `NO_CONNECTION` so the UI can show an honest error.
- `declineChatRequest` — flips the row and best-effort unicasts a decline
  envelope. Silent on transport failure — the local state is authoritative.
- `cancelOutgoingChatRequest` — synchronous, no wire notification. Used
  when the requester backs out.

UI (`NearbyScreen` + `nearbyStore` + Home CTA):

- Auto-starts Wi-Fi Direct discovery when the screen focuses; shows a
  spinner and a "Stop searching" affordance. No exposure of Wi-Fi Direct,
  MAC, device-id, TCP, or diagnostics vocabulary — nearby peers show as
  "Nearby OFFGRID device · XXXX" where the 4-char FNV-1a suffix of the
  peer session key is a deterministic disambiguator (not identity).
- Identity/display name is revealed **only** through `chat.request`. No
  separate `presence.announce` broadcast (see Alternatives).
- Recipient sees an incoming request card with `Accept` / `Decline`.
  Location is not exposed just because a peer is nearby (CLAUDE.md §15).
- On `accepted`, the screen navigates straight into the direct `Chat`
  (D-074 direct group is already created on both sides).

### Reason

- **Consumer-friendly on-ramp.** The V0 UX before this change assumed the
  user knew how to reach the Diagnostics screen and understood
  "peer connected / TCP 8988 / group owner elected". The 1-to-1 chat flow
  is the shortest honest demonstration of "stay connected when the network
  disappears" for a non-technical user.
- **Privacy-first defaults.** CLAUDE.md §13 forbids leaking group
  membership, messages, locations, or safety events to unauthorised
  devices. Broadcasting a `presence.announce` would leak identity/display
  name to anyone within Wi-Fi Direct range regardless of the user's intent.
  Instead, identity is only exchanged as part of an explicit `chat.request`
  the requester chose to send.
- **`toUserId` nullable is the smallest change consistent with the
  transport reality.** Wi-Fi Direct peer discovery surfaces device
  metadata (MAC, device name) — not OFFGRID `userId`. Requiring a
  concrete `toUserId` at request time would force either a manual userId
  entry (bad UX) or a post-connection identity exchange (a de-facto
  `presence.announce`, rejected above). Null means "for whoever receives
  this directly over the WFD link that has already formed" — the framing
  layer already restricted delivery to a currently-connected peer, so the
  scope is unchanged.
- **Reuse over invention.** Chat V1 (D-074), Wi-Fi P2P V0 (D-062), the
  CommunicationManager event pattern (D-063), the runtime singleton
  pattern (`chatRuntime`, `groupJoinRuntime`), the RelayRouter direct-only
  guard (D-069), and the join-envelope validator style (D-075) all
  transfer directly.
- **Honest states end-to-end.** The `chat_requests.status` enum encodes
  the entire lifecycle. `sendChatRequest` returns `null` for `request`
  when there is no persisted row (Nearby null path) — the UI must not
  claim otherwise. `declineChatRequest` with `requesterOriginDeviceId=null`
  leaves the requester's row `pending` (§20).

### Alternatives considered

- **`presence.announce` broadcast** — rejected. Would advertise
  identity/display name to every Wi-Fi Direct peer within range without
  explicit user consent. Violates CLAUDE.md §13 (private by default). The
  nullable-`toUserId` `chat.request` is strictly less leaky: identity is
  only revealed to the exact peer the user tapped.
- **Manual userId entry** — rejected. Consumer UX cannot ask users to
  type UUIDv7s. Also breaks the "no networking internals in the UI"
  principle (CLAUDE.md §Simple UX).
- **Multi-hop chat request over RelayRouter** — rejected for V1. Would
  require an addressed unicast delivery model the transport does not yet
  provide, and would expose identity to intermediate hops. Direct-only
  matches the D-074 chat contract.
- **Overload `group.join.request` with a "1-to-1" flavor** — rejected.
  Mixes privacy tiers (group membership vs. 1-to-1 identity) and
  conflates two independent lifecycles. Separate envelope kinds keep the
  responders single-purpose.
- **QR-code identity exchange as a prerequisite** — deferred. When it
  lands, the QR flow will hand the requester a concrete `toUserId` and
  the same `chat.request` envelope will carry it — no protocol change
  needed.
- **Cryptographic chat capabilities** — Phase 10 concern
  (`05-SECURITY.md`). Would replace `toUserId`/`fromUserId` with signed
  identity attestations without touching envelope routing.

### Consequence

- New types: `ChatRequestBody`, `ChatRequestAcceptBody`,
  `ChatRequestDeclineBody`, and `MAX_CHAT_REQUEST_DISPLAY_NAME_LENGTH` in
  `src/types/communication.ts`; envelope body union extended. Note:
  `ChatRequestBody.payload.toUserId` is `UserId | null` — see
  `src/services/communication/codec.ts` for the validator.
- New codec validators in `src/services/communication/codec.ts` — with
  the toUserId=null branch documented inline.
- `CommunicationManager` gains `sendChatRequestEnvelope`,
  `sendChatRequestAcceptEnvelope`, `sendChatRequestDeclineEnvelope`, and
  six new events (`chatRequestEnvelopeSent/Received`,
  `chatRequestAcceptEnvelopeSent/Received`,
  `chatRequestDeclineEnvelopeSent/Received`).
- `RelayRouter.handlePayload` gains an early-return guard for all three
  chat-request kinds.
- New migration `0006_chat_requests` + `ChatRequestRepo`
  (`src/database/repositories/chatRequestRepository.ts`).
- New entity types `ChatRequest`, `ChatRequestDirection`,
  `ChatRequestStatus` in `src/types/entities.ts`.
- New files: `src/services/chat/chatRequestResponder.ts`,
  `src/services/chat/chatRequestService.ts`,
  `src/services/chat/chatRequestRuntime.ts`.
- `src/services/appBootstrap.ts` calls `startChatRequestRuntime` alongside
  `startChatRuntime` / `startGroupJoinRuntime`.
- New store `src/store/nearbyStore.ts` (Zustand) with consumer vocabulary
  only and a deterministic `nearbyPeerLabel()` FNV-1a-based short suffix.
- New screen `src/screens/NearbyScreen.tsx` — auto-starts discovery on
  focus, spinner, `Stop searching`, incoming request Accept/Decline,
  navigates to `Chat` on `accepted`.
- `RootStack` route `Nearby` added; `HomeScreen` gains a "Chat with
  someone nearby" CTA above "Your groups".
- Tests: `__tests__/communication/chatRequestCodec.test.ts` (round-trip +
  null toUserId + self-loop + display-name cap) and
  `__tests__/services/chat/chatRequestService.test.ts` (2-node
  MockTransport pair covering send/accept/decline/cancel/duplicate/
  self-loopback and the toUserId=null Nearby path). Physical 3-phone run
  is a follow-up on the D-070 matrix.
- Cross-references: D-014 (dedupe), D-058 (private groups), D-062 (Wi-Fi
  P2P V0), D-063 (CommunicationManager pattern), D-069 (relay handoff /
  direct-only guard), D-074 (chat V1, direct group derivation), D-075
  (join envelope pattern), CLAUDE.md §13 (privacy), §15 (location),
  §20 (honest UI), §Simple UX.

---

