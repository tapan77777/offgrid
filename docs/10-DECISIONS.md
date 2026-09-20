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

