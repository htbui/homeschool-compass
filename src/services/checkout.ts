import { uid } from '@/lib/id';
import type { Listing, Purchase } from '@/lib/market';
import type { FundingSource } from '@/lib/types';

export type CheckoutResult = { status: 'done'; purchase: Purchase } | { status: 'cancelled' } | { status: 'error'; message: string };

/**
 * Buy a listing. Free listings are claimed instantly. In local-only mode paid
 * listings complete as a demo purchase (no card is charged); with the Kinship
 * service connected this goes through the payment provider's hosted checkout.
 */
export async function checkout(listing: Listing, fundingSource: FundingSource): Promise<CheckoutResult> {
  const base = {
    id: uid('p'),
    listingId: listing.id,
    title: listing.title,
    seller: listing.seller,
    price: listing.price,
    fundingSource,
    purchasedAt: new Date().toISOString(),
    esaEligible: listing.esaEligible,
  };
  if (listing.price === 0) return { status: 'done', purchase: { ...base, status: 'free' } };
  return { status: 'done', purchase: { ...base, status: 'paid', demo: true } };
}
