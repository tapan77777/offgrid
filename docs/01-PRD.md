# OFFGRID — Product Requirements Document

**Document:** `01-PRD.md`  
**Version:** 0.1  
**Status:** Draft  
**Product:** OFFGRID  
**Tagline:** Stay Connected When the Network Disappears.

---

## 1. Product Overview

OFFGRID is an offline-first mobile application designed to help groups communicate, coordinate, navigate, and stay safe when conventional internet/mobile connectivity is unavailable.

The primary experience is:

> **People + Map + Chat + Safety — even when there is no internet.**

Initial focus:
- Hiking
- Trekking
- Camping
- Adventure travel
- Remote trips
- Group exploration

Potential future use cases:
- Festivals
- Stadiums
- Large events
- Network outages
- Emergency/network-loss scenarios
- Remote work sites
- Schools and organizations

---

## 2. Problem

When a group goes somewhere with poor or nonexistent network coverage:
- Members can become separated.
- Messaging can stop working.
- Live location can stop updating.
- People may not know where other members are.
- Online maps may become unusable.
- Emergency communication can become difficult.
- Group coordination becomes dependent on physical proximity.

OFFGRID aims to combine:

```text
Offline Communication
        +
Offline Maps
        +
Group Location
        +
Safety
        +
Online Sync
```

into one consumer-friendly application.

---

## 3. Product Vision

Build a communication system where:

> **Losing internet connectivity does not mean losing your group.**

Conceptually:

```text
Internet available
        ↓
Internet communication

Internet unavailable
        ↓
Local device communication

Devices farther apart
        ↓
Mesh / relay

Remote environments
        ↓
LoRa / Meshtastic
```

The user should not need to understand the underlying networking technology.

---

## 4. Target Users

### Primary Users

**Hikers & Trekkers**

People going into forests, mountains, waterfalls and areas with weak network coverage.

Example: a group of friends hiking to Khambeswari Waterfall.

They need:
- Offline map
- Group chat
- Member locations
- Safety check-ins
- Emergency communication

**Adventure Travelers**

People travelling in groups to remote destinations.

**Campers**

Groups staying in areas with unreliable connectivity.

### Secondary / Future Users

- Event attendees
- Festival visitors
- Stadium audiences
- Schools
- Outdoor organizations
- Trekking companies
- Adventure operators
- Remote work teams
- Disaster-response organizations

These are future expansion markets, not necessarily V1.

---

## 5. Core Product Principles

### 1. Offline First

The app should assume connectivity may disappear.

OFFGRID is an offline-first application with online synchronization, not an online application with an optional offline mode.

### 2. Automatic Connectivity

The user should not need to manually select Internet, Bluetooth, Wi-Fi, mesh, or LoRa.

The system should eventually select the best available communication method automatically.

### 3. Privacy First

Location and group information should not automatically be visible to random nearby users.

### 4. Simple UX

Users should not need to understand:
- Bluetooth mesh
- LoRa
- Packet routing
- TTL
- Synchronization

### 5. Safety Over Features

Emergency functionality must be clearly separated from normal messaging and must communicate its limitations honestly.

---

## 6. V1 Core Features

### 6.1 User Identity

Users have a basic identity inside OFFGRID.

Example:

```text
Name: Tapan
Profile photo: optional
Device ID: unique
User ID: unique
```

The app should retain a usable local identity when offline.

### 6.2 Create Group

Users can create a private group.

Example:

```text
Create Group

Group Name:
[ Khambeswari Hiking ]

[ Create Group ]
```

The app generates a method for others to join, initially via QR/code.

### 6.3 Join Group

Users can join through:
- QR scan
- Group code

Only invited users should become members of a private group.

### 6.4 Group Dashboard

The group dashboard should provide access to:
- Chat
- Map
- Members
- Safety check-in
- SOS
- Connection status

### 6.5 Offline Messaging

Users should be able to exchange messages without Internet connectivity.

Messages must be stored locally and eventually synchronize when connectivity returns.

### 6.6 Mesh Communication

OFFGRID should eventually support multi-hop communication.

Example:

```text
Phone A
   ↓
Phone B
   ↓
Phone C
```

If A cannot directly communicate with C, B may relay the message.

The networking layer must prevent:
- Infinite forwarding
- Duplicate messages
- Message loops
- Uncontrolled network traffic

Exact technology will be finalized in `03-NETWORKING.md`.

### 6.7 Location Sharing

Members may share their location with the private group.

The app must distinguish clearly between:
- Current location
- Last-known location

An old location must never be presented as current.

### 6.8 Offline Maps

Users should be able to download map areas before a trip.

Once downloaded, the map must remain usable without Internet.

GPS positioning must continue to work without mobile Internet.

### 6.9 "I'm Safe"

A member can send a safety check-in.

Example:

```text
✅ I'M SAFE
10:42 AM
```

The check-in should work through the available communication system.

### 6.10 SOS / Emergency

The app should provide an emergency function.

Example:

```text
🆘

HOLD FOR 3 SEC

EMERGENCY
```

After confirmation, OFFGRID broadcasts an emergency message through available communication paths.

The app must NOT claim guaranteed emergency delivery. If no communication path exists, the app cannot transmit an SOS.

### 6.11 Connection Status

The app should show understandable connection information, for example:

```text
📶 Internet
Connected
```

```text
📡 Local
3 nearby devices
```

```text
🟡 Last connection
2 minutes ago
```

Future states may include mesh hops and LoRa.

---

## 7. Privacy Requirements

### Private Groups

Nearby strangers must not automatically see:
- Name
- Profile
- Location
- Messages

unless the user explicitly participates in a public/local experience.

### Location

Location sharing must be:
- Explicit
- Clear to the user
- Revocable
- Controlled by group/user settings

---

## 8. V1 Non-Goals

Do NOT include these in V1 unless explicitly approved later:

- Social media feed
- Public follower system
- Video calling
- Payments
- Marketplace
- Advertising system
- Public posts
- Complex profiles
- Full event platform
- Custom LoRa hardware
- Enterprise dashboard
- AI assistant

These may be considered in later versions.

---

## 9. V0 — Technical Proof of Concept

Before building the full product, prove the hardest technical requirement.

### Test Environment

Three physical Android phones.

No:
- Mobile Internet
- Wi-Fi Internet
- Cloud dependency

Test:

```text
Phone A discovers B
        ↓
B discovers C
        ↓
A sends message
        ↓
B receives
        ↓
C receives through relay
```

Also test:
- GPS
- Local storage
- Last-known location
- Duplicate message prevention
- Temporary disconnection/reconnection

### V0 Success Criteria

OFFGRID passes V0 when:
- Three physical Android devices can discover each other.
- A private group can be established.
- Messages can travel between devices without Internet.
- Duplicate messages are not displayed repeatedly.
- Messages survive temporary disconnection.
- GPS location can be stored locally.
- The application does not falsely report connectivity.

---

## 10. V1 Success Criteria

The V1 MVP should allow a group to:

```text
Create group
      ↓
Join group
      ↓
Download map
      ↓
Start trip
      ↓
Communicate offline
      ↓
See group members
      ↓
Share location
      ↓
Send "I'm Safe"
      ↓
Trigger SOS
      ↓
Reconnect to Internet
      ↓
Synchronize data
```

---

## 11. Future Roadmap

### V2
- iOS
- Improved local networking
- Better synchronization
- Improved offline maps
- Better group management

### V3
- LoRa / Meshtastic
- Long-range communication

Conceptually:

```text
Phone
 ↓ Bluetooth
LoRa device
 ↓
Long-range mesh
 ↓
LoRa device
 ↓ Bluetooth
Phone
```

### V4
Potential expansion into:
- Festivals
- Stadiums
- Large events
- Organizations
- Adventure companies
- Remote teams

---

## 12. Business Direction

OFFGRID is intended to become a commercial product.

Potential revenue models to investigate later:
- Consumer premium
- Adventure / trekking businesses
- Events
- Organizations
- Supported hardware

Pricing and revenue projections are deliberately outside this technical MVP document.

---

## 13. MVP Definition

The simplest description of OFFGRID V1 is:

> **A private group hiking application that lets people chat, share location, navigate offline, check in as safe, and communicate locally when Internet connectivity disappears.**

This is the product anchor for V1.

---

## 14. Open Product Decisions

Before this PRD becomes final, confirm:

1. **V1 target:** Hiking/trekking groups first, rather than festivals/stadiums immediately?
2. **Initial group size:** 5–20 people, or larger from day one?
3. **Nearby mode:** Private groups only in V1, or include a public/local discovery mode?
4. **Voice messages:** Text-only initially, or include offline voice messages?
5. **Accounts:** No account required for the offline experience, with accounts only for cloud backup/sync?

These decisions should be finalized before architecture is locked.
