import { create } from 'zustand';
import type { OffgridDb } from '../database';
import { listGroupsForUser, type GroupSummary } from '../services/groups';
import type { UserId } from '../types/ids';

// UI-facing cache for the user's group list. The DB remains the source of
// truth — this store exists only so screens can render synchronously and
// share the same refresh call.
export interface GroupsState {
  groups: readonly GroupSummary[];
  loaded: boolean;
  error: string | null;
  refresh: (db: OffgridDb, userId: UserId) => void;
  clear: () => void;
}

export const useGroupsStore = create<GroupsState>(set => ({
  groups: [],
  loaded: false,
  error: null,
  refresh: (db, userId) => {
    try {
      const groups = listGroupsForUser(db, userId);
      set({ groups, loaded: true, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loaded: true,
      });
    }
  },
  clear: () => set({ groups: [], loaded: false, error: null }),
}));
