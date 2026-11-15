import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { randomCode, type SentGift } from '@/lib/gifts';
import { uid } from '@/lib/id';
import type { Listing, Purchase } from '@/lib/market';
import { quote, type Bundle, type PriceTarget, type Quote } from '@/lib/pricing';
import type { FundingSource, ID } from '@/lib/types';
import { useAccount } from '@/store/useAccount';
import { useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';

import { friendlyError, supabase } from './cloud';
import { toSentGift, type GiftRow } from './giftApi';
import { refreshPurchases, toPurchase, type PurchaseRow } from './marketApi';

export type CheckoutResult =
  | { status: 'done'; purchase?: Purchase; purchases: Purchase[]; gift?: SentGift }
  | { status: 'pending'; message: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** What's being bought: one listing, or a creator's bundle. */
export type CheckoutItem = { kind: 'listing'; listing: Listing } | { kind: 'bundle'; bundle: Bundle };

/** Who a gift is for: an email address, or a connected family. */
export interface GiftTo {
  email?: string;
  familyId?: ID;
  /** The family's name, for the giver's list. */
  label?: string;
  note: string;
}

const target = (item: CheckoutItem): PriceTarget => (item.kind === 'listing' ? { kind: 'listing', id: item.listing.id } : { kind: 'bundle', id: item.bundle.id });
const live = () => useMarket.getState().source === 'cloud' && !!supabase && !!useAccount.getState().userId;

/** Everything this device knows to price with (the catalog plus this family's and this Studio's own). */
function localContext(code?: string) {
  const store = useStore.getState();
  const studio = useStudio.getState();
  const mine = new Set(store.myListings.map((l) => l.id));
  const market = useMarket.getState();
  return {
    listings: [...store.myListings, ...market.listings.filter((l) => !mine.has(l.id))],
    bundles: [...studio.bundles.map((b) => ({ ...b, mine: true })), ...market.bundles],
    coupons: studio.coupons,
    owned: new Set(store.purchases.filter((p) => p.status !== 'pending').map((p) => p.listingId)),
    code,
  };
}

type QuoteRow = {
  kind: Quote['kind']; id: string; title: string; seller: string; list_price: number; sale_percent: number | null; sale_ends_at: string | null; price: number;
  coupon_id: string | null; coupon_code: string | null; discount: number; total: number; owned: string[];
  items: { listing_id: string; title: string; seller: string; esa_eligible: boolean; list_price: number; price: number }[];
};

const toQuote = (r: QuoteRow): Quote => ({
  kind: r.kind,
  id: r.id,
  title: r.title,
  seller: r.seller,
  listPrice: Number(r.list_price),
  salePercent: r.sale_percent ?? undefined,
  saleEndsAt: r.sale_ends_at ?? undefined,
  price: Number(r.price),
  couponId: r.coupon_id ?? undefined,
  couponCode: r.coupon_code ?? undefined,
  discount: Number(r.discount),
  total: Number(r.total),
  owned: r.owned,
  items: r.items.map((i) => ({ listingId: i.listing_id, title: i.title, seller: i.seller, esaEligible: i.esa_eligible, listPrice: Number(i.list_price), price: Number(i.price) })),
});

/**
 * The price for this family, from the server when signed in to the live
 * marketplace (the same numbers checkout charges), otherwise worked out on
 * this device. Throws with the reason a coupon or item doesn't work.
 */
export async function priceQuote(item: CheckoutItem, code?: string): Promise<Quote> {
  if (live()) {
    const t = target(item);
    const { data, error } = await supabase!.rpc('price_quote', { target_kind: t.kind, target_id: t.id, coupon_code: code?.trim() || null });
    if (error) throw new Error(friendlyError(error));
    return toQuote(data as QuoteRow);
  }
  return quote(target(item), localContext(code));
}

/**
 * Buy a listing or bundle, for this family or as a gift.
 * - On this device (no account): completes as a clearly labelled demo purchase.
 * - Live marketplace: free listings are claimed (or sent as a gift) by the
 *   server; everything else goes through the `create-checkout` function, which
 *   prices it on the server (sale, bundle, coupon) and takes payment (Stripe
 *   Checkout in production, an instant demo payment in local development).
 * The caller records the returned purchases (which also adds the expense).
 */
export async function checkout(item: CheckoutItem, fundingSource: FundingSource, opts: { coupon?: string; gift?: GiftTo } = {}): Promise<CheckoutResult> {
  const { gift } = opts;
  const coupon = opts.coupon?.trim() || undefined;
  if (useMarket.getState().source !== 'cloud' || !supabase) return demoCheckout(item, fundingSource, coupon, gift);
  if (!useAccount.getState().userId) return { status: 'error', message: 'Sign in (Settings → Account & sync) to buy from the live marketplace.' };
  if (!useAccount.getState().familyId) return { status: 'error', message: 'Finish setting up your family first.' };
  try {
    if (item.kind === 'listing' && item.listing.price === 0 && !coupon) {
      if (gift) {
        const { data, error } = await supabase.rpc('send_gift', { lid: item.listing.id, to_email: gift.email ?? null, to_family: gift.familyId ?? null, gift_note: gift.note });
        if (error) throw error;
        return { status: 'done', purchases: [], gift: toSentGift(data as GiftRow) };
      }
      const { data, error } = await supabase.rpc('claim_free_listing', { lid: item.listing.id });
      if (error) throw error;
      const p = toPurchase(data);
      return { status: 'done', purchase: p, purchases: [p] };
    }
    const returnUrl = Platform.OS === 'web' ? `${window.location.origin}/market?view=library` : Linking.createURL('/market', { queryParams: { view: 'library' } });
    const body = {
      ...(item.kind === 'listing' ? { listingId: item.listing.id } : { bundleId: item.bundle.id }),
      fundingSource: gift ? 'out_of_pocket' : fundingSource,
      returnUrl,
      coupon: coupon ?? null,
      gift: gift ? { email: gift.email ?? null, familyId: gift.familyId ?? null, note: gift.note } : null,
    };
    const { data, error } = await supabase.functions.invoke('create-checkout', { body });
    if (error) throw new Error(await functionError(error));
    if (data?.gift) return { status: 'done', purchases: [], gift: toSentGift(data.gift) };
    if (data?.purchases?.length || data?.purchase) {
      const purchases = ((data.purchases ?? [data.purchase]) as PurchaseRow[]).map(toPurchase);
      return { status: 'done', purchase: purchases[0], purchases };
    }
    if (data?.url) {
      if (Platform.OS === 'web') {
        window.location.assign(data.url);
        return { status: 'pending', message: 'Opening secure checkout…' };
      }
      await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
      if (gift) return { status: 'pending', message: 'Your gift shows up under Gifts once the payment goes through.' };
      const ids = item.kind === 'listing' ? [item.listing.id] : item.bundle.listingIds;
      const bought = (await refreshPurchases()).filter((p) => ids.includes(p.listingId));
      return bought.length ? { status: 'done', purchase: bought[0], purchases: bought } : { status: 'cancelled' };
    }
    return { status: 'error', message: 'Checkout didn’t start. Please try again.' };
  } catch (e) {
    return { status: 'error', message: friendlyError(e) };
  }
}

/** On this device: priced the same way, but no card is ever charged. */
function demoCheckout(item: CheckoutItem, fundingSource: FundingSource, coupon?: string, gift?: GiftTo): CheckoutResult {
  let q: Quote;
  try {
    q = quote(target(item), localContext(coupon));
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  const now = new Date().toISOString();
  if (gift) {
    const g: SentGift = {
      id: uid('g'),
      code: randomCode(10),
      listingId: q.id,
      title: q.title,
      seller: q.seller,
      recipientLabel: gift.email ?? gift.label ?? 'Another family',
      recipientEmail: gift.email,
      recipientFamily: gift.familyId,
      note: gift.note.trim(),
      price: q.total,
      status: 'ready',
      demo: q.total > 0 || undefined,
      createdAt: now,
    };
    return { status: 'done', purchases: [], gift: g };
  }
  const order = uid('p');
  const purchases: Purchase[] = q.items.map((i, n) => ({
    id: n === 0 ? order : uid('p'),
    listingId: i.listingId,
    title: i.title,
    seller: i.seller,
    price: i.price,
    listPrice: i.listPrice > i.price ? i.listPrice : undefined,
    fundingSource: q.total === 0 ? 'out_of_pocket' : fundingSource,
    purchasedAt: now,
    esaEligible: i.esaEligible,
    status: q.total === 0 ? 'free' : 'paid',
    demo: q.total > 0 || undefined,
    bundleId: q.kind === 'bundle' ? q.id : undefined,
  }));
  if (q.couponId) {
    const studio = useStudio.getState();
    studio.setCoupons(studio.coupons.map((c) => (c.id === q.couponId ? { ...c, uses: c.uses + 1 } : c)));
  }
  return { status: 'done', purchase: purchases[0], purchases };
}

/** Record a finished checkout on this device: purchases land in the library and expenses, a gift in the giver's list. */
export function recordCheckout(r: Extract<CheckoutResult, { status: 'done' }>): void {
  const store = useStore.getState();
  for (const p of r.purchases) if (!store.purchases.some((x) => x.id === p.id)) store.recordPurchase(p);
  if (r.gift) {
    if (!live()) store.upsertLocalGift(r.gift);
    // A paid gift is the giver's expense (never ESA funds).
    if (r.gift.price > 0)
      store.upsertExpense({ id: uid('x'), date: r.gift.createdAt.slice(0, 10), vendor: r.gift.seller, description: `Gift: ${r.gift.title} (for ${r.gift.recipientLabel})`, amount: r.gift.price, category: 'curriculum', fundingSource: 'out_of_pocket', approvedVendor: false });
  }
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
