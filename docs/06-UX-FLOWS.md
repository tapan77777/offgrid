# OFFGRID — UX Flows & User Experience

**Document:** `06-UX-FLOWS.md`  
**Version:** 0.1  
**Status:** Draft  
**Depends on:** `01-PRD.md`, `02-ARCHITECTURE.md`, `03-NETWORKING.md`, `04-DATABASE.md`, `05-SECURITY.md`

---

## 1. Purpose

This document defines the main user journeys and UX behavior for OFFGRID.

The goal is to make the application feel simple even though the underlying networking system is technically complex.

Core principle:

> **The user should think about their group and trip, not about networking technology.**

---

# 2. UX Principles

### Simple

A user should be able to understand the core experience without reading documentation.

### Offline-first

The UI must remain useful when Internet connectivity disappears.

### Honest status

Never show:

```text
Connected
```

when the application only has a stale/last-known state.

### Safety-focused

Emergency actions must be obvious and difficult to trigger accidentally.

### Minimal friction

A hiking group should be able to create and join a group quickly.

---

# 3. Primary Navigation

Initial navigation:

```text
Home
 │
 ├── Groups
 │     └── Group
 │           ├── Chat
 │           ├── Map
 │           ├── Members
 │           └── Safety      (hosts "I'm Safe" and "SOS" as distinct actions — D-041)
 │
 └── Profile / Settings
```

Public "Nearby" discovery is DEFERRED per **D-040** and is not a primary V1 navigation destination. Private device discovery remains an internal capability of the CommunicationManager (see §24 and D-040).

The exact navigation UI can be bottom tabs, stack navigation, or another pattern based on usability testing.

---

# 4. Initial App Launch

## First launch

```text
OFFGRID

Stay Connected
When the Network Disappears.

[ Get Started ]
```

The onboarding should briefly explain:

```text
💬 Chat without Internet
🗺️ Navigate offline
📍 Stay connected with your group
🆘 Safety tools when you need them
```

Avoid overwhelming users with technical networking details.

---

# 5. Permissions Onboarding

Permissions should be requested when their purpose is clear.

Potential permissions:

```text
Nearby devices
Location
Notifications
```

Example:

```text
Nearby Devices

OFFGRID uses nearby-device access
to communicate with your group
without Internet.

[ Allow ]
[ Not Now ]
```

If permission is denied:

```text
Nearby communication unavailable.

You can still use offline maps
and other available features.

[ Try Again ]
```

Never repeatedly show a permission dialog without user action.

---

# 6. Home Screen

Example:

```text
OFFGRID

Good morning, Tapan

[ + Create Group ]
[ Join Group ]

Your Groups

┌─────────────────────────┐
│ Khambeswari Hiking      │
│ 5 members               │
│ Last active 10 min ago  │
└─────────────────────────┘
```

The Home screen should prioritize active groups and current trips.

---

# 7. Create Group Flow

```text
Home
 ↓
Create Group
 ↓
Enter Group Name
 ↓
Optional trip details
 ↓
Create
 ↓
Group dashboard
 ↓
Invite members
```

Example:

```text
Create Group

Group name
[ Khambeswari Hiking ]

[ Create Group ]
```

After creation:

```text
Group Created

[ Show QR Code ]

Share this code with
your group members.
```

---

# 8. Group Invitation

The initial invitation mechanism should support:

```text
QR Code
+
Group Code
```

Example:

```text
KHAMBESWARI HIKING

Scan to Join

[ QR CODE ]

Code:
KHB-729

[ Share ]
```

Security rules from `05-SECURITY.md` apply.

---

# 9. Join Group Flow

```text
Home
 ↓
Join Group
 ↓
Scan QR
 ↓
Review Group
 ↓
Confirm
 ↓
Group Dashboard
```

Example:

```text
Join Group?

Khambeswari Hiking

Created by Tapan
5 members

[ Join Group ]
[ Cancel ]
```

The user should have a chance to verify the group before joining.

---

# 10. Group Dashboard

This is the main screen during a trip.

Example:

```text
KHAMBESWARI HIKING

🟢 Local connection
5 members

┌──────────────┐
│      MAP     │
└──────────────┘

┌──────────────┐
│     CHAT     │
└──────────────┘

Members
🟢 Tapan
🟢 Rahul
🟡 Amit
⚫ Priya

        [ I'M SAFE ]

           🆘
```

The exact visual design will be created later.

---

# 11. Connection Status UX

Connection status must be understandable.

Possible states:

```text
📶 Internet connected
```

```text
📡 Local connection
3 nearby devices
```

```text
🟡 Last connected 2 min ago
```

```text
⚫ No connection
```

Future:

```text
📡 Mesh
2 hops
```

```text
🛰️ LoRa
Connected
```

The UI should avoid technical terminology where it doesn't help the user.

---

# 12. Chat Flow

```text
Group
 ↓
Chat
 ↓
Type message
 ↓
Send
```

Example:

```text
KHAMBESWARI HIKING

Rahul:
Where are you guys?

Tapan:
We're near the stream.

[ Type a message... ] [Send]
```

---

# 13. Offline Chat UX

If Internet disappears:

```text
Internet connection lost
```

should NOT block chat.

Instead:

```text
Message
   ↓
Local storage
   ↓
Local communication
```

The UI can show:

```text
✓ Stored locally
```

or:

```text
📡 Sending via local connection
```

The user should not be required to manually switch into an "offline mode."

---

# 14. Message Status

Possible visual states:

```text
○ Sending
✓ Sent
✓✓ Delivered
🟡 Stored locally
⚠ Failed
```

Exact icons can be finalized during UI design.

Important:

> "Sent" must not imply that the recipient definitely received the message.

---

# 15. Map Flow

```text
Group
 ↓
Map
```

Map screen:

```text
┌─────────────────────────┐
│       OFFLINE MAP       │
│                         │
│       🟢 Tapan          │
│              🟢 Rahul   │
│                         │
│          📍             │
│       You are here      │
│                         │
└─────────────────────────┘

[ Members ]
[ Route ]
[ Download Area ]
```

---

# 16. Offline Map Download Flow

Before a trip:

```text
Map
 ↓
Download Area
 ↓
Select region
 ↓
Choose zoom/detail
 ↓
Download
 ↓
Ready Offline
```

Example:

```text
Khambeswari Area

Map size:
~120 MB

[ Download ]
```

After download:

```text
✓ Available Offline
```

---

# 17. Location Sharing UX

The user should clearly know whether location sharing is active.

Example:

```text
Location Sharing

🟢 Sharing with
Khambeswari Hiking

Last updated:
10:42 AM

[ Stop Sharing ]
```

If disabled:

```text
⚫ Location sharing off

[ Share with Group ]
```

---

# 18. Current vs Last Known Location

Map/member UI must distinguish:

```text
🟢 Current
```

from:

```text
🟡 Last seen 8 min ago
```

Never display:

```text
🟢 Current
```

when the data is stale.

---

# 19. Member List

Example:

```text
MEMBERS

🟢 Tapan
   Current

🟢 Rahul
   Current

🟡 Amit
   Last seen 4 min ago

⚫ Priya
   Offline
```

Optional future information:

```text
Battery
Connection
Distance
```

Only show information users actually need.

---

# 20. "I'm Safe" Flow

The safety button should be easily accessible.

```text
Group Dashboard
      ↓
[ I'M SAFE ]
      ↓
Confirmation
      ↓
Broadcast
```

Example:

```text
Send safety check-in?

You will share:
✓ You're safe
✓ Current/last-known location if enabled

[ I'M SAFE ]
[ Cancel ]
```

After sending:

```text
✅ You're marked SAFE

10:42 AM
```

---

# 21. SOS Flow

SOS should require deliberate interaction.

Example:

```text
Group Dashboard

          🆘

      HOLD FOR 3 SEC
```

After holding:

```text
EMERGENCY ALERT

This will notify your
OFFGRID group using
available communication paths.

Location:
✓ Available

[ SEND SOS ]
[ CANCEL ]
```

After sending:

```text
🆘 SOS ACTIVE

Your group has been notified
if a communication path was available.

10:47 AM

[ CANCEL SOS ]
```

The UI must not claim successful delivery unless delivery has actually been confirmed.

---

# 22. Incoming SOS

Example:

```text
🆘 EMERGENCY

Tapan needs help.

Last known location:
2 minutes ago

[ OPEN MAP ]
[ ACKNOWLEDGE ]
```

The UI must distinguish:

```text
SOS received
```

from:

```text
SOS acknowledged
```

---

# 23. No Communication State

If there is no Internet and no reachable local peer:

```text
⚫ No communication path

Messages will remain stored
on this device until a path
becomes available.
```

For SOS:

```text
⚠ No communication path

SOS saved locally.

It will attempt transmission
when communication becomes
available.
```

This is a critical safety behavior.

---

# 24. Nearby Screen

Per **D-040** (see `10-DECISIONS.md`), public "Nearby" discovery is DEFERRED and is **not** a primary V1 navigation destination. The first V1 prioritizes private groups.

**Private device discovery** remains an internal capability of the CommunicationManager — it is used to find OFFGRID peers for authorized group communication, not to expose a public discovery surface to the user. Any diagnostics for private connections belong under Settings → Connection Diagnostics (§27), not as a top-level tab.

A future Nearby experience may allow users at the same event/place to discover a public local room. That experience is out of scope for V1.

For now, the UX must not expose private group information simply because devices are nearby.

Possible future (deferred — do not implement in V1):

```text
Nearby

3 OFFGRID devices nearby

Public rooms
──────────────

Khambeswari Event
12 people

[ Join ]
```

This must remain disabled until the privacy/security model is finalized and D-040 is superseded by an explicit new decision.

---

# 25. Profile

Basic profile:

```text
PROFILE

Tapan
[ Profile Photo ]

OFFGRID ID
XXXX-XXXX

Location sharing
Notifications
Privacy
Devices
About
```

Keep V1 profile simple.

---

# 26. Settings

Potential settings:

```text
Settings

Account
Privacy
Location
Notifications
Maps
Offline communication
Battery
Devices
About OFFGRID
```

Advanced networking information can be placed under:

```text
Connection Diagnostics
```

rather than exposing it on the main UI.

---

# 27. Connection Diagnostics

Useful for troubleshooting.

Example:

```text
CONNECTION

Internet       ✓
Wi-Fi P2P      ✓
Bluetooth      ✓
Peers          3
Mesh           Experimental
LoRa           Not connected
```

This screen may be hidden behind advanced settings in the consumer version.

---

# 28. Trip Mode

Future UX can introduce a dedicated trip mode.

Example:

```text
START TRIP

Khambeswari Hiking

Map:
✓ Downloaded

Members:
5

Location sharing:
✓ Enabled

Communication:
✓ Local

[ START TRIP ]
```

During an active trip, the app can optimize:
- Discovery
- Location updates
- Battery behavior
- Safety notifications

---

# 29. End Trip

At the end:

```text
Trip Complete

Khambeswari Hiking

Duration:
4h 12m

Members:
5

Safety:
All checked in

[ END TRIP ]
```

Future versions may provide trip history.

---

# 30. Offline-First UX Rule

Every major feature should have a defined offline behavior.

| Feature | Offline behavior |
|---|---|
| Home | Works |
| Groups | Works |
| Chat | Local + nearby transport |
| Map | Works if downloaded |
| GPS | Works |
| Members | Last-known state |
| I'm Safe | Local + available transport |
| SOS | Local + available transport |
| Profile | Works |
| Cloud backup | Waits for connection |

---

# 31. Error UX

Errors should explain what happened and what the user can do.

Bad:

```text
NETWORK_ERROR_503
```

Better:

```text
No Internet connection.

OFFGRID will continue using
available local communication.
```

If no local communication exists:

```text
No nearby OFFGRID devices are
currently reachable.

Your message is saved locally.
```

---

# 32. Loading States

The app should avoid indefinite loading.

Bad:

```text
Loading...
```

Better:

```text
Checking nearby devices...
```

or:

```text
Waiting for communication path...
```

with an appropriate fallback.

---

# 33. Accessibility

V1 should consider:

- Large tap targets
- Readable text
- Good contrast
- Screen reader labels
- Clear emergency controls
- Non-color-only status indicators

For example:

Do not rely only on:

```text
green = connected
red = offline
```

Use text/icons too.

---

# 34. Navigation Rules

The user should always be able to quickly access:

```text
Current Group
Chat
Map
Members
Safety
SOS
```

The SOS action should not require navigating through several menus.

---

# 35. UX State Model

Important global states:

```text
ONLINE
LOCAL_CONNECTED
OFFLINE_STORED
NO_CONNECTION
SYNCING
SYNC_ERROR
SOS_ACTIVE
TRIP_ACTIVE
```

The UI should respond to these states consistently.

---

# 36. V1 UX Acceptance Criteria

A first-time user should be able to:

1. Open OFFGRID.
2. Create a group.
3. Generate an invitation.
4. Join from another phone.
5. See group members.
6. Download an offline map.
7. Start a trip.
8. Send a message.
9. Continue using chat after Internet disappears.
10. View their GPS position offline.
11. See current/last-known member locations.
12. Send an "I'm Safe" check-in.
13. Trigger an SOS intentionally.
14. Understand when communication is unavailable.
15. End the trip.

---

# 37. Design Direction

The visual identity should communicate:

```text
Outdoor
Reliable
Modern
Calm
Adventure
Safety
```

Avoid making the app look like a military/radio control panel.

The technical complexity should stay behind a simple consumer interface.

---

# 38. Open UX Decisions

Before final UI implementation, decide:

1. Bottom-tab vs custom navigation
2. Exact onboarding flow
3. Whether account creation is required
4. Location-sharing default
5. Exact group invitation experience
6. Trip mode in V1 or later
7. Voice messages in V1 or later
8. Nearby public mode in V1 or later
9. Exact map provider/offline map UI
10. Final visual design system

These decisions should be recorded in `10-DECISIONS.md`.
