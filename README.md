# OFFGRID

Offline-first group communication and safety application for hikers, trekkers, campers, and outdoor adventure groups.

> **Stay connected when the network disappears.**

This repository is in **Phase 1 — Project Bootstrap** (see `docs/08-ROADMAP.md`).
Only the React Native shell, navigation, and toolchain are in place. Networking, SQLite, cloud sync, maps, and safety features are intentionally not yet implemented.

---

## Read before contributing

- `CLAUDE.md` — operating rules for AI-assisted development
- `docs/01-PRD.md` through `docs/10-DECISIONS.md` — product, architecture, networking, database, security, UX, API, roadmap, testing, and decisions

Do not add features beyond what the current phase in `docs/08-ROADMAP.md` calls for.

---

## Requirements

- **Node.js** ≥ 22.11 (see `.nvmrc`)
- **JDK 17** (Temurin recommended)
- **pnpm 9.15.9** — activated via Corepack (`packageManager` field in `package.json`)
- **Android Studio** with SDK Platform 35 + Build-Tools 35 + Command-line Tools installed
- **Android emulator** — Pixel 6, API 35, arm64-v8a, Google APIs, or a physical device with USB debugging enabled
- **macOS** shell environment variables (add to `~/.zprofile`):
  ```zsh
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$HOME/.local/bin:$PATH"
  ```

---

## First-time setup

```bash
# Enable pnpm via Corepack (user-scope shim, no sudo)
mkdir -p ~/.local/bin
corepack enable pnpm --install-directory ~/.local/bin

# Install dependencies
pnpm install
```

---

## Development

```bash
# Start Metro bundler
pnpm start

# Build and launch on Android (needs emulator running or device attached)
pnpm android

# Run tests
pnpm test

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

### Launching the AVD

```bash
emulator -avd offgrid_pixel6_api35 &
adb wait-for-device
```

---

## Project structure

Per `docs/02-ARCHITECTURE.md §16`.

```
OFFGRID/
├── CLAUDE.md
├── README.md
├── docs/
├── src/
│   ├── screens/
│   ├── components/
│   ├── navigation/
│   ├── services/
│   │   ├── messaging/
│   │   ├── communication/    (D-043 — was mesh/)
│   │   ├── location/
│   │   ├── maps/
│   │   ├── safety/           (D-041 — was emergency/)
│   │   ├── sync/
│   │   ├── identity/
│   │   └── connectivity/
│   ├── database/
│   │   ├── sqlite/
│   │   ├── migrations/
│   │   ├── repositories/
│   │   └── models/
│   ├── store/
│   ├── types/
│   └── utils/
├── android/
├── ios/            (not the current focus — see docs/08-ROADMAP.md Phase 13)
├── __tests__/
└── tests/
```

---

## What's intentionally not here yet

Phase 1 does not implement any of: SQLite, Supabase, Wi-Fi P2P, BLE, messaging, groups, GPS, maps, SOS, or cloud sync. Each of those has a later phase in `docs/08-ROADMAP.md`. Adding them early violates `CLAUDE.md §23`.
