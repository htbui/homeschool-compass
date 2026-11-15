import { useMemo } from 'react';
import { create } from 'zustand';

import { reviewProgress, withReviews, type Listing, type Review } from '@/lib/market';
import type { Bundle } from '@/lib/pricing';
import { libraryListings } from '@/lib/library';

import { useStore } from './useStore';
import { useStudio } from './useStudio';

/**
 * The browsable catalog (everyone's listings and reviews). It's a cache:
 * the sample catalog in local-only mode, the Freerange service when signed in.
 * This family's own purchases, listings, and reviews live in `useStore`.
 */
interface MarketState {
  listings: Listing[];
  reviews: Review[];
  /** Creators' bundles (the live ones; on this device, Studio's own). */
  bundles: Bundle[];
  source: 'sample' | 'cloud';
  loading: boolean;
  error?: string;
  setCatalog: (c: { listings: Listing[]; reviews: Review[]; source: 'sample' | 'cloud' }) => void;
  setStatus: (s: { loading: boolean; error?: string }) => void;
  setBundles: (b: Bundle[]) => void;
}

export const useMarket = create<MarketState>()((set) => ({
  listings: libraryListings(),
  reviews: [],
  bundles: [],
  source: 'sample',
  loading: false,
  setCatalog: (c) => set({ ...c, loading: false, error: undefined }),
  setStatus: (s) => set(s),
  setBundles: (bundles) => set({ bundles }),
}));

/** Catalog merged with this family's own listings and reviews. */
export function useCatalog(): { listings: Listing[]; reviews: Review[]; source: 'sample' | 'cloud' } {
  const listings = useMarket((s) => s.listings);
  const reviews = useMarket((s) => s.reviews);
  const source = useMarket((s) => s.source);
  const myListings = useStore((s) => s.myListings);
  const myReviews = useStore((s) => s.myReviews);
  const votes = useStore((s) => s.helpfulVotes);
  const curricula = useStore((s) => s.curricula);

  return useMemo(() => {
    const mineIds = new Set(myListings.map((l) => l.id));
    const catalogReviewIds = new Set(reviews.map((r) => r.id));
    const myReviewIds = new Set(myReviews.map((r) => r.id));
    // My reviews the catalog doesn't know about yet still count toward the rating.
    const pending = myReviews.filter((r) => !catalogReviewIds.has(r.id));
    const merged = [...myListings, ...listings.filter((l) => !mineIds.has(l.id))].map((l) =>
      withReviews(l, pending.filter((r) => r.listingId === l.id)),
    );
    // Without an account, this family's progress comes straight from their plan (the server keeps it otherwise).
    const mine = source === 'sample' ? myReviews.map((r) => ({ ...r, progress: r.showProgress === false ? undefined : reviewProgress(curricula, r.listingId) })) : myReviews;
    const allReviews = [...mine, ...reviews.filter((r) => !myReviewIds.has(r.id))].map((r) =>
      source === 'sample' && votes.includes(r.id) ? { ...r, helpful: r.helpful + 1 } : r,
    );
    return { listings: merged, reviews: allReviews, source };
  }, [listings, reviews, source, myListings, myReviews, votes, curricula]);
}

/** Bundles to show: the live ones, plus any this device's Studio made without an account. */
export function useBundles(): Bundle[] {
  const live = useMarket((s) => s.bundles);
  const local = useStudio((s) => s.bundles);
  return useMemo(() => {
    const mine = local.filter((b) => b.status === 'active').map((b) => ({ ...b, mine: true }));
    const ids = new Set(mine.map((b) => b.id));
    return [...mine, ...live.filter((b) => !ids.has(b.id))];
  }, [live, local]);
}
