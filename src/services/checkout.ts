import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { uid } from '@/lib/id';
import type { Listing, Purchase } from '@/lib/market';
import type { FundingSource } from '@/lib/types';
import { useAccount } from '@/store/useAccount';
import { useMarket } from '@/store/useMarket';

import { friendlyError, supabase } from './cloud';
import { refreshPurchases, toPurchase } from './marketApi';

export type CheckoutResult = { status: 'done'; purchase: Purchase } | { status: 'pending'; message: string } | { status: 'cancelled' } | { status: 'error'; message: string };

/**
 * Buy a listing.
 * - Sample catalog (local-only): completes as a clearly labelled demo purchase.
 * - Live catalog: free listings are claimed by the server; paid ones go through
 *   the `create-checkout` function (Stripe Checkout in production, an instant
 *   demo payment in local development).
 * The caller records the returned purchase (which also adds the expense).
 */
export async function checkout(listing: Listing, fundingSource: FundingSource): Promise<CheckoutResult> {
  if (useMarket.getState().source !== 'cloud' || !supabase) return demoCheckout(listing, fundingSource);
  if (!useAccount.getState().userId) return { status: 'error', message: 'Sign in (Settings → Account & sync) to buy from the live marketplace.' };
  if (!useAccount.getState().familyId) return { status: 'error', message: 'Finish setting up your family first.' };
  try {
    if (listing.price === 0) {
      const { data, error } = await supabase.rpc('claim_free_listing', { lid: listing.id });
      if (error) throw error;
      return { status: 'done', purchase: toPurchase(data) };
    }
    const returnUrl = Platform.OS === 'web' ? `${window.location.origin}/market?view=library` : Linking.createURL('/market', { queryParams: { view: 'library' } });
    const { data, error } = await supabase.functions.invoke('create-checkout', { body: { listingId: listing.id, fundingSource, returnUrl } });
    if (error) throw new Error(await functionError(error));
    if (data?.purchase) return { status: 'done', purchase: toPurchase(data.purchase) };
    if (data?.url) {
      if (Platform.OS === 'web') {
        window.location.assign(data.url);
        return { status: 'pending', message: 'Opening secure checkout…' };
      }
      await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
      const bought = (await refreshPurchases()).find((p) => p.listingId === listing.id);
      return bought ? { status: 'done', purchase: bought } : { status: 'cancelled' };
    }
    return { status: 'error', message: 'Checkout didn’t start. Please try again.' };
  } catch (e) {
    return { status: 'error', message: friendlyError(e) };
  }
}

function demoCheckout(listing: Listing, fundingSource: FundingSource): CheckoutResult {
  const base = { id: uid('p'), listingId: listing.id, title: listing.title, seller: listing.seller, price: listing.price, fundingSource, purchasedAt: new Date().toISOString(), esaEligible: listing.esaEligible };
  if (listing.price === 0) return { status: 'done', purchase: { ...base, status: 'free' } };
  return { status: 'done', purchase: { ...base, status: 'paid', demo: true } };
}

/** Edge Function errors carry the real message in the response body. */
async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return body.error;
    } catch {
      // fall through
    }
  }
  return friendlyError(error);
}
