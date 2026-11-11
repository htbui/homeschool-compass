import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

/**
 * Account and sync state for this device. The session itself is persisted by
 * supabase-js; this remembers which family the device syncs with and the
 * version it last saw.
 */
interface AccountState {
  userId?: string;
  email?: string;
  familyId?: string;
  familyName?: string;
  /** Last workspace version this device synced. */
  version: number;
  status: SyncStatus;
  lastSyncedAt?: string;
  error?: string;
  /** Account has a family in the cloud and this device has a different one: ask before replacing. */
  conflict?: { familyId: string; familyName: string };
  set: (p: Partial<Omit<AccountState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

export const useAccount = create<AccountState>()(
  persist(
    (set) => ({
      version: 0,
      status: 'off',
      set: (p) => set(p),
      reset: () => set({ userId: undefined, email: undefined, familyId: undefined, familyName: undefined, version: 0, status: 'off', lastSyncedAt: undefined, error: undefined, conflict: undefined }),
    }),
    {
      name: 'freerange-account',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ userId, email, familyId, familyName, version, lastSyncedAt }) => ({ userId, email, familyId, familyName, version, lastSyncedAt }),
    },
  ),
);

export const STATUS_LABEL: Record<SyncStatus, string> = {
  off: 'Not syncing',
  idle: '☁️ Synced',
  syncing: '🔄 Syncing…',
  offline: '📴 Offline — will sync later',
  error: '⚠️ Sync problem',
};
