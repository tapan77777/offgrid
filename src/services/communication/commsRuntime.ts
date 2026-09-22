import type { CommunicationManager } from './CommunicationManager';

// Milestone B V0: a minimal runtime registry so a UI surface (e.g. the
// group screen) can invoke `sendGroupLocationEnvelope` on whichever
// CommunicationManager is currently live. There is intentionally no
// automatic startup here — the screen that owns the transport lifecycle
// (DiagnosticsScreen) registers itself on mount and unregisters on
// unmount. If no manager is registered, callers get `null` and must
// surface an honest "no connection" state (CLAUDE.md §20).

type Listener = (manager: CommunicationManager | null) => void;

let activeManager: CommunicationManager | null = null;
const listeners = new Set<Listener>();

export function setActiveCommunicationManager(
  manager: CommunicationManager | null,
): void {
  if (activeManager === manager) return;
  activeManager = manager;
  for (const l of listeners) l(manager);
}

export function getActiveCommunicationManager(): CommunicationManager | null {
  return activeManager;
}

export function subscribeToActiveCommunicationManager(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
