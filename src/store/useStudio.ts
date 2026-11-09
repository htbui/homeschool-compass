import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CurriculumPackage } from '@/lib/package';

/**
 * Studio: the creator side of Kinship (like a seller's shop manager). A
 * creator profile plus their curriculum packages. Works without a family —
 * someone who only makes curricula never has to set one up. When signed in,
 * packages are also saved to the creator's account.
 */

export interface CreatorProfile {
  /** Shop name shown as the seller on the Marketplace. */
  name: string;
  bio: string;
  website?: string;
  createdAt: string;
}

interface StudioState {
  /** This device is showing Studio rather than the family planner. */
  active: boolean;
  profile?: CreatorProfile;
  packages: CurriculumPackage[];
  hydrated: boolean;
  setActive: (active: boolean) => void;
  saveProfile: (p: Omit<CreatorProfile, 'createdAt'>) => void;
  upsertPackage: (p: CurriculumPackage) => void;
  removePackage: (id: string) => void;
  setPackages: (p: CurriculumPackage[]) => void;
  reset: () => void;
}

export const useStudio = create<StudioState>()(
  persist(
    (set) => ({
      active: false,
      packages: [],
      hydrated: false,
      setActive: (active) => set({ active }),
      saveProfile: (p) => set((s) => ({ profile: { ...p, createdAt: s.profile?.createdAt ?? new Date().toISOString() } })),
      upsertPackage: (p) =>
        set((s) => {
          const next = { ...p, updatedAt: new Date().toISOString() };
          return { packages: s.packages.some((x) => x.id === p.id) ? s.packages.map((x) => (x.id === p.id ? next : x)) : [next, ...s.packages] };
        }),
      removePackage: (id) => set((s) => ({ packages: s.packages.filter((p) => p.id !== id) })),
      setPackages: (packages) => set({ packages }),
      reset: () => set({ active: false, profile: undefined, packages: [] }),
    }),
    {
      name: 'kinship-studio',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => useStudio.setState({ hydrated: true }),
    },
  ),
);
