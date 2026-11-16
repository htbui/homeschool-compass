import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ClassMember, CoopClass } from '@/lib/coop';
import type { PackageContent } from '@/lib/market';
import type { CurriculumPackage } from '@/lib/package';
import type { Bundle, Coupon } from '@/lib/pricing';

/**
 * Studio: the creator side of Freerange (like a seller's shop manager). A
 * creator profile plus their curriculum packages. Works without a family —
 * someone who only makes curricula never has to set one up. When signed in,
 * packages are also saved to the creator's account.
 */

export interface CreatorProfile {
  /** Shop name shown as the seller on the Marketplace. */
  name: string;
  bio: string;
  website?: string;
  /** Freerange checked who's behind this shop (set by moderators, read from the account). */
  verified?: boolean;
  /** States whose ESA programs list this creator as an approved vendor. */
  esaStates?: string[];
  createdAt: string;
}

/** A co-op class kept on this device (no account): its versions and the families in it. */
export interface LocalClass extends CoopClass {
  code: string;
  releases: PackageContent[];
  members: ClassMember[];
}

interface StudioState {
  /** This device is showing Studio rather than the family planner. */
  active: boolean;
  profile?: CreatorProfile;
  packages: CurriculumPackage[];
  /** Without an account: this device's bundles, coupons, and co-op classes. */
  bundles: Bundle[];
  coupons: Coupon[];
  classes: LocalClass[];
  hydrated: boolean;
  setActive: (active: boolean) => void;
  saveProfile: (p: Omit<CreatorProfile, 'createdAt'>) => void;
  /** Saves an edit (and stamps `updatedAt`); `touch: false` keeps the package's own time, for publishing. */
  upsertPackage: (p: CurriculumPackage, touch?: boolean) => void;
  removePackage: (id: string) => void;
  setPackages: (p: CurriculumPackage[]) => void;
  setBundles: (b: Bundle[]) => void;
  setCoupons: (c: Coupon[]) => void;
  setClasses: (c: LocalClass[]) => void;
  reset: () => void;
}

export const useStudio = create<StudioState>()(
  persist(
    (set) => ({
      active: false,
      packages: [],
      bundles: [],
      coupons: [],
      classes: [],
      hydrated: false,
      setActive: (active) => set({ active }),
      saveProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p, createdAt: s.profile?.createdAt ?? new Date().toISOString() } })),
      upsertPackage: (p, touch = true) =>
        set((s) => {
          const next = touch ? { ...p, updatedAt: new Date().toISOString() } : p;
          return { packages: s.packages.some((x) => x.id === p.id) ? s.packages.map((x) => (x.id === p.id ? next : x)) : [next, ...s.packages] };
        }),
      removePackage: (id) => set((s) => ({ packages: s.packages.filter((p) => p.id !== id) })),
      setPackages: (packages) => set({ packages }),
      setBundles: (bundles) => set({ bundles }),
      setCoupons: (coupons) => set({ coupons }),
      setClasses: (classes) => set({ classes }),
      reset: () => set({ active: false, profile: undefined, packages: [], bundles: [], coupons: [], classes: [] }),
    }),
    {
      name: 'freerange-studio',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => useStudio.setState({ hydrated: true }),
    },
  ),
);
