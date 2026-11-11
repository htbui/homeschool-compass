import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Paper = 'letter' | 'a4';

/** How this device prints. Printers are per device, so this never syncs. */
export interface PrinterConfig {
  /** `saved`: print straight to a chosen printer (iOS). `dialog`: choose in the system print dialog each time. */
  mode: 'saved' | 'dialog';
  name?: string;
  url?: string;
  paper: Paper;
  setupAt: string;
}

interface PrinterState {
  config?: PrinterConfig;
  /** The setup sheet is open; `pending` prints once setup is saved. */
  setupOpen: boolean;
  pending?: { html: string; title: string };
  lastError?: string;
  save: (c: Omit<PrinterConfig, 'setupAt'>) => void;
  openSetup: (pending?: { html: string; title: string }) => void;
  closeSetup: () => void;
  setError: (e?: string) => void;
}

export const usePrinter = create<PrinterState>()(
  persist(
    (set) => ({
      setupOpen: false,
      save: (c) => set({ config: { ...c, setupAt: new Date().toISOString() } }),
      openSetup: (pending) => set({ setupOpen: true, pending, lastError: undefined }),
      closeSetup: () => set({ setupOpen: false, pending: undefined }),
      setError: (lastError) => set({ lastError }),
    }),
    {
      name: 'freerange-printer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ config }) => ({ config }),
    },
  ),
);
