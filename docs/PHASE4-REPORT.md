# OFFGRID — Phase 4B Implementation Report

**Document:** `PHASE4-REPORT.md`
**Version:** 0.1 (implementation/build checkpoint — no physical test run yet)
**Status:** Implementation complete; awaiting 3-phone physical run.
**Depends on:** `PHASE4-PLAN.md`, `10-DECISIONS.md` D-068, D-069, D-070
**Phase 4A checkpoint:** commit `ed75a7f` (72/72 tests, D-068/069/070 ACCEPTED)

---

## 1. Purpose

Phase 4A landed the design and mock-tested `MessageEnvelope` + `RelayRouter`
(commit `ed75a7f`, 72 tests). Phase 4B integrates that engine with the real
`WifiP2pTransport` so a 3-device physical relay (A → B → C, Internet OFF) can
be run — but **without** rewriting `SocketWorker`, **without** simultaneous GO
fanout, and **without** starting Phase 4.5. The report below documents the
smallest set of changes that took Phase 4A from mock-only to buildable release
APK ready for physical trial, and lists the exact procedure to run that
trial when the three phones are on the same table.

---

## 2. Behaviours Implemented (mapped to the user's spec)

| # | Behaviour                                                          | Where                                           | Test evidence |
|---|--------------------------------------------------------------------|-------------------------------------------------|---|
| 1 | Real transport receives a `MessageEnvelope`                        | `WifiP2pTransport` → `CommunicationManager` co-subscribed with `RelayRouter` on the same transport | `phase4b.test.ts` (env co-existence) |
| 2 | Pass envelope through `RelayRouter`                                | `DiagnosticsScreen` instantiates `RelayRouter` alongside `CommunicationManager` | `relay.test.ts` (all 8 tests still green) |
| 3 | Queue a relay when the next connection is unavailable              | `RelayRouter.attemptForward` (unchanged) | `relay.test.ts` behaviour #3+#4, #5 |
| 4 | Forward on the next valid sequential connection                    | `RelayRouter.drainQueue` (now also triggered by `payloadReceived`) | `relay.test.ts` behaviour #5+#6+#7 |
| 5 | Preserve the original message ID                                   | `RelayRouter.handlePayload` (uses spread; id untouched) | `relay.test.ts` behaviour #5+#6+#7, #8 |
| 6 | Decrement TTL                                                      | `RelayRouter.handlePayload` line: `ttl: envelope.ttl - 1` | `relay.test.ts` behaviour #3+#4, #5+#6+#7 |
| 7 | Increment hopCount                                                 | `RelayRouter.handlePayload` line: `hopCount: envelope.hopCount + 1` | `relay.test.ts` behaviour #3+#4, #5+#6+#7 |
| 8 | Prevent duplicate forwarding                                       | `MessageRepo.insertMessageIfAbsent` (D-014) + `receivedFromAddress` exclusion in `attemptForward` | `relay.test.ts` behaviour #8, #10 |
| 9 | Deliver the message to the destination device                      | `RelayRouter.handlePayload` emits `envelopeDelivered` when `isForMe(envelope)` | `relay.test.ts` behaviour #5+#6+#7 |

Total automated tests after Phase 4B: **77 (up from 72 in the 4A checkpoint)**.

---

## 3. Files Changed

### TypeScript / JS
- `src/services/communication/RelayRouter.ts` — treat `payloadReceived.fromAddress` as authoritative for the peer identity on the one active socket, and only take `groupOwnerAddress` from `connectionChanged` when we are the CLIENT. Drains the queue when the peer identity changes.
- `src/services/communication/CommunicationManager.ts` — before emitting `payloadRejected`, silently ignore payloads that decode as a valid `MessageEnvelope`. This lets the router and the manager subscribe to the same transport without noise. Imports `decodeEnvelope`.
- `src/store/communicationStore.ts` — add `env-sent`, `env-received`, `env-forwarded`, `env-queued`, `env-delivered`, `env-expired`, `env-rejected` to `DiagnosticsLogKind` so the diagnostics event log can render envelope events distinctly.
- `src/screens/DiagnosticsScreen.tsx` — instantiate a `RelayRouter` on the same `WifiP2pTransport` instance the `CommunicationManager` uses. New "Phase 4B · Relay envelope" card with destination-deviceId input, text preview, "Send envelope to destination", and "Broadcast envelope" actions. Router events feed the shared log with the new `env-*` kinds.

### Kotlin (native)
- `android/app/src/main/java/com/offgrid/p2p/OffgridP2pModule.kt` — `connectToPeer` now sets `WifiP2pConfig.groupOwnerIntent = 0`. See §4 for why this was the minimum native change required.

### Tests
- `__tests__/communication/phase4b.test.ts` — NEW. 5 tests:
  - RelayRouter learns `currentPeerAddress` from `payloadReceived` when acting as GO (real-Android semantic where `groupOwnerAddress` is our own IP).
  - RelayRouter does not loop a received envelope back to its sender when we are GO.
  - RelayRouter does not set `currentPeerAddress` from `connectionChanged` when we are GO (send must queue until a frame arrives from the peer).
  - CommunicationManager silently ignores a valid `MessageEnvelope` frame (no `payloadRejected`).
  - CommunicationManager still emits `payloadRejected` for genuinely malformed frames.

### Docs
- `docs/PHASE4-REPORT.md` — this file.

Nothing in `SocketWorker.kt`, `WifiP2pBroadcastReceiver.kt`, `OffgridP2pPackage.kt`, `nativeSurface.ts`, `WifiP2pTransport.ts`, or `codec.ts` was touched.

---

## 4. Native Change Rationale (explained *before* it was made)

**Change:** in `OffgridP2pModule.connectToPeer`, add `groupOwnerIntent = 0` to
the `WifiP2pConfig`.

**Why this was the minimum needed:**

- `SocketWorker` is single-socket by construction: whichever side is elected
  group owner (GO) runs a `ServerSocket` and only knows the peer's IP after
  `accept()` returns; the other side is a `Socket` client that opens
  proactively toward `groupOwnerAddress`.
- Under D-069 sequential handoff, whichever device initiates
  `connectToPeer(...)` is the one that just detached from its previous
  neighbour and holds the queued envelope. If that device is elected GO in
  the next group, it will accept a socket rather than open one — introducing
  a race between `WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION` firing
  (`groupFormed=true`) and `SocketWorker.installSocket` completing. In that
  window, any `router.drainQueue()` call would invoke `transport.sendPayload`
  → native `sendPayload` → `E_NO_SOCKET` → envelope silently dropped.
- Setting `groupOwnerIntent = 0` on the config biases the initiating device
  toward the CLIENT role. The initiator then opens the socket proactively,
  and `groupOwnerAddress` on this side reliably points to the remote peer.
  Both problems disappear without any change to `SocketWorker`, without
  simultaneous GO fanout, and without a multi-socket architecture.
- Two lines of Kotlin, in one method, gated by a single-line kdoc comment
  explaining the reason.

**Alternative considered and rejected:** teach `SocketWorker` to buffer sends
until `installSocket` completes. This crosses into a rewrite of the transport
layer (multi-state socket lifecycle, buffer bounds, thread coordination) —
exactly what the user's Phase 4B rules forbid.

**Compatibility:** Phase 3 A ↔ B still works — the initiator becomes CLIENT
(as it already did on Motorola Edge 50 Neo / iQOO Neo7 Pro during the Phase 3
physical PASS) and the responder becomes GO. No user-visible difference.

---

## 5. JS Change Rationale

### 5.1 `RelayRouter.currentPeerAddress` sourced from `payloadReceived.fromAddress`

Before Phase 4B, the router set `currentPeerAddress` from
`connectionChanged.snapshot.groupOwnerAddress`. Under real Android GO
semantics this is *our own* IP, not the peer's. That would have caused two
regressions in the field:

1. **Loop:** on the GO side, a forwarded envelope's target
   (`currentPeerAddress = our_ip`) would differ from `receivedFromAddress =
   peer_ip`, so the router would try to send it out the only active socket —
   right back to the peer that sent it. `insertMessageIfAbsent` would keep
   the DB honest but the wire traffic is wasted and the choreography does
   not match the approved D-069 algorithm.
2. **Wrong forward target:** every drain would carry the wrong destination
   label in the `envelopeForwarded` event log.

Fix: on `payloadReceived`, `event.fromAddress` is by definition the IP of the
peer on the other end of our one active socket. Use it as ground truth.
`connectionChanged` still sets `currentPeerAddress` when we're the CLIENT
(that value is correct in that role) but defers on the GO side until the
first inbound frame arrives.

### 5.2 `CommunicationManager` silently ignores envelope-shaped frames

`CommunicationManager` and `RelayRouter` both attach as listeners on the same
`WifiP2pTransport` (D-069 model: transport is shared, router owns envelope
choreography, manager owns TestPing choreography). Without the change, every
envelope frame would trigger a `payloadRejected: 'not-a-test-ping-v1'` in the
manager's event log — misleading noise for a payload that is actually valid
and being handled by the router.

Fix: if `decodeTestPing` fails and `decodeEnvelope` succeeds, silently
return. If both fail, still emit `payloadRejected` (regression test covers
this).

### 5.3 `DiagnosticsScreen` gains a Phase 4B card

Instantiates a `RelayRouter` on the same transport instance. The UI card
exposes a destination-deviceId input (blank = broadcast), a text preview,
"Send envelope to destination", and "Broadcast envelope" actions. Router
events are appended to the same event log the Phase 3 diagnostics UI already
uses, tagged with new `env-*` kinds so a reader can tell them apart from
TestPing events at a glance.

---

## 6. Test Results

```
Test Suites: 15 passed, 15 total
Tests:       77 passed, 77 total
Snapshots:   0 total
Time:        ~0.6s
```

New Phase 4B tests (5): all green.
Existing 72 Phase 4A tests: all still green.

Gates:
- `corepack pnpm test` — PASS (77/77).
- `corepack pnpm typecheck` — PASS (0 errors).
- `corepack pnpm lint` — PASS (0 warnings, 0 errors).
- `git diff --check` — clean (no whitespace or conflict-marker issues).

---

## 7. Release APK

**Path:** `android/app/build/outputs/apk/release/app-release.apk`
**Size:** 70,472,791 bytes (~67.2 MB) — fat APK (arm64-v8a, armeabi-v7a, x86, x86_64).
**JS bundle inside APK:** `assets/index.android.bundle` (1,439,316 bytes, ~1.37 MB, precompiled Hermes bytecode).
**Hermes native libs inside APK:** `lib/{arm64-v8a,armeabi-v7a,x86,x86_64}/libhermesvm.so` and `libhermestooling.so` present.

**Metro required at runtime:** NO. The APK ships with the JS bundle and
Hermes VM libraries embedded, so the app launches without a Metro dev server
connection. This matches the Phase 3 packaging pattern that was already
verified in `PHASE3-REPORT.md` and is the standard AGP release configuration.

Signing: default debug keystore (`android/app/debug.keystore`) — appropriate
for internal physical trial, NOT for a store release. See §10.

---

## 8. Physical 3-Phone Test Procedure (A → B → C, run when ready)

**Precondition on all three phones**
- Phone A: Motorola Edge 50 Neo (Android 15).
- Phone B: iQOO Neo7 Pro (Android 14).
- Phone C: Redmi 9i (Android 11).
- Internet OFF (mobile data OFF, Wi-Fi ON, Bluetooth OFF).
- Location Mode ON (some OEMs still require this even on API 33+; on Redmi 9i / Android 11 it's mandatory because we fall back to `ACCESS_FINE_LOCATION`).
- Install `app-release.apk` via `adb install -r android/app/build/outputs/apk/release/app-release.apk`.
- On first launch, open Diagnostics, tap **Enable diagnostics**, grant "Nearby devices" permission (or "Location" on Android 11), and tap **Initialize transport**.

**Capture on all three phones (before starting)**
- Note the local device id shown in the "Local device" row. Call them
  `DID_A`, `DID_B`, `DID_C`.

**Step 1 — A ↔ B discovery + connect**
1. On A and B: tap **Start discovery**.
2. Wait for each phone to show the other in the Peers list (target: within 30 s).
3. On A: tap **Connect** on B's row. Wait until both phones show
   `state → connected` and a `group formed` line in the event log.
4. Confirm A's log shows `group formed (owner=false, addr=<B's ip>)` and
   B's log shows `group formed (owner=true, addr=<B's ip>)` (Kotlin change
   in §4 biases the initiator — A — toward client).

**Step 2 — A → B direct envelope (sanity, not the relay proof)**
1. On A: in the Phase 4B card, paste `DID_B` into the destination field and
   type `hello B`. Tap **Send envelope to destination**.
2. Expected on A: `env-sent` and `env-forwarded → <B's ip>` in the log.
3. Expected on B: `env-received ... forMe=true` and `env-delivered` in the
   log. Confirms behaviours #1, #2, #5, #6, #7, #9 on the wire.

**Step 3 — Queue an A → C envelope on B**
1. On A: paste `DID_C` into the destination field, type `hello C`, tap
   **Send envelope to destination**.
2. Expected on A: `env-sent` and `env-forwarded → <B's ip>`.
3. Expected on B: `env-received ... forMe=false`, then `env-queued
   (no-eligible-peer); depth=1`. B has stored the envelope, decremented TTL,
   incremented hopCount, and knows it must wait for C. Confirms behaviours #3,
   #6, #7.

**Step 4 — Sequential handoff: B leaves A, joins C**
1. On A: turn Wi-Fi OFF, then ON. This drops the P2P group.
2. Expected on A: log shows `group not formed`, transport state
   `disconnected`.
3. Expected on B: same — log shows `group not formed` and queue depth stays
   at 1.
4. On B and C: tap **Start discovery**.
5. On B: wait for C in the peer list, then tap **Connect** on C's row.
6. Expected on B: `group formed (owner=false, addr=<C's ip>)` (Kotlin bias
   again), followed within one event tick by
   `env-forwarded ... → <C's ip>` and queue depth returns to 0. Confirms
   behaviour #4.

**Step 5 — Delivery to C**
1. Expected on C: `env-received ... forMe=true` and `env-delivered`. Payload
   in the event log includes the id from A's send (behaviour #5), and the
   persisted row on C — verified via `adb shell run-as com.offgrid.app
   sqlite3 databases/offgrid.db "SELECT id, hop_count, ttl FROM messages
   WHERE sender_device_id = '<DID_A>'"` — shows `hop_count = 1`,
   `ttl = MAX_ENVELOPE_TTL - 1 = 4`. Confirms behaviour #9 and the on-wire
   TTL/hopCount math (behaviours #6, #7).

**Step 6 — Duplicate suppression on C**
1. On A (still connected to nothing): reopen Diagnostics, tap **Send
   envelope to destination** again with the same `DID_C` in the field.
   (This creates a NEW envelope id since the router regenerates ids; to test
   real duplicate suppression, use the exact same on-wire bytes — the router
   already covers this in `relay.test.ts` behaviour #8. In the field, the
   more useful check is that a second physical send with the same
   destination lands as a separate row on C, not a merged one.)
2. Expected on C: a second `env-received` and a second row in the DB.
3. Then repeat Step 4's handoff dance while B's queue depth is 0 — no extra
   row appears on C. Confirms behaviour #8 in the field.

**What counts as a physical-test PASS for §F of Phase 4A**
- Steps 1–5 complete without either phone showing `payload rejected` or
  `error`, and step 5 produces a single row on C with the correct
  `hop_count` and `ttl`. That is the A → B → C proof.

**What to do if any step fails**
- Do NOT retry silently. Capture the event log from each phone, note the
  step number, and update `PHASE4-REPORT.md` with a "BLOCKED — <specific
  symptom>" entry before touching code.

---

## 9. Known Limitations at the Implementation/Build Checkpoint

- **Not tested on real devices yet.** All 77 automated tests pass, the APK
  builds, and the JS bundle is embedded — but the A → B → C physical run
  has not been performed. Steps in §8 are the exact procedure to do so.
- **Signed with the debug keystore.** Fine for `adb install`; must not be
  distributed. A release keystore is a Phase 12 concern.
- **Only one active P2P group per device.** This is a Wi-Fi Direct platform
  constraint (D-062, D-069), not a bug. Sequential handoff is the choreography
  that works around it. Any relay involving more than two nodes requires
  disconnect/reconnect cycles as demonstrated in §8 Step 4.
- **No store-and-forward across app restarts yet.** The queue lives in the
  `RelayRouter` instance. If Diagnostics is closed or the app is killed while
  B holds a queued forward, that forward is lost. Persistence of the relay
  queue is deferred (Phase 5+).
- **Peer identity is session-scoped.** Wi-Fi Direct MAC addresses are
  randomized per session on modern Android; the only stable identity is the
  `originDeviceId` inside each envelope (mapped via `ensureRemoteDeviceRow`).
- **No encryption on the envelope wire format.** Phase 4B intentionally
  extends the Phase 3 diagnostic transport with envelope-shaped frames only —
  chat-level encryption is a later-phase concern (per D-065 and
  `05-SECURITY.md` §32).
- **`payloadReceived` bytes are only cheaply copied on the mock.** In real
  Android the `SocketWorker` reader already copies bytes off its buffer
  before emitting, so no shared-buffer hazard exists at the JS boundary.
- **Multi-hop beyond A → B → C is untested.** The design is TTL-limited
  (`MAX_ENVELOPE_TTL = 5`) and dedup-safe, but D-070 explicitly scopes the
  physical trial to 3 devices for now.
- **AGP deprecation warnings** during `assembleRelease` (`applicationVariants`,
  `testVariants`, `unitTestVariants`) are inherited from the React Native
  0.87.1 Gradle plugin — not project code. They do not affect the build.

---

## 10. What Was Explicitly NOT Done

- Not committed. Working tree is dirty against the Phase 4A checkpoint
  (`ed75a7f`); the diff is the entire Phase 4B change set.
- Not physically tested. See §8 for the procedure to run when the three
  phones are on the table.
- No changes to `SocketWorker`, `WifiP2pTransport`, `nativeSurface`, or
  `codec` (unchanged from Phase 3/4A).
- No simultaneous GO fanout.
- No multi-socket architecture.
- No Phase 4.5 features.
- No chat, GPS, maps, SOS, cloud sync, or unrelated UI.
- No new npm/native dependency.
- No claim that "mesh networking is complete" — the router does one hop
  today (verified on-wire in Phase 3) and can do two hops via sequential
  handoff (verified in mocks in Phase 4A, awaiting physical proof).

---

## 11. Sign-Off Checklist Before Committing

- [ ] Physical A → B → C trial complete per §8, with observations recorded
      here or in a follow-up section.
- [ ] `PHASE4-PLAN.md` §9 blockers reviewed against §9 above and closed
      where possible.
- [ ] `10-DECISIONS.md` — no new decisions required unless the physical run
      surprises us (`groupOwnerIntent = 0` is a small tactical choice that
      fits under D-063; if we choose to memorialize it as a decision, it
      becomes D-071 and belongs in `10-DECISIONS.md` alongside a link to
      §4 above).
- [ ] Then commit as a Phase 4B feature commit with message
      `feat: phase 4b — real-transport integration for MessageEnvelope + RelayRouter`.

Nothing on this checklist has been performed by this checkpoint.
