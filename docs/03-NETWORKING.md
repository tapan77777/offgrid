# OFFGRID — Networking Specification

**Document:** `03-NETWORKING.md`  
**Version:** 0.1  
**Status:** Draft / Engineering Decision Document  
**Depends on:** `01-PRD.md`, `02-ARCHITECTURE.md`

---

## 1. Purpose

This document defines how OFFGRID devices discover each other, establish local communication, exchange messages, relay messages, handle disconnections, and eventually support long-range communication.

Networking is the most technically critical part of OFFGRID.

The implementation must be based on tested Android capabilities rather than assumptions.

---

# 2. Core Networking Goal

The first technical goal is:

> **Three Android phones must exchange OFFGRID messages without Internet access.**

The initial test must not depend on:
- Mobile data
- Internet
- Cloud services
- A home/office Wi-Fi router

The phones may use Android-supported peer-to-peer/local wireless technologies.

---

# 3. Important Architecture Decision

OFFGRID will NOT hard-code the application to one transport.

Instead:

```text
                    CommunicationManager
                           │
             ┌─────────────┼─────────────┐
             │             │             │
        Internet        Local P2P      Future LoRa
             │             │             │
          Supabase    Android transport  Mesh
```

The messaging layer should operate on a transport abstraction.

Example conceptual interface:

```text
Transport
├── connect()
├── disconnect()
├── discover()
├── send()
├── receive()
├── getPeers()
└── getStatus()
```

The exact TypeScript/Kotlin interfaces will be defined during implementation.

---

# 4. Initial Android Transport Strategy

## 4.1 Primary candidate: Wi-Fi Direct / Wi-Fi P2P

For the first Android proof of concept, **Wi-Fi Direct (Wi-Fi P2P)** is the primary transport to investigate and test.

Android officially provides Wi-Fi P2P APIs that allow nearby devices to connect directly without an access point or Internet connection. Android documents peer discovery, connection establishment, group creation, and socket-based communication. citeturn0search1turn0search2

Wi-Fi Direct can provide a higher-throughput local connection and generally greater range than Bluetooth. citeturn0search1

Android also supports Wi-Fi Direct service discovery, allowing applications to advertise and discover services on nearby devices without a conventional network. citeturn0search0

### Important limitation

Wi-Fi Direct is **not automatically a general-purpose multi-hop mesh network**.

OFFGRID must not assume:

```text
A ↔ B ↔ C
```

will automatically work as a mesh simply because Wi-Fi Direct exists.

The first prototype must test the actual topology and Android behavior on physical devices.

---

# 5. Bluetooth / BLE Role

Per **D-037** (see `10-DECISIONS.md`), BLE's **role** in OFFGRID is ACCEPTED as a **supporting / signaling** transport. BLE's **implementation** (advertisement format, GATT design, discovery cadence, cross-vendor behavior) remains EXPERIMENTAL and must be validated on physical devices.

Accepted uses of BLE:
- Nearby peer discovery
- Lightweight signaling
- Device identification
- Potential transport fallback
- Bootstrapping another connection (e.g., handing off to Wi-Fi P2P)

Android provides Bluetooth APIs and nearby-device permissions for modern Android versions. citeturn0search9

BLE is **NOT** the primary V0 messaging transport and must NOT be used for high-volume or high-throughput message payloads (D-037). Benchmarking is required before any expansion of its role.

The networking layer must keep Bluetooth modular so it can be enabled as needed.

---

# 6. Wi-Fi Aware

Android also provides Wi-Fi Aware (Neighbor Awareness Networking), which can allow compatible Android 8.0+ devices to discover and connect directly without another connectivity infrastructure. citeturn0search4

However, device support and platform behavior must be verified before making it a required OFFGRID transport.

Therefore:

```text
Wi-Fi Aware
     ↓
Optional / compatibility-tested transport
```

It is NOT a V0 requirement.

---

# 7. Local-Only Hotspot

Android supports local-only hotspots that allow devices to communicate locally without Internet access. citeturn0search3

This may be useful for certain OFFGRID architectures or testing scenarios.

However, it should not be treated as the same thing as a true decentralized mesh.

It is therefore an optional transport/engineering technique rather than the core OFFGRID mesh model.

---

# 8. Recommended V0 Transport Experiment

V0 should test these in a controlled order.

### Test A — Wi-Fi Direct

```text
Phone A
   ↕
Phone B
```

Test:
- Discovery
- Connection
- Socket communication
- Message transmission
- Disconnect/reconnect

### Test B — Three devices

```text
Phone A
   ↕
Phone B
   ↕
Phone C
```

Determine what topology is actually possible with the selected Android implementation.

### Test C — Bluetooth/BLE discovery

Test:
- Device discovery
- OFFGRID service identification
- Device identity exchange

### Test D — Combined approach

Investigate:

```text
BLE
 ↓
Discovery / bootstrap
 ↓
Wi-Fi P2P
 ↓
Higher-bandwidth data
```

Only adopt this combined architecture if physical testing shows that it provides a meaningful advantage.

---

# 9. Device Identity

Every OFFGRID installation should have a stable application-level identity.

Conceptually:

```text
User ID
   +
Device ID
   +
Public identity/key material
```

Do NOT use a device's hardware MAC address as the application's permanent identity.

The application should generate its own identity.

---

# 10. Peer Discovery

A device should advertise enough information for another OFFGRID installation to recognize it as an OFFGRID peer.

Conceptually:

```text
OFFGRID Peer Advertisement

protocol: OFFGRID
version: 1
deviceId: xxx
capabilities:
  messaging
  location
  relay
```

Do not advertise private information unnecessarily.

A nearby device should not automatically receive:
- User's full profile
- Group membership
- Location
- Private messages

Discovery and authorization are separate steps.

---

# 11. Private Group Authorization

Finding a nearby OFFGRID device does NOT mean that the device can access a group.

Example:

```text
Phone A discovers Phone B
        ↓
OFFGRID peer
        ↓
Is B authorized for this group?
        │
      NO → No group data
        │
      YES
        ↓
Group communication allowed
```

This distinction is critical.

---

# 12. Message Model

Messages should have a globally unique application-level ID.

Conceptual format:

```json
{
  "messageId": "msg_xxx",
  "groupId": "group_xxx",
  "senderId": "user_xxx",
  "deviceId": "device_xxx",
  "type": "text",
  "payload": "...",
  "createdAt": 0,
  "ttl": 5,
  "hopCount": 0
}
```

Additional metadata may be required during implementation.

---

# 13. Duplicate Prevention

Mesh or relay systems can deliver the same message multiple times.

OFFGRID must deduplicate using `messageId`.

Example:

```text
A → B → C
A → D → C
```

C may receive the same message twice.

C must display:

```text
1 message
```

not:

```text
2 messages
```

The local message store should retain sufficient message identity/state to prevent repeated processing.

---

# 14. TTL / Hop Limit

Every relayed message must have a maximum forwarding limit.

Example:

```text
TTL = 5

A → B
    TTL 4
      ↓
    C
    TTL 3
      ↓
    D
    TTL 2
```

When TTL reaches zero, the device must not forward the message further.

This prevents uncontrolled propagation.

The exact default value should be determined through testing.

---

# 15. Store-and-Forward

OFFGRID should support store-and-forward behavior.

Example:

```text
A sends message
      ↓
B receives
      ↓
B stores message
      ↓
B temporarily loses connection
      ↓
B later meets C
      ↓
B forwards message to C
```

This is important for real-world group movement.

The local database therefore needs a networking/synchronization queue.

---

# 16. Message Delivery States

A message may have states such as:

```text
LOCAL
PENDING
SENT
DELIVERED
FAILED
EXPIRED
```

These states must not be confused.

For example:

```text
SENT
```

does not necessarily mean:

```text
RECIPIENT RECEIVED
```

---

# 17. Connection State

The application should maintain a local representation of peer state.

Example:

```text
Peer
├── deviceId
├── transport
├── connected
├── lastSeen
├── signal/quality metadata if available
└── capabilities
```

The UI can simplify this into:

```text
🟢 Connected
🟡 Last seen
⚫ Offline
```

---

# 18. Relay Architecture

OFFGRID's long-term design should support application-level relaying.

Conceptually:

```text
       A
      /      B   D
      \ /
       C
```

A message may travel through multiple peers.

However, the exact physical topology must be determined by the underlying Android transport.

The application must NOT assume that any two phones can simultaneously maintain arbitrary peer links.

Therefore:

> **Mesh routing is an application-level goal; physical transport topology is platform-dependent and must be tested.**

---

# 19. Routing Strategy — Initial

V0 should use a simple approach.

Do NOT begin with a sophisticated routing algorithm.

Initial strategy:

```text
1. Discover peers.
2. Establish supported local connections.
3. Exchange peer/capability information.
4. Forward eligible messages.
5. Deduplicate using messageId.
6. Decrement TTL.
7. Store messages locally.
8. Stop forwarding when TTL expires.
```

More advanced routing can be added after physical tests.

---

# 20. Security

All private group communication must eventually use authenticated/encrypted communication.

The networking layer must distinguish:

```text
Discovery
    ≠
Authorization
    ≠
Encryption
    ≠
Message routing
```

Do not invent cryptographic algorithms.

Use established cryptographic primitives/protocols after the security design is finalized in `05-SECURITY.md`.

---

# 21. Internet + Offline Transition

OFFGRID must handle connectivity changes continuously.

Example:

```text
Internet available
        ↓
User sends message
        ↓
Cloud + local delivery
```

Then:

```text
Internet disappears
        ↓
Local communication continues
```

Then:

```text
Internet returns
        ↓
Pending local data syncs
```

The user's chat history should remain coherent across these transitions.

---

# 22. Supabase Is Not Part of Local Delivery

This is a strict requirement.

This is WRONG:

```text
Message
 ↓
Supabase
 ↓
Recipient
```

when the app is offline.

The correct architecture is:

```text
Message
 ↓
SQLite
 ↓
Local transport
 ↓
Recipient

AND, separately when Internet exists:

SQLite
 ↓
Supabase sync
```

---

# 23. Battery Considerations

OFFGRID must not continuously perform maximum-power discovery.

The networking layer should eventually support:
- Discovery intervals
- Connection timeouts
- Backoff
- Idle behavior
- Group-trip active mode
- Background limitations

Battery behavior will be measured during physical testing.

---

# 24. Android Permissions

Modern Android versions require appropriate nearby-device permissions for Wi-Fi/Bluetooth functionality.

For Android 13+ Wi-Fi-related APIs, Android documents `NEARBY_WIFI_DEVICES`; Bluetooth functionality also has nearby-device permissions depending on the API and target version. citeturn0search6turn0search9

Permission requests must:
- Explain why they are needed
- Be requested only when required
- Fail gracefully when denied
- Never silently assume permission

---

# 25. Failure Handling

The networking layer must expect failure.

Examples:

```text
Peer disappears
Connection fails
Bluetooth unavailable
Wi-Fi P2P unavailable
Permission denied
Device doesn't support feature
App is backgrounded
Battery saver changes behavior
User disables radio
```

The app should degrade gracefully.

Example:

```text
Mesh unavailable
      ↓
Try another supported transport
      ↓
If none available:
      ↓
Store locally
      ↓
Sync when possible
```

---

# 26. V0 Networking Test Matrix

| Test | Requirement |
|---|---|
| 2 phones discover | Required |
| 2 phones connect | Required |
| Text message transfer | Required |
| Disconnect/reconnect | Required |
| 3 phones | Required |
| Duplicate prevention | Required |
| TTL | Required |
| Local persistence | Required |
| No Internet | Required |
| GPS independent of Internet | Required |
| Background behavior | Investigate |
| Battery usage | Measure |
| Multi-hop | Prototype/test |
| iOS | Not V0 |
| LoRa | Not V0 |

---

# 27. V0 Acceptance Criteria

V0 is successful only if physical devices demonstrate the intended behavior.

A simulator/demo/mock network is NOT sufficient.

Minimum:

```text
3 physical Android phones

No Internet

        ↓

OFFGRID Peer Discovery

        ↓

Private test group

        ↓

Message exchange

        ↓

Local persistence

        ↓

Disconnect/reconnect

        ↓

Duplicate prevention
```

If the intended multi-hop topology cannot be achieved with the first transport, document the limitation and evaluate another architecture rather than pretending the mesh works.

---

# 28. Future LoRa / Meshtastic

LoRa is a later transport.

Future architecture:

```text
OFFGRID App
      │
   Bluetooth
      │
      ▼
Meshtastic Device
      │
      ▼
LoRa Mesh
      │
      ▼
Another Meshtastic Device
      │
   Bluetooth
      │
      ▼
Another OFFGRID Phone
```

The application-level messaging model should be designed so that LoRa can become another transport rather than requiring a rewrite of chat/group/location features.

---

# 29. Important Engineering Rule

**Never tell the user that OFFGRID has "mesh networking" merely because two phones exchanged a message.**

The project must distinguish:

```text
Direct P2P
```

from:

```text
Multi-hop mesh
```

and:

```text
Store-and-forward network
```

These are different capabilities.

Each must be physically tested and documented separately.

---

# 30. Open Decisions

The following remain intentionally unresolved until V0 experiments:

1. Exact Wi-Fi Direct topology for 3+ devices
2. Whether BLE is required for discovery/bootstrap
3. Whether Wi-Fi Aware provides useful additional coverage
4. Best local socket/protocol design
5. Multi-hop routing strategy
6. Background execution strategy
7. Battery optimization
8. Message encryption protocol
9. Key exchange mechanism
10. Maximum practical group size
11. Maximum practical hop count
12. Device compatibility matrix

These decisions must be recorded in `10-DECISIONS.md`.

---

## Current Networking Decision Summary

```text
V0

Primary transport to test:
        Wi-Fi Direct / Wi-Fi P2P

Discovery / supporting transport:
        BLE (investigate)

Optional compatibility transport:
        Wi-Fi Aware

Local-only hotspot:
        Experimental option

Internet:
        Supabase synchronization only

Long-range:
        LoRa / Meshtastic later

Mesh:
        Must be physically proven
```
