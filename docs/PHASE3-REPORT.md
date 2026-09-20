# Phase 3 — Completion Report

**Status:** PHASE 3 COMPLETE — code, automated gates, and physical two-phone test all PASS.
**Milestone:** V0 Real Offline Networking Prototype (PHONE A ↔ PHONE B, Wi-Fi Direct)
**Started:** 2026-09-20
**Physical test verified:** 2026-09-21
**Plan of record:** `/Users/tapannaik/.claude/plans/vivid-stirring-glade.md`
**Related decisions:** D-062, D-063 (AMENDED), D-064, D-065, D-066, D-067 — see `docs/10-DECISIONS.md`

---

## 1. Implemented

### TypeScript (src/)
- `src/types/communication.ts` — `TransportId`, `PeerHandle`, `TestPing`, `TransportState`, `PeerSessionKey` branded string, `ConnectionSnapshot`.
- `src/services/communication/types.ts` — `Transport` interface (`initialize`, `startDiscovery`, `stopDiscovery`, `connectToPeer`, `sendPayload`, `on`, `dispose`), `TransportEvent` union.
- `src/services/communication/codec.ts` — length-prefixed JSON `encodeTestPing` / `decodeTestPing` + **inline UTF-8 encode/decode** (Hermes lacks `TextEncoder`/`TextDecoder`; no polyfill dep added per CLAUDE.md §16).
- `src/services/communication/testGroup.ts` — reserved diagnostic group id (`00000000-0000-7000-8000-000000000003`), `ensureDiagnosticGroup(db)`, `isDiagnosticsEnabled(db)`, `setDiagnosticsEnabled(db, flag)`, `ensureRemoteDeviceRow`.
- `src/services/communication/CommunicationManager.ts` — orchestrator; decodes incoming frames, validates against `TestPing v1`, persists via `insertMessageIfAbsent` (D-014).
- `src/services/communication/transports/mockTransport.ts` — in-memory paired transport for Jest.
- `src/services/communication/transports/WifiP2pTransport.ts` — TS wrapper around the native surface; adapts native events to `Transport`; base64 ↔ Uint8Array helpers.
- `src/services/communication/transports/nativeSurface.ts` — thin adapter over `NativeModules.OffgridP2p` + `DeviceEventEmitter`; production loader + injectable surface for tests.
- `src/services/communication/index.ts` — barrel (namespace-import pattern per Phase 2 feedback).
- `src/utils/permissions.ts` — API-version-aware `NEARBY_WIFI_DEVICES` / `ACCESS_FINE_LOCATION` handler using stock `PermissionsAndroid` (no new dep).
- `src/store/communicationStore.ts` — Zustand store: `transportState`, `peers`, `connection`, `lastError`, ring-buffer `log` (50 entries).
- `src/screens/DiagnosticsScreen.tsx` — hidden diagnostics UI (permission gate, enable-diagnostics toggle, start/stop discovery, peer list w/ connect, send test ping, live event log). Reachable via `__DEV__`-only button on Home.
- `src/navigation/RootStack.tsx` — registered `Diagnostics` route (header shown).
- `src/screens/HomeScreen.tsx` — `__DEV__`-gated "Open diagnostics" button (`testID="open-diagnostics"`).
- `src/services/appBootstrap.ts` — after `ensureLocalDevice`, calls `ensureDiagnosticGroup(db)` iff `phase3.diagnostics.enabled = true`.
- `src/database/migrations/0002_phase3_diagnostics_flag.ts` — idempotently seeds `phase3.diagnostics.enabled = false` (opt-in). Registered in `runner.ts`.

### Native Android (`android/app/src/main/java/com/offgrid/p2p/`)
- `OffgridP2pModule.kt` — `ReactContextBaseJavaModule` (MODULE_NAME `"OffgridP2p"`); owns `WifiP2pManager`, `Channel`, receiver; explicit `requestConnectionInfo` for non-sticky Android 10+ broadcasts; `RECEIVER_NOT_EXPORTED` on API 33+; emits via `RCTDeviceEventEmitter`.
- `OffgridP2pPackage.kt` — `BaseReactPackage` with `ReactModuleInfoProvider`.
- `WifiP2pBroadcastReceiver.kt` — forwards the four WIFI_P2P_* actions.
- `SocketWorker.kt` — `ExecutorService`-based; port `8988`, 4-byte big-endian length prefix, 64 KB max frame; 5-attempt retry with backoff on `ECONNREFUSED`; group-owner-as-server pattern.
- `android/app/src/main/AndroidManifest.xml` — added `NEARBY_WIFI_DEVICES` (`neverForLocation`), `ACCESS_FINE_LOCATION` (`maxSdkVersion="32"`), `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`, plus `<uses-feature android.hardware.wifi.direct required="false"/>`.
- `android/app/src/main/java/com/offgrid/app/MainApplication.kt` — registered `OffgridP2pPackage()`.

### Specs / Docs
- `specs/NativeOffgridP2p.ts` — retained as reference documentation for the native surface (D-063 AMENDED: not a Codegen TurboModule for Phase 3).
- `docs/10-DECISIONS.md` — D-062…D-067 appended; D-063 AMENDED (classic bridged module for Phase 3; Codegen TurboModule deferred to Phase 4); D-053 narrowed by D-067.

## 2. Automated test results

```
Test Suites: 13 passed, 13 total
Tests:       56 passed, 56 total
Snapshots:   0 total
```

**31 new Phase 3 tests** (all green):
- `__tests__/communication/codec.test.ts` — 9 tests
- `__tests__/communication/testGroup.test.ts` — 4 tests
- `__tests__/communication/CommunicationManager.test.ts` — 6 tests
- `__tests__/communication/wifiP2pTransport.contract.test.ts` — 6 tests
- `__tests__/permissions/nearbyWifiPermission.test.ts` — 6 tests

`CommunicationManager` end-to-end exercises: peer advertisement, group formation, A→B single-row insert, replay-with-same-id inserts zero (D-014 proof), disconnect + reconnect no-duplicate, honest `disconnected` state on drop.

## 3. Green gates

- [x] `pnpm test` — 56/56 green
- [x] `pnpm typecheck` — 0 errors (`tsc --noEmit`, strict + `noUncheckedIndexedAccess`)
- [x] `pnpm lint` — 0 errors, 0 warnings
- [x] `pnpm android` — Debug APK built (`app-debug.apk`), installed on `emulator-5554`, app boots without crash. Phase 2 foundation status preserved (schema v2, `local_device_id` restored across launches).

## 4. Emulator smoke test (Pixel emulator, API 35 / Android 15)

- `MainActivity` resumed; RN JS bundle loaded (`Running "Offgrid" with {"rootTag":…}`); no `FATAL` / `AndroidRuntime` crashes.
- Home screen renders: `schema v2`, `local device: dev_01a0bebe-d56…`, `restored from local DB` — Phase 2 persistence untouched.
- `__DEV__` "Open diagnostics" button navigates to Diagnostics screen.
- Diagnostics screen renders honestly:
  - Foundation: `ready`
  - Transport: `idle`
  - Permission: `denied`
  - Group: `—`
  - Controls: `Enable diagnostics` + `Grant nearby-devices permission` enabled; all others correctly **disabled** until prerequisites met (§20 UI honesty).
- DB confirmed via `run-as com.offgrid.app sqlite3 databases/offgrid.db` — `settings` contains both `local_device_id` and `phase3.diagnostics.enabled=false`.
- Wi-Fi Direct itself is **not exercised** — the AVD has no P2P radio; this is expected and does not reflect on the native module.

### Bug found + fixed during smoke test (in-scope)
`ReferenceError: Property 'TextDecoder' doesn't exist` on first launch. Hermes on RN 0.87.1 (Android) does not expose `TextEncoder` / `TextDecoder` globally. Fixed inline in `src/services/communication/codec.ts` by replacing the calls with a minimal UTF-8 encode/decode implementation (BMP + surrogate-pair handling). **No new dependency added.** Verified fix by rebuilding + relaunching — no ReferenceError in logcat.

## 5. Physical two-phone test results (MANDATORY per Phase 3 §F)

**Rule:** No PASS may be recorded without on-device evidence (CLAUDE.md §7 §8 §38).

**Verified on:** 2026-09-21, two real Android phones running the standalone release APK built from this Phase 3 code (JS bundle packaged in the APK; Metro not attached).

| # | Test | Result |
|---|---|---|
| N-001 | A discovers B; B discovers A (Internet unavailable, Wi-Fi ON) | **PASS** |
| N-002 | Wi-Fi Direct connection established between A and B | **PASS** |
| N-003 | A → B `TestPing` delivered and persisted | **PASS** |
| N-004 | B → A `TestPing` delivered and persisted | **PASS** |
| N-005 | Communication proceeds with Internet unavailable on both devices | **PASS** |
| N-006 | Duplicate `TestPing.id` inserts zero additional rows (D-014 in production code path, not just Jest) | **PASS** |
| N-007 | App restart / recovery — device identity restored, discovery resumes | **PASS** |
| N-008 | Disconnect → reconnect → communication resumes | **PASS** |

### Devices used

- **Phone A:** Motorola Edge 50 Neo — Android 15
- **Phone B:** iQOO Neo7 Pro — Android 14

### Test conditions

- Internet: **unavailable** on both devices (per user confirmation).
- Wi-Fi radio: ON (required for Wi-Fi Direct).
- App build: standalone release APK (`android/app/build/outputs/apk/release/app-release.apk`) — JS bundle packaged in the APK; no Metro dependency at runtime.
- Diagnostics entry: reached from Home via the `DIAGNOSTICS_UI_ENABLED`-gated button (`src/config/buildFlags.ts`), which stays on through the pre-consumer phases.
- Diagnostic group: `phase3.diagnostics.enabled = true` on both devices (opt-in per D-066).
- Reserved diagnostic group id: `00000000-0000-7000-8000-000000000003`; consumer chat surfaces were not exercised (D-028: hide networking complexity).

## 6. Blocked items

_None remaining for Phase 3._ The previously-blocked physical two-phone test is now PASS (see §5).

Historical note: emulator cannot validate Wi-Fi Direct (no P2P radio); that constraint is expected and is why the physical two-phone test was mandatory.

## 7. Architecture decisions recorded

- **D-062** — V0 transport is Android Wi-Fi Direct (`WifiP2pManager`) alone. BLE / Wi-Fi Aware / hotspot / LoRa deferred.
- **D-063 — AMENDED** — Native surface for Phase 3 is a **classic bridged `ReactContextBaseJavaModule`** with `RCTDeviceEventEmitter`, **not** a Codegen'd TurboModule. Rationale: `TurboModuleRegistry.getEnforcing` at import time proved fragile against the actual Codegen output in this RN 0.87.1 / New Architecture setup; the classic bridged module is well-supported through RN 0.87 via interop and gives us the same runtime surface without a Codegen dependency for the diagnostic path. Full TurboModule migration is deferred to Phase 4 where we own the boundary for chat too.
- **D-064** — Manifest permissions: `NEARBY_WIFI_DEVICES` (`neverForLocation`, API 33+), `ACCESS_FINE_LOCATION` (`maxSdkVersion="32"` fallback), `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`. No `CHANGE_NETWORK_STATE`. No foreground service in Phase 3.
- **D-065** — Wire format: 4-byte big-endian uint32 length prefix + UTF-8 JSON body, TCP port `8988`, 64 KB max frame. Group owner runs `ServerSocket`; non-owner connects with retry. No encryption at this layer (diagnostic only).
- **D-066** — `TestPing v1` payload persisted through `messageRepository.insertMessageIfAbsent` into reserved diagnostic group `00000000-0000-7000-8000-000000000003` (`__phase3_diagnostics`), gated by `phase3.diagnostics.enabled` (opt-in, default false).
- **D-067** — V0 physical-test compatibility floor is **2 devices**. The 3-device floor from D-053 is narrowed to apply to Phase 4 (relay/mesh).

## 8. Known limitations

### What this Phase 3 PASS does and does not prove

**Proven** (by the physical two-phone run recorded in §5):
- Direct one-hop A ↔ B communication over Android Wi-Fi Direct works with Internet unavailable.
- The `insertMessageIfAbsent` idempotency path (D-014) rejects duplicates on a real device — not only in Jest.
- App restart preserves device identity and lets discovery resume.
- Disconnect → reconnect → communication works.

**NOT proven** — must not be claimed on the basis of Phase 3 evidence:
- **3-device relay / multi-hop mesh** (`A → B → C` where `A` and `C` are out of range). Phase 3 has only two peers; the Phase 4 milestone must prove this on three physical devices per D-053 (as narrowed by D-067).
- **Store-and-forward** (a message queued on `B` for a not-yet-connected `C`, delivered when `C` re-enters range). Phase 3 has no queueing between peers.
- **More than one concurrent peer per device.** Phase 3 uses a single socket at a time; multi-peer fan-out is a Phase 4+ concern.
- **Cross-OEM negotiation at scale.** Two devices were tested; broader Android Wi-Fi Direct OEM variance is not characterized.

### Implementation limitations that carry into Phase 4

- Wi-Fi Direct MAC may be randomized per session — persistent identity is `TestPing.fromDeviceId` (UUIDv7 in `settings.local_device_id`), not the P2P `deviceAddress` (R3 in plan).
- No foreground service — discovery runs only while the Diagnostics screen is foregrounded (§35 / privacy §21).
- No encryption on the Phase 3 wire; deliberate (this is a diagnostic transport; real chat encryption is a later concern per `05-SECURITY.md` §32 "no custom crypto").
- OEM variance in Wi-Fi Direct negotiation timing is expected; 5× retry with backoff mitigates but does not eliminate `ECONNREFUSED` on the group-owner-election race (R6 in plan).
- Single active socket connection (one peer at a time) — matches the 2-device V0 floor per D-067.
- Diagnostic ping is not surfaced anywhere in consumer chat UI (D-028: hide networking complexity).
- `DIAGNOSTICS_UI_ENABLED = true` in `src/config/buildFlags.ts` — must be flipped to `__DEV__` (or removed) before any consumer release so the Diagnostics screen is not reachable from consumer builds.

## 9. Next milestone (feeding into Phase 4)

- **3-device compatibility floor** re-engages per D-053 (as narrowed by D-067). Add a third device to the test matrix.
- Design store-and-forward + TTL / hop enforcement per `03-NETWORKING.md`. Prove `A → B → C` where `A`↔`C` cannot see each other.
- Decide whether relay reuses the length-prefixed JSON frame or moves to a binary framing (size + fanout implications).
- Decide BLE role activation (D-011 / D-037) as a supporting transport for peer advertisement while Wi-Fi Direct handles bulk.
- Migrate the native surface from classic bridged module to Codegen'd TurboModule (unblocks the D-063 amendment). Do this alongside the chat message boundary so we only pay the codegen cost once.
- Retire the diagnostic group + `phase3.diagnostics.enabled` flag once real chat transports are wired to the same `CommunicationManager`.

## 10. Deliverables checklist

- [x] Code implemented per plan §3
- [x] Automated tests added (31 new, 56 total green)
- [x] Green gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`
- [x] Android build + emulator smoke complete (with Hermes TextDecoder fix)
- [x] Standalone release APK built (JS bundle packaged; no Metro at runtime)
- [x] `docs/10-DECISIONS.md` updated (D-062…D-067, D-063 AMENDED)
- [x] `docs/PHASE3-REPORT.md` filled (this document)
- [x] Physical two-phone test — **PASS on two real Android phones, 2026-09-21**, N-001…N-008 all green (§5). Devices: Motorola Edge 50 Neo (Android 15) ↔ iQOO Neo7 Pro (Android 14).
