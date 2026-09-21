# Phase 4A — Design & JS-Side Proof of A → B → C Relay

**Status:** DESIGN ACCEPTED (2026-09-21) — D-068, D-069, D-070 flipped to ACCEPTED. Phase 4A JS-side implementation and tests are complete. Phase 4B (physical 3-device test) not yet started; no Kotlin / native change made.
**Milestone:** V0 multi-hop routing logic — JS side only.
**Started:** 2026-09-21
**Related decisions (ACCEPTED 2026-09-21):** D-068 (envelope schema), D-069 (sequential-handoff relay algorithm), D-070 (3-device physical test matrix).
**Predecessor:** `docs/PHASE3-REPORT.md` — Phase 3 A ↔ B PASS on two real Android phones (2026-09-21).

---

## 1. Scope of Phase 4A

Phase 4A is the **smallest testable proof** that the OFFGRID app can route a message across three peers where the origin cannot see the destination:

```
A  →  B  →  C
```

Phase 4A ships:

- A new **MessageEnvelope v1** wire format that carries the relay metadata Phase 3's `TestPing v1` lacks (`ttl`, `hopCount`, `originDeviceId`, `destinationDeviceId`).
- A new **`RelayRouter`** module that validates, dedupes, decides destination-vs-forward, decrements TTL / increments hopCount, and either delivers locally or forwards on the next available connection.
- A mock triangle transport (`MockRelayNetwork`) that models 3 nodes with connect/disconnect between arbitrary pairs — proving the router without touching Wi-Fi Direct.
- A `relay.test.ts` suite that proves the 10 required behaviors (see §7).

Phase 4A **explicitly does not** ship:

- Any Kotlin / native change. The Phase 3 `OffgridP2pModule` + `SocketWorker` remain untouched.
- Group-owner fan-out (concurrent B ↔ A and B ↔ C sockets). See §6.
- Chat UI, `MessagingService`, or any consumer-facing surface. Router events feed diagnostics only.
- Store-and-forward as a product feature (Phase 4A queues at most for the duration of a diagnostics session; nothing survives app restart yet).
- Any physical 3-phone test. Phase 4A stops when JS gates are green; the physical run is Phase 4B.
- Phase 5 (Private Groups) work of any kind.

---

## 2. Why sequential handoff, not fan-out

Android's `WifiP2pManager` allows **one P2P group per device** at a time. Phase 3's `SocketWorker` (`android/app/src/main/java/com/offgrid/p2p/SocketWorker.kt:44`, `:131-139`) holds a single active socket and closes the previous socket whenever a new one is installed. Concurrent A ↔ B and B ↔ C sockets on the same phone are not possible with the current native module.

Two ways to relay through B:

1. **Sequential handoff** — B connects to A, receives the envelope, then leaves the A group, then joins the C group and forwards. Requires **zero Kotlin changes**. Requires the JS router to buffer the outbound envelope across the reconnect. Adds real user-visible reconnect latency (≈ several seconds on real Wi-Fi Direct).
2. **GO fan-out** — B is the Group Owner and both A and C are clients in B's single group. Requires a Kotlin change to accept multiple client sockets on B and route between them, plus a discovery / connect flow that lets both A and C find B simultaneously. Higher latency win, higher Kotlin risk.

Phase 4A picks **sequential handoff** because it is the smallest change that produces real evidence. If sequential handoff works end-to-end on three phones, GO fan-out becomes a latency optimization decision informed by measurements — not a leap into new native code first.

---

## 3. MessageEnvelope v1 (draft D-068)

Wire format on the same 4-byte big-endian uint32 length prefix + UTF-8 JSON body established in D-065. Same port 8988. Same 64 KB max frame.

```json
{
  "v": 1,
  "kind": "msg.envelope",
  "id": "<uuidv7 — preserved across every hop>",
  "originDeviceId": "<uuidv7 — creator>",
  "destinationDeviceId": "<uuidv7 | null — null = any-forwarder / broadcast diag>",
  "ttl": 5,
  "hopCount": 0,
  "sentAt": "<ISO instant — creator's local clock at creation>",
  "body": { "kind": "test.ping", "payload": { "textPreview": "hello from A" } }
}
```

### Validation (`validateEnvelope`)

Rejects (returns `null`) if any of:

- `v !== 1`
- `kind !== 'msg.envelope'`
- `id` is not a valid UUIDv7
- `originDeviceId` is not a valid UUIDv7
- `destinationDeviceId` is neither `null` nor a valid UUIDv7
- `ttl` is not an integer in `[0, 5]`
- `hopCount` is not an integer in `[0, 64]`
- `sentAt` is not a parseable ISO instant of length ≥ 20
- `body` is not a record, or `body.kind` is not a string
- For `body.kind === 'test.ping'`: `body.payload.textPreview` is not a string of length ≤ 512

Rejects (returns `null`) at the frame level if:

- Frame smaller than 4 bytes.
- Body length prefix declares 0, or > 64 KB.
- JSON parse throws.

### Versioning discipline

- `v` is a schema version. Any breaking envelope change (renaming a field, changing a type, removing a field) requires `v = 2` and a decision entry that supersedes D-068. Adding an optional field with a documented default is not breaking.
- `body.kind` is an inner discriminator. New body kinds (`chat.text`, `location.ping`, etc.) add validators; existing decoders remain compatible so long as `v = 1`.
- The router MUST reject `v !== 1` frames without crashing. This is proven by test #1.

### Malformed / oversize behavior

- Decode returns `null` → router emits `{ kind: 'envelopeRejected', reason: '<short code>' }`. No DB write. No forward. No crash. UI can surface the count in diagnostics.

### Max TTL rationale

`03-NETWORKING.md §14` picks `TTL = 5` as the default illustration. Phase 4A adopts `MAX_TTL = 5` as the ceiling (any higher on the wire is rejected). The Phase 4B physical run will produce evidence on whether 5 is right for real trekking group topologies — the ceiling can be re-decided then without a code rewrite (only a schema change if we go above 5).

### Max payload

`64 KB` frame minus envelope header (~256 bytes) → `body.payload` should fit within `60 KB` to be safe. Phase 4A does not need this cap because `test.ping` bodies are tiny, but the envelope decoder still enforces the 64 KB frame cap from D-065.

---

## 4. Sequential-handoff relay algorithm (draft D-069)

Router state per node:

- `localDeviceId`
- `db` (SQLite `OffgridDb`)
- `transport` (Wi-Fi Direct in production; `MockTransport` in Jest)
- `currentPeerAddress: string | null` — the peer we are currently connected to
- `forwardQueue: { envelope, receivedFromAddress }[]` — envelopes we owe to a not-yet-available peer

### Receive path (`transport.on('payloadReceived', event)`)

```
1. envelope = decodeEnvelope(event.bytes)
   if envelope is null → emit envelopeRejected(reason). return.

2. dedupe by envelope.id:
     existing = MessageRepo.findMessageById(db, envelope.id)
     if existing → emit envelopeReceived(envelope, wasDuplicate=true). return.
     // dedupe also prevents loops: an envelope that came back after A→B→A
     // is rejected here (test #10).

3. persist:
     MessageRepo.insertMessageIfAbsent(db, {
       id: envelope.id,
       groupId: DIAGNOSTIC_GROUP_ID,      // reserved Phase 3 diag group
       senderId: DIAGNOSTIC_USER_ID,
       senderDeviceId: envelope.originDeviceId,
       messageType: 'system',
       payload: JSON.stringify(envelope),  // full envelope for observability
       createdAt: envelope.sentAt,
       ttl: envelope.ttl,
       deliveryStatus: 'DELIVERED',  // I have this locally; router event stream carries the finer-grained state
     })

4. delivery classification:
     forMe = (envelope.destinationDeviceId === localDeviceId
              || envelope.destinationDeviceId === null)
     if forMe → emit envelopeDelivered(envelope)

5. forward decision:
     if envelope.destinationDeviceId === localDeviceId → do NOT forward (final hop).
     else:
       newTtl = envelope.ttl - 1
       newHopCount = envelope.hopCount + 1
       if newTtl < 1 → emit envelopeTtlExpired(envelope). return.
       forwardEnvelope = { ...envelope, ttl: newTtl, hopCount: newHopCount }
       tryForward(forwardEnvelope, receivedFromAddress = event.fromAddress)

6. tryForward:
     eligible = currentPeerAddress
     if eligible && eligible !== receivedFromAddress:
       await transport.sendPayload(encodeEnvelope(forwardEnvelope))
       emit envelopeForwarded(forwardEnvelope, toAddress=eligible)
     else:
       forwardQueue.push({ forwardEnvelope, receivedFromAddress })
       emit envelopeQueued(forwardEnvelope, reason='no-eligible-peer')
```

### Connect path (`transport.on('connectionChanged', event)`)

```
if event.snapshot.groupFormed:
  currentPeerAddress = event.snapshot.groupOwnerAddress  // best-known peer address
  drainQueue()
else:
  currentPeerAddress = null

drainQueue():
  for each { forwardEnvelope, receivedFromAddress } in forwardQueue:
    if currentPeerAddress && currentPeerAddress !== receivedFromAddress:
      await transport.sendPayload(encodeEnvelope(forwardEnvelope))
      emit envelopeForwarded(forwardEnvelope, toAddress=currentPeerAddress)
      remove from queue
```

### Restart discipline (Phase 4A scope)

- The `forwardQueue` is in-memory. If the app is force-stopped between "B received from A" and "B forwards to C", the envelope is **stored** in `messages` (step 3) but the queue entry is lost. The next Phase (4B or later) can rehydrate a persistent queue from `messages WHERE delivery_status = 'RELAYED' AND sender_device_id != local_device_id`. Phase 4A does not build that; it does prove the in-memory path is correct.

### Loop / duplicate discipline

- **Dedupe** (step 2) rejects any envelope whose `id` we've already stored — this handles both true duplicates (same message arriving twice via two paths) and loops (same message returning after a round trip).
- **`receivedFromAddress` exclusion** (step 6 / drainQueue) ensures we never forward an envelope back to the peer who just handed it to us — a defense in depth even before dedupe kicks in.

### Origin device behavior

The origin (A) never runs steps 2–6 on its own outgoing envelope: it calls `router.sendEnvelope(destinationDeviceId, body)` which:

```
envelope = { v:1, kind:'msg.envelope', id: uuidv7(), originDeviceId: localDeviceId,
             destinationDeviceId, ttl: MAX_TTL, hopCount: 0, sentAt: nowIso(),
             body }
MessageRepo.insertMessageIfAbsent(db, { ... deliveryStatus: 'SENT', ... })
if currentPeerAddress → transport.sendPayload(encodeEnvelope(envelope))
else → forwardQueue.push({ envelope, receivedFromAddress: '<origin-self>' })
```

---

## 5. Physical test matrix (draft D-070)

Phase 4A does **not** run this. Phase 4B will. Recording here so the matrix is fixed before physical evidence is collected.

| Role | Model | Android | Notes |
|---|---|---|---|
| **A** — Origin | Motorola Edge 50 Neo | 15 | Confirmed working in Phase 3 |
| **B** — Relay | iQOO Neo7 Pro | 14 | Confirmed working in Phase 3 |
| **C** — Destination | Redmi 9i | 11 | Confirmed 2026-09-21; oldest Android in matrix — exercises the `ACCESS_FINE_LOCATION` fallback (D-064) and MIUI Wi-Fi Direct stack |

Scenarios to run in Phase 4B (physical):

- **S1 — Line topology, forward direction.** Position phones so A ↔ B can pair but A ↔ C cannot; B ↔ C can pair. A sends envelope with `destinationDeviceId = C.deviceId`. Expect: C persists exactly one row; envelope on C has `hopCount = 1`, `ttl = 4`.
- **S2 — Line topology, reverse direction.** C sends → A. Same expectations mirrored.
- **S3 — Broadcast (destinationDeviceId=null).** A sends broadcast. Both B and C persist exactly one row each. Duplicate delivery across a re-discovery cycle inserts zero additional rows on either.
- **S4 — Duplicate suppression on the wire.** After S1, replay the same envelope (same id) from A → B. Expect: no new row on B; no forward attempt; router emits `wasDuplicate=true`.
- **S5 — TTL exhaustion.** A sends with `ttl = 1`, `destinationDeviceId = C.deviceId`. B receives, decrements to 0, does NOT forward. C never receives. Router on B emits `envelopeTtlExpired`.
- **S6 — Broken path.** Turn Wi-Fi off on B mid-handoff. A shows honest `disconnected`, envelope is not delivered to C, no false success reported.

If any scenario cannot be run: report BLOCKED in `docs/PHASE4-REPORT.md` and do not claim pass (CLAUDE.md §7, §8, §38, N-005 rule in `docs/09-TESTING.md:290`).

---

## 6. What Phase 4A leaves for later phases

- **Kotlin change to allow B as Group Owner with two concurrent client sockets** — deferred; only revisit if sequential-handoff latency is unacceptable in the Phase 4B physical run.
- **Persistent forward queue that survives app restart** — deferred; requires either a `sync_queue` entry per pending forward or a new `RELAYED` / `PENDING_FORWARD` value in `MessageDeliveryStatus` plus a boot-time scan. Design when store-and-forward becomes a product commitment. Phase 4A uses the existing `DELIVERED` / `SENT` values for observability and relies on router events for finer state; the `id` primary key still dedupes correctly across restarts.
- **Chat UI + MessagingService** — Phase 4B onward. Consumers should not see envelopes; they should see `Message` domain objects that happen to be delivered via the relay.
- **`hop_count` column population in DB** — the DB column exists (`0001_initial_schema.ts:53-54`), but Phase 4A's `insertMessage` still hardcodes it to 0. Router-level assertions read `hopCount` from the JSON-serialized envelope in `payload`. Trivial future migration will accept `hopCount` on insert; not needed to prove Phase 4A.
- **Codegen'd TurboModule migration** — carried from D-063 AMENDED consequence; still on the Phase 4 plate but not part of 4A.
- **BLE role** (D-011, D-037) — still deferred.

---

## 7. Tests (JS-side, TESTS FIRST)

New file: `__tests__/communication/relay.test.ts`. All ten behaviors below are asserted against a `MockRelayNetwork` triangle of A, B, C wired through `RelayRouter` instances. **No physical device is required to run these tests.**

1. **Envelope round-trip.** `encodeEnvelope` → `decodeEnvelope` returns deep-equal envelope; length prefix matches JSON body length; oversize / truncated / wrong-version / malformed-JSON / bad-uuid frames all decode to `null`.
2. **A creates message M.** `A.sendEnvelope(destination=C, body=test.ping)` produces exactly one row on A (`deliveryStatus='SENT'`) and emits `envelopeSent`.
3. **B receives M and does not treat itself as destination.** After connecting A↔B and sending, B emits `envelopeReceived` with the envelope; `envelopeDelivered` is NOT emitted on B (because destination=C, not B).
4. **B decrements TTL and increments hopCount when forwarding.** Spy on B's `transport.sendPayload`; decoded outbound envelope has `ttl = original - 1`, `hopCount = original + 1`, other fields identical.
5. **B forwards M to C after sequential handoff.** Disconnect A↔B, connect B↔C. B drains its forward queue; C receives the (mutated) envelope.
6. **C receives the same original message id.** `envelope.id` on C matches `envelope.id` created on A byte-for-byte.
7. **C persists exactly one copy.** `listMessagesForGroup(dbC, DIAGNOSTIC_GROUP_ID)` returns a single row whose `id` equals the origin `id`.
8. **Duplicate delivery does not create another DB row.** Replay the same envelope bytes into C's transport again; `messages` still has one row; router emits `wasDuplicate=true`.
9. **TTL expiration prevents forwarding.** Send envelope with `ttl=1` from A. B receives, does NOT forward, emits `envelopeTtlExpired`. C never receives anything. `sendPayload` was called on B zero times after receipt.
10. **Loop attempts are rejected.** Send envelope A → B, then re-inject the *same* envelope bytes back into A's transport. A's router emits `envelopeReceived(wasDuplicate=true)`, does not forward, and does not create a second row on A. (Origin's own copy from step 2 acts as the dedupe entry.)

Success criteria for Phase 4A: all 10 pass; `pnpm test` overall stays 100% green; `pnpm typecheck` = 0 errors; `pnpm lint` = 0 errors, 0 warnings; `git diff --check` clean.

---

## 8. Acceptance Criteria (Phase 4A only)

- [ ] `docs/PHASE4-PLAN.md` (this file) reviewed and approved.
- [x] `docs/10-DECISIONS.md` D-068, D-069, D-070 flipped from PROPOSED to ACCEPTED (2026-09-21).
- [ ] `MessageEnvelope v1` type + codec added; validation rules in §3 enforced.
- [ ] `RelayRouter` implements §4 semantics; consumes existing `Transport` interface unchanged (no `sendPayload(peer, bytes)` signature change).
- [ ] `MockRelayNetwork` supports 3-node topology with independent connect/disconnect between arbitrary pairs.
- [ ] `relay.test.ts` covers all 10 behaviors from §7 and passes.
- [ ] Full JS gates green: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `git diff --check`.
- [ ] Phase 3 tests (56 total) remain green.
- [ ] Zero Kotlin changes. Zero new npm dependencies. Zero UI surface changes.

## 9. Remaining Blocker Before Physical Testing (Phase 4B)

- **Device matrix is complete and D-070 is ACCEPTED** (A: Motorola Edge 50 Neo / Android 15; B: iQOO Neo7 Pro / Android 14; C: Redmi 9i / Android 11 — confirmed 2026-09-21).
- **Android 11 permission path on Phone C.** Redmi 9i is API 30, so it uses the `ACCESS_FINE_LOCATION` fallback branch of D-064, not `NEARBY_WIFI_DEVICES`. Phase 4B must verify the fallback runtime prompt on the physical device, not just via the existing unit test.
- **MIUI Wi-Fi Direct behavior is unknown on this build.** Xiaomi's stack has historically added prompts or battery-saver interference. Any OEM-specific behavior gets logged in `docs/PHASE4-REPORT.md`; if it forces a code path change, open a new decision — do not silently work around it.
- All Kotlin / socket concurrency questions remain untouched (sequential handoff avoids them); Phase 4B may surface OEM-specific timing issues that Phase 3's two-phone run did not, and those become new decisions if they appear.

## 10. Non-Goals (explicit)

- No Kotlin, Gradle, manifest, or SocketWorker change.
- No group-owner fan-out.
- No chat UI / consumer-visible surface.
- No store-and-forward across app restart.
- No Codegen TurboModule migration.
- No BLE role work.
- No Phase 4.5, no Phase 5, no location, no maps.

---

## 11. Delivery Shape

Single logical unit — plan doc + decision entries + envelope types + codec + router + mock triangle + tests + roadmap note. If the user prefers to split (decisions-first PR, then code+tests PR), say so and this will be reshaped.
