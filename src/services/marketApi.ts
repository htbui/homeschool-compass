import type { Listing, Review } from '@/lib/market';
import { sampleCatalog } from '@/lib/marketSample';
import { useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';

/**
 * Marketplace actions. Local-only mode keeps everything on the device
 * against the sample catalog; the Kinship service variant writes to the
 * shared catalog so other families see your listings and reviews.
 */

export async function refreshCatalog(): Promise<void> {
  useMarket.getState().setCatalog({ ...sampleCatalog(), source: 'sample' });
}

export async function submitReview(r: Review): Promise<void> {
  useStore.getState().upsertMyReview(r);
}

export async function deleteReview(id: string): Promise<void> {
  useStore.getState().removeMyReview(id);
}

export async function saveListing(l: Listing): Promise<void> {
  useStore.getState().upsertMyListing(l);
}

export async function deleteListing(id: string): Promise<void> {
  useStore.getState().removeMyListing(id);
}

export async function voteHelpful(reviewId: string): Promise<void> {
  useStore.getState().toggleHelpful(reviewId);
}
