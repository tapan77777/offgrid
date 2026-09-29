// D-078. Minimal adapter around @react-native-community/netinfo. Wrapped
// in a lazy require + try/catch so the app remains bootable if the native
// module is not linked in the running binary (e.g. running an existing
// installed APK against the new JS bundle before the next rebuild).
//
// The internetAvailable signal is DISPLAY-ONLY — CLAUDE.md §11 and the
// approved seamless-connection decisions explicitly forbid using cloud
// connectivity as a messaging transport. Losing this signal degrades the
// UI to "noConnection" when no local peer is up, which is honest.

export type InternetAvailabilityListener = (available: boolean) => void;

export interface NetInfoAdapter {
  subscribe(listener: InternetAvailabilityListener): () => void;
  currentAvailability(): boolean | null;
}

interface RawNetInfoState {
  readonly isConnected?: boolean | null;
  readonly isInternetReachable?: boolean | null;
}

interface RawNetInfoModule {
  addEventListener(cb: (state: RawNetInfoState) => void): () => void;
  fetch?: () => Promise<RawNetInfoState>;
}

function loadModule(): RawNetInfoModule | null {
  try {
    const mod = require('@react-native-community/netinfo');
    if (typeof mod?.addEventListener !== 'function') return null;
    return mod as RawNetInfoModule;
  } catch {
    return null;
  }
}

function evaluate(state: RawNetInfoState): boolean {
  // Internet is only "available" if the OS explicitly reports both
  // reachability signals as true. `null` is treated as "unknown → false"
  // so the UI never over-promises (CLAUDE.md §20).
  return state.isConnected === true && state.isInternetReachable === true;
}

export function createNetInfoAdapter(): NetInfoAdapter {
  const mod = loadModule();
  if (mod === null) {
    return {
      subscribe: () => () => undefined,
      currentAvailability: () => null,
    };
  }
  let latest: boolean | null = null;
  const listeners = new Set<InternetAvailabilityListener>();
  // NetInfo's upstream subscription is intentionally left permanent — this
  // adapter is a process singleton (`getNetInfoAdapter()`), so unsubscribing
  // would only make sense from a `dispose()` path that does not exist yet.
  mod.addEventListener(state => {
    const next = evaluate(state);
    latest = next;
    for (const l of listeners) l(next);
  });
  // Best-effort initial fetch so the first UI paint has a truthful value.
  if (typeof mod.fetch === 'function') {
    mod
      .fetch()
      .then(state => {
        const next = evaluate(state);
        latest = next;
        for (const l of listeners) l(next);
      })
      .catch(() => undefined);
  }
  return {
    subscribe: listener => {
      listeners.add(listener);
      if (latest !== null) listener(latest);
      return () => {
        listeners.delete(listener);
      };
    },
    currentAvailability: () => latest,
  };
}

let cached: NetInfoAdapter | null = null;

export function getNetInfoAdapter(): NetInfoAdapter {
  if (cached === null) {
    cached = createNetInfoAdapter();
  }
  return cached;
}

// Reset entry point exposed for tests. Never call from app code.
export function _resetNetInfoAdapterForTests(): void {
  cached = null;
}
