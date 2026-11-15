import { uid } from '@/lib/id';
import type { Listing } from '@/lib/market';
import { normalizeCode, type Bundle, type Coupon } from '@/lib/pricing';
import { useAccount } from '@/store/useAccount';
import { useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';

import { friendlyError, supabase } from './cloud';
import { refreshBundles, toBundle, toListing, type BundleRow, type ListingRow } from './marketApi';

/**
 * Creator promotions (Studio): sales, bundles, and coupon codes. With an
 * account they're saved on the server, which also does all the pricing at
 * checkout; without one they stay on this device, like publishing does.
 */

const signedIn = () => !!supabase && !!useAccount.getState().userId;

// ───────────────────────────── Sales

/** Put a listing on sale until `endsAt`, or end the sale (no percent). */
export async function setSale(l: Listing, percent: number | undefined, endsAt: string | undefined): Promise<Listing> {
  if (signedIn()) {
    const { data, error } = await supabase!.rpc('set_listing_sale', { lid: l.id, pct: percent ?? null, ends: percent ? endsAt : null });
    if (error) throw new Error(friendlyError(error));
    const saved = toListing(data as ListingRow, useAccount.getState().familyId);
    const market = useMarket.getState();
    market.setCatalog({ listings: market.listings.map((x) => (x.id === saved.id ? saved : x)), reviews: market.reviews, source: market.source });
    if (useStore.getState().myListings.some((x) => x.id === saved.id)) useStore.getState().upsertMyListing(saved);
    return saved;
  }
  const saved: Listing = { ...l, salePercent: percent || undefined, saleEndsAt: percent ? endsAt : undefined };
  useStore.getState().upsertMyListing(saved);
  return saved;
}

// ───────────────────────────── Coupons

type CouponRow = { id: string; code: string; kind: Coupon['kind']; amount: number | string; listing_id: string | null; max_uses: number | null; uses: number; expires_at: string | null; active: boolean; created_at: string };

const toCoupon = (r: CouponRow): Coupon => ({
  id: r.id,
  code: r.code,
  kind: r.kind,
  amount: Number(r.amount),
  listingId: r.listing_id ?? undefined,
  maxUses: r.max_uses ?? undefined,
  uses: r.uses,
  expiresAt: r.expires_at ?? undefined,
  active: r.active,
  createdAt: r.created_at,
});

export async function myCoupons(): Promise<Coupon[]> {
  if (!signedIn()) return useStudio.getState().coupons;
  const { data, error } = await supabase!.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data as CouponRow[]).map(toCoupon);
}

export async function saveCoupon(c: Omit<Coupon, 'id' | 'uses' | 'createdAt'> & { id?: string }): Promise<Coupon> {
  const code = normalizeCode(c.code);
  if (signedIn()) {
    const row = { code, kind: c.kind, amount: c.amount, listing_id: c.listingId ?? null, max_uses: c.maxUses ?? null, expires_at: c.expiresAt ?? null, active: c.active };
    const q = c.id ? supabase!.from('coupons').update(row).eq('id', c.id) : supabase!.from('coupons').insert(row);
    const { data, error } = await q.select().single();
    if (error) throw new Error(/coupons_creator_user_code_key|duplicate key/.test(error.message) ? 'You already have a coupon with that code.' : friendlyError(error));
    return toCoupon(data as CouponRow);
  }
  const studio = useStudio.getState();
  const prev = c.id ? studio.coupons.find((x) => x.id === c.id) : undefined;
  const saved: Coupon = { ...c, code, id: prev?.id ?? uid('cp'), uses: prev?.uses ?? 0, createdAt: prev?.createdAt ?? new Date().toISOString() };
  studio.setCoupons([saved, ...studio.coupons.filter((x) => x.id !== saved.id)]);
  return saved;
}

export async function deleteCoupon(id: string): Promise<void> {
  if (signedIn()) {
    const { error } = await supabase!.from('coupons').delete().eq('id', id);
    if (error) throw new Error(friendlyError(error));
    return;
  }
  const studio = useStudio.getState();
  studio.setCoupons(studio.coupons.filter((x) => x.id !== id));
}

// ───────────────────────────── Bundles

export async function myBundles(): Promise<Bundle[]> {
  if (!signedIn()) return useStudio.getState().bundles.filter((b) => b.status === 'active').map((b) => ({ ...b, mine: true }));
  const { data, error } = await supabase!.from('bundles').select('*').eq('creator_user', useAccount.getState().userId).eq('status', 'active').order('created_at', { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return (data as BundleRow[]).map(toBundle);
}

export async function saveBundle(b: Omit<Bundle, 'id' | 'createdAt' | 'status' | 'seller'> & { id?: string }): Promise<Bundle> {
  if (signedIn()) {
    const row = { title: b.title.trim(), description: b.description.trim(), listing_ids: b.listingIds, price: b.price, cover: b.cover, color: b.color };
    const q = b.id ? supabase!.from('bundles').update(row).eq('id', b.id) : supabase!.from('bundles').insert(row);
    const { data, error } = await q.select().single();
    if (error) throw new Error(friendlyError(error));
    await refreshBundles();
    return toBundle(data as BundleRow);
  }
  const studio = useStudio.getState();
  const prev = b.id ? studio.bundles.find((x) => x.id === b.id) : undefined;
  const saved: Bundle = { ...b, title: b.title.trim(), description: b.description.trim(), id: prev?.id ?? uid('bd'), seller: studio.profile?.name ?? 'Me', status: 'active', createdAt: prev?.createdAt ?? new Date().toISOString(), mine: true };
  studio.setBundles([saved, ...studio.bundles.filter((x) => x.id !== saved.id)]);
  return saved;
}

export async function removeBundle(id: string): Promise<void> {
  if (signedIn()) {
    const { error } = await supabase!.from('bundles').delete().eq('id', id);
    if (error) throw new Error(friendlyError(error));
    await refreshBundles();
    return;
  }
  const studio = useStudio.getState();
  studio.setBundles(studio.bundles.filter((x) => x.id !== id));
}
