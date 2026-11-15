import { normalizeGiftCode, type IncomingGift, type SentGift } from '@/lib/gifts';
import { uid } from '@/lib/id';
import type { Purchase } from '@/lib/market';
import type { ID } from '@/lib/types';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';

import { friendlyError, supabase } from './cloud';
import { toPurchase, type PurchaseRow } from './marketApi';

/**
 * Gifts between families. With an account the server holds them: the giver
 * sees their status, the recipient sees gifts sent to their family or their
 * (confirmed) email, and anyone with the one-time code can claim one meant
 * for an email address. Freerange doesn't email gifts yet, so the giver
 * shares the code or link. Without an account, gifts stay on this device as
 * a demo you can redeem yourself.
 */

const signedIn = () => !!supabase && !!useAccount.getState().userId;

export type GiftRow = {
  id: string; code: string; listing_id: string | null; title: string; seller: string; recipient_email: string | null; recipient_family: string | null; recipient_label: string;
  note: string; price: number | string; status: SentGift['status']; demo: boolean; created_at: string; claimed_at: string | null;
};

export const toSentGift = (r: GiftRow): SentGift => ({
  id: r.id,
  code: r.code,
  listingId: r.listing_id ?? '',
  title: r.title,
  seller: r.seller,
  recipientLabel: r.recipient_label,
  recipientEmail: r.recipient_email ?? undefined,
  recipientFamily: r.recipient_family ?? undefined,
  note: r.note,
  price: Number(r.price),
  status: r.status,
  demo: r.demo || undefined,
  createdAt: r.created_at,
  claimedAt: r.claimed_at ?? undefined,
});

export async function sentGifts(): Promise<SentGift[]> {
  if (!signedIn()) return useStore.getState().localGifts;
  const { data, error } = await supabase!.from('gifts').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(friendlyError(error));
  return (data as GiftRow[]).map(toSentGift);
}

/** Gifts waiting for this family (account only). */
export async function incomingGifts(): Promise<IncomingGift[]> {
  if (!signedIn()) return [];
  const { data, error } = await supabase!.rpc('my_gifts');
  if (error) throw new Error(friendlyError(error));
  return (data as { id: string; code: string; listing_id: string; title: string; seller: string; giver_name: string; note: string; created_at: string }[]).map((r) => ({
    id: r.id,
    code: r.code,
    listingId: r.listing_id,
    title: r.title,
    seller: r.seller,
    giverName: r.giver_name,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export interface GiftPreview {
  title: string;
  listingId?: ID;
  seller: string;
  giverName: string;
  note: string;
  status: SentGift['status'];
}

export async function previewGift(code: string): Promise<GiftPreview | undefined> {
  const c = normalizeGiftCode(code);
  if (!signedIn()) {
    const g = useStore.getState().localGifts.find((x) => x.code === c);
    return g ? { title: g.title, listingId: g.listingId, seller: g.seller, giverName: useStore.getState().family?.familyName ?? 'You', note: g.note, status: g.status } : undefined;
  }
  const { data, error } = await supabase!.rpc('gift_preview', { gift_code: c });
  if (error) throw new Error(friendlyError(error));
  if (!data) return undefined;
  const r = data as { title: string; listing_id: string | null; seller: string; giver_name: string; note: string; status: SentGift['status'] };
  return { title: r.title, listingId: r.listing_id ?? undefined, seller: r.seller, giverName: r.giver_name, note: r.note, status: r.status };
}

/** Claim a gift: it lands in this family's library (free to them). */
export async function claimGift(code: string): Promise<Purchase> {
  const c = normalizeGiftCode(code);
  const store = useStore.getState();
  if (!signedIn()) {
    const g = store.localGifts.find((x) => x.code === c);
    if (!g || g.status === 'cancelled' || g.status === 'pending') throw new Error('That gift code isn’t valid');
    if (g.status === 'claimed') throw new Error('That gift has already been claimed');
    if (store.purchases.some((p) => p.listingId === g.listingId && p.status !== 'pending')) throw new Error('You already have this curriculum, so the gift is still unclaimed.');
    const p: Purchase = { id: uid('p'), listingId: g.listingId, title: g.title, seller: g.seller, price: 0, fundingSource: 'out_of_pocket', purchasedAt: new Date().toISOString(), status: 'free', esaEligible: false, giftFrom: store.family?.familyName ?? 'a friend' };
    store.recordPurchase(p);
    store.upsertLocalGift({ ...g, status: 'claimed', claimedAt: p.purchasedAt });
    return p;
  }
  const { data, error } = await supabase!.rpc('claim_gift', { gift_code: c });
  if (error) throw new Error(friendlyError(error));
  const p = toPurchase(data as PurchaseRow);
  if (!store.purchases.some((x) => x.id === p.id)) store.recordPurchase(p);
  return p;
}

/** Take back a free gift nobody has claimed. */
export async function cancelGift(g: SentGift): Promise<void> {
  if (!signedIn()) {
    useStore.getState().upsertLocalGift({ ...g, status: 'cancelled' });
    return;
  }
  const { error } = await supabase!.rpc('cancel_gift', { gid: g.id });
  if (error) throw new Error(friendlyError(error));
}

/** Families you're connected with in Community (who can receive gifts directly). */
export async function giftableFamilies(): Promise<{ familyId: ID; name: string }[]> {
  if (!signedIn() || !useAccount.getState().familyId) return [];
  const { data, error } = await supabase!.rpc('my_connections');
  if (error) return [];
  return (data as { family_id: string; display_name: string; status: string }[]).filter((r) => r.status === 'accepted').map((r) => ({ familyId: r.family_id, name: r.display_name }));
}
