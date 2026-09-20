# OFFGRID — System Architecture

**Document:** `02-ARCHITECTURE.md`  
**Version:** 0.1  
**Status:** Draft  
**Depends on:** `01-PRD.md`

---

## 1. Purpose

This document defines the technical architecture of OFFGRID.

The architecture must support an **offline-first** mobile application where core group functionality continues to work without Internet connectivity.

The system must be designed so that local/offline functionality does not depend on the cloud.

---

## 2. Architecture Goals

OFFGRID architecture must prioritize:

1. Offline-first operation
2. Reliable local persistence
3. Modular networking
4. Clear separation between UI and networking
5. Privacy and security
6. Testability
7. Android-first development
8. Future iOS support
9. Future LoRa/Meshtastic support
10. Online synchronization when connectivity returns

---

## 3. Initial Technology Stack

### Mobile

**React Native + TypeScript**

Reason:
- Existing React/TypeScript knowledge
- Cross-platform UI
- Native module support
- Android-first development with future iOS support

### Android Native Layer

**Kotlin**

Used for functionality that requires Android-native APIs, especially local device communication and other platform-specific capabilities.

### Local Database

**SQLite**

Used as the primary persistent local data store.

OFFGRID must not depend on the cloud for core offline functionality.

### State Management

**Zustand** or another lightweight state-management solution approved during implementation.

### Maps

**MapLibre + OpenStreetMap-based map data**

The exact offline tile/download implementation will be finalized during architecture implementation.

### Backend

**Supabase**

Potential responsibilities:
- Authentication
- Online data synchronization
- Cloud database
- User/group data
- Backup
- Online recovery

Supabase must not be required for core offline communication.

### Notifications

Platform notification services may be used when Internet connectivity exists.

---

## 4. High-Level Architecture

```text
                         OFFGRID
                            │
                 ┌──────────┴──────────┐
                 │                     │
             React Native          Native Layer
             TypeScript              Kotlin
                 │                     │
       ┌─────────┼─────────┐     ┌─────┴─────────┐
       │         │         │     │               │
       UI      State     Services  Local        Device
       │         │         │       Network      APIs
       │         │         │
       │         │         ├── Messaging
       │         │         ├── Location
       │         │         ├── Maps
       │         │         ├── Safety      (I'm Safe, SOS — D-041)
       │         │         └── Sync
       │         │
       └─────────┴───────────────┐
                                 │
                              SQLite
                                 │
                         Offline Source of Truth
                                 │
                         Sync when online
                                 │
                              Supabase
```

---

## 5. Architectural Principle: Local First

The local database is the primary source of truth while the device is offline.

Example:

```text
User sends message
        ↓
Validate locally
        ↓
Write to SQLite
        ↓
Attempt local delivery
        ↓
Mark delivery state
        ↓
Internet available?
        │
      YES
        ↓
Sync with Supabase
```

The application must NOT do:

```text
User sends message
        ↓
Wait for server
        ↓
Display message
```

because this would break the offline-first requirement.

---

## 6. Application Layers

### 6.1 Presentation Layer

Responsible for:
- Screens
- Components
- Navigation
- User interaction
- UI state

Examples:

```text
HomeScreen
GroupScreen
ChatScreen
MapScreen
MembersScreen
SafetyScreen        (hosts distinct "I'm Safe" and "SOS" actions — see D-041)
SettingsScreen
```

There is no generic "Emergency" screen. "I'm Safe" and "SOS" are represented as distinct user-facing actions within the Safety experience per D-041 and `06-UX-FLOWS.md §§20–22`.

The presentation layer should not directly implement networking protocols.

---

### 6.2 Application / Business Logic Layer

Responsible for:
- Group operations
- Message creation
- Safety workflows ("I'm Safe" and SOS as distinct actions — D-041)
- Location-sharing rules
- Sync decisions
- Connection state

Example:

```text
sendMessage()
createGroup()
joinGroup()
markSafe()
triggerSOS()
shareLocation()
syncPendingData()
```

Business logic should remain independent from specific UI components.

---

### 6.3 Service Layer

Services provide specialized functionality.

```text
services/
├── messaging/
├── communication/     (transport-agnostic peer communication — see D-043)
├── location/
├── maps/
├── safety/            (hosts I'm Safe and SOS as distinct actions — see D-041)
├── sync/
├── identity/
└── connectivity/
```

Each service should have a clearly defined responsibility.

The `communication/` directory replaces the earlier `mesh/` naming because multi-hop mesh is still experimental (D-012, D-043) and the folder structure must not presume a capability that has not been physically demonstrated.

---

### 6.4 Persistence Layer

Responsible for local data.

```text
database/
├── sqlite/
├── migrations/
├── repositories/
└── models/
```

Repositories should isolate database implementation from business logic.

Example:

```text
MessageService
      ↓
MessageRepository
      ↓
SQLite
```

Business logic should not contain raw SQL everywhere.

---

### 6.5 Native Communication Layer

The networking implementation that requires native Android APIs should be isolated behind a stable interface.

Conceptually:

```text
TypeScript
    ↓
MeshService
    ↓
NativeBridge
    ↓
Kotlin
    ↓
Android networking APIs
```

The React Native application should not spread native networking calls throughout the UI.

---

## 7. Communication Architecture

OFFGRID will eventually support multiple communication paths.

```text
                    CommunicationManager
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          Internet       Local        LoRa
             │          Device Mesh      │
             │             │             │
          Supabase      Phone-to-Phone   Future
```

The application should expose a common internal interface so that higher-level features do not need to know which transport is being used.

Example:

```text
MessagingService
       ↓
CommunicationManager
       ↓
Transport
 ┌─────┼──────────┐
 │     │          │
Net   Local      LoRa
```

The exact local transport technology is intentionally left to `03-NETWORKING.md`.

---

## 8. Message Flow

### Offline message

```text
User
 ↓
Chat UI
 ↓
MessagingService
 ↓
SQLite
 ↓
CommunicationManager
 ↓
Local Transport
 ↓
Nearby Device
```

### Online synchronization

```text
SQLite
 ↓
SyncQueue
 ↓
SyncService
 ↓
Supabase
```

### Important rule

A message should be persisted locally **before** attempting network delivery.

This prevents data loss if the connection disappears immediately after the user sends a message.

---

## 9. Location Architecture

Location should be treated separately from messaging.

```text
GPS
 ↓
LocationService
 ↓
Local database
 ↓
Group location state
 ↓
Local communication / cloud sync
```

The system should store metadata such as:

```text
user_id
latitude
longitude
accuracy
timestamp
source
```

The UI must distinguish:

```text
CURRENT
```

from:

```text
LAST KNOWN
```

---

## 10. Offline Map Architecture

Maps should operate independently of Internet availability.

```text
Map UI
 ↓
MapService
 ↓
Local map data
 ↓
Map renderer
```

Before a trip:

```text
Internet
 ↓
Map download
 ↓
Device storage
```

During the trip:

```text
Offline
 ↓
Local map
 +
GPS
```

The map system should not require Supabase.

---

## 11. Group Architecture

A group contains:

```text
Group
├── Group ID
├── Name
├── Creator
├── Members
├── Group settings
├── Membership state
└── Local synchronization state
```

Each member/device should have a stable identity for local communication.

The architecture must distinguish:

```text
User identity
```

from:

```text
Device identity
```

because one user may eventually use multiple devices.

---

## 12. Offline Synchronization

OFFGRID should use an explicit synchronization mechanism.

Conceptually:

```text
LOCAL DATA
    │
    ├── pending
    ├── synced
    ├── failed
    └── conflict
```

Example:

```text
User creates message
       ↓
SQLite
       ↓
sync_status = pending
       ↓
Internet returns
       ↓
SyncService
       ↓
Supabase
       ↓
sync_status = synced
```

The synchronization design will be specified further in the database and networking documents.

---

## 13. Connectivity Detection

OFFGRID should track multiple connectivity states.

Example:

```text
INTERNET
LOCAL
MESH
LORA
NONE
```

These states should not be treated as mutually exclusive.

For example:

```text
Internet + Local
```

may both be available.

The application should select the appropriate transport based on availability and message requirements.

---

## 14. Security Boundary

Security-sensitive operations should be isolated from UI code.

Examples:
- Identity
- Group membership
- Location permissions
- Message encryption
- Emergency data
- Key management

Conceptually:

```text
UI
 ↓
Secure Service
 ↓
Crypto / Identity / Storage
```

The application must not implement custom cryptographic algorithms.

Established, reviewed cryptographic libraries/protocols should be used where encryption is required.

---

## 15. Future LoRa Architecture

LoRa is NOT part of the first technical milestone.

Future architecture:

```text
React Native
      ↓
Bluetooth
      ↓
Meshtastic-compatible device
      ↓
LoRa mesh
      ↓
Another LoRa device
      ↓
Bluetooth
      ↓
Another phone
```

The rest of OFFGRID should not need to be rewritten when LoRa is introduced.

This is one reason the communication layer must be abstracted.

---

## 16. Repository Structure

Initial target structure:

```text
OFFGRID/
│
├── CLAUDE.md
├── README.md
│
├── docs/
│   ├── 01-PRD.md
│   ├── 02-ARCHITECTURE.md
│   ├── 03-NETWORKING.md
│   ├── 04-DATABASE.md
│   ├── 05-SECURITY.md
│   ├── 06-UX-FLOWS.md
│   ├── 07-API-SPEC.md
│   ├── 08-ROADMAP.md
│   ├── 09-TESTING.md
│   └── 10-DECISIONS.md
│
├── src/
│   ├── screens/
│   ├── components/
│   ├── navigation/
│   ├── services/
│   │   ├── messaging/
│   │   ├── communication/   (D-043)
│   │   ├── location/
│   │   ├── maps/
│   │   ├── safety/          (D-041)
│   │   ├── sync/
│   │   ├── identity/
│   │   └── connectivity/
│   ├── database/
│   ├── store/
│   ├── types/
│   └── utils/
│
├── android/
├── ios/
└── tests/
```

The exact structure can evolve during implementation, but major changes must be documented.

---

## 17. Development Strategy

OFFGRID must be developed in small verified milestones.

### Milestone 0

```text
Project setup
```

### Milestone 1

```text
Three Android devices
        ↓
Device discovery
```

### Milestone 2

```text
Three Android devices
        ↓
Message exchange
```

### Milestone 3

```text
Multi-hop messaging
```

### Milestone 4

```text
GPS + local persistence
```

### Milestone 5

```text
Offline maps
```

### Milestone 6

```text
Private groups
```

### Milestone 7

```text
Safety + SOS
```

### Milestone 8

```text
Supabase synchronization
```

Each milestone must be physically tested before moving to the next major networking milestone.

---

## 18. Architectural Constraints

Claude Code and developers must follow these constraints:

1. Do not replace the offline-first architecture with a cloud-dependent design.
2. Do not put networking implementation inside UI components.
3. Do not add random dependencies without justification.
4. Do not implement LoRa before the phone-based proof of concept unless explicitly requested.
5. Do not fake offline functionality for demonstrations while claiming it is production networking.
6. Do not claim real-world mesh functionality without testing on physical devices.
7. Do not store all application state only in memory.
8. Do not treat last-known location as current location.
9. Do not expose private group information to nearby devices without authorization.
10. Do not introduce custom cryptography.
11. Major architectural changes must be documented in `10-DECISIONS.md`.

---

## 19. Architecture Acceptance Criteria

The architecture is acceptable when:

- Core functionality can operate without Internet.
- Local persistence exists independently of Supabase.
- Communication transports are abstracted.
- Native networking is isolated from UI.
- Location is independently managed.
- Offline maps do not require cloud connectivity.
- Future LoRa integration does not require rewriting the application.
- Security-sensitive functionality has clear boundaries.
- The system can be tested on physical Android devices.

---

## 20. Open Technical Decisions

The following must be finalized in `03-NETWORKING.md` and subsequent documents:

- Exact Android local communication technology
- Bluetooth vs Wi-Fi Direct vs other nearby-device APIs
- Multi-hop routing approach
- Discovery protocol
- Message encryption protocol
- Device identity/key exchange
- Offline map storage format
- SQLite library
- Exact Supabase schema
- Synchronization conflict strategy
- Background execution limitations
- Battery-management strategy
- iOS networking implementation

Do not allow an AI coding agent to silently make these decisions during implementation. Decisions must be documented first.
