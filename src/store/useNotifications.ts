import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { pruneRead } from '@/lib/notifications';

/** Which in-app notifications this device has read (notification id → when). */
interface NotificationsState {
  read: Record<string, string>;
  markRead: (ids: string[]) => void;
}

export const useNotifications = create<NotificationsState>()(
  persist(
    (set) => ({
      read: {},
      markRead: (ids) =>
        set((s) => {
          const at = new Date().toISOString();
          return { read: pruneRead({ ...s.read, ...Object.fromEntries(ids.map((id) => [id, at])) }) };
        }),
    }),
    { name: 'freerange-notifications', storage: createJSONStorage(() => AsyncStorage), partialize: ({ read }) => ({ read }) },
  ),
);
