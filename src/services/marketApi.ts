import type { Listing, Purchase, Review } from '@/lib/market';
import { sampleCatalog } from '@/lib/marketSample';
import type { FundingSource } from '@/lib/types';
import { useAccount } from '@/store/useAccount';
import { useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';

import { friendlyError, supabase } from './cloud';

/**
 * Marketplace actions. Without the Freerange service everything stays on the
 * device against the sample catalog. With it, the catalog, reviews, votes,
 * and purchases are shared tables; this family's own listings and reviews are
 * mirrored into the local store so screens read them the same way.
 */

const signedIn = () => !!supabase && !!useAccount.getState().userId;
const familyId = () => useAccount.getState().familyId;

// ───────────────────────────── Row mapping

export type ListingRow = {
  id: string; seller_family: string | null; seller_name: string; seller_kind: Listing['sellerKind']; seller_verified: boolean; title: string; subjects: string[]; grade_min: number; grade_max: number;
  philosophies: string[]; format: Listing['format']; price: number | string; condition: Listing['condition'] | null; description: string; includes: string[]; lessons: number; lessons_per_week: number;
  minutes_per_lesson: number; parent_involvement: Listing['parentInvolvement']; family_style: boolean; lesson_steps: string[]; cover: string; color: string; esa_eligible: boolean;
  rating_avg: number | string; rating_count: number; sample: boolean; status: string; created_at: string;
  creator_user?: string | null; package_id?: string | null; license?: Listing['license'] | null; attribution?: string | null; outline?: Listing['outline'] | null;
};
type ReviewRow = { id: string; listing_id: string; family_id: string | null; author_name: string; rating: number; title: string; body: string; child_grade: string | null; verified: boolean; helpful: number; sample: boolean; created_at: string };
type PurchaseRow = { id: string; listing_id: string | null; title: string; seller: string; price: number | string; funding_source: FundingSource; status: Purchase['status'] | 'cancelled'; demo: boolean; esa_eligible: boolean; created_at: string };

export const toListing = (r: ListingRow, fid?: string): Listing => ({
  id: r.id,
  title: r.title,
  seller: r.seller_name,
  sellerKind: r.seller_kind,
  sellerVerified: r.seller_verified,
  subjects: r.subjects as Listing['subjects'],
  gradeMin: r.grade_min,
  gradeMax: r.grade_max,
  philosophies: r.philosophies as Listing['philosophies'],
  format: r.format,
  price: Number(r.price),
  condition: r.condition ?? undefined,
  description: r.description,
  includes: r.includes,
  lessons: r.lessons,
  lessonsPerWeek: r.lessons_per_week,
  minutesPerLesson: r.minutes_per_lesson,
  parentInvolvement: r.parent_involvement,
  familyStyle: r.family_style,
  lessonSteps: r.lesson_steps,
  cover: r.cover,
  color: r.color,
  esaEligible: r.esa_eligible,
  ratingAvg: Number(r.rating_avg),
  ratingCount: r.rating_count,
  createdAt: r.created_at,
  sample: r.sample || undefined,
  mine: (!!fid && r.seller_family === fid) || (!!r.creator_user && r.creator_user === useAccount.getState().userId) ? true : undefined,
  packageId: r.package_id ?? undefined,
  license: r.license ?? undefined,
  attribution: r.attribution ?? undefined,
  outline: r.outline ?? undefined,
});

const fromListing = (l: Listing, fid: string) => ({
  id: l.id,
  seller_family: fid,
  seller_name: l.seller,
  seller_kind: 'family' as const,
  title: l.title,
  subjects: l.subjects,
  grade_min: l.gradeMin,
  grade_max: l.gradeMax,
  philosophies: l.philosophies,
  format: l.format,
  price: l.price,
  condition: l.condition ?? null,
  description: l.description,
  includes: l.includes,
  lessons: l.lessons,
  lessons_per_week: l.lessonsPerWeek,
  minutes_per_lesson: l.minutesPerLesson,
  parent_involvement: l.parentInvolvement,
  family_style: l.familyStyle,
  lesson_steps: l.lessonSteps,
  cover: l.cover,
  color: l.color,
});

const toReview = (r: ReviewRow, fid?: string): Review => ({
  id: r.id,
  listingId: r.listing_id,
  author: r.author_name,
  rating: r.rating as Review['rating'],
  title: r.title,
  body: r.body,
  childGrade: r.child_grade ?? undefined,
  createdAt: r.created_at,
  verified: r.verified,
  helpful: r.helpful,
  sample: r.sample || undefined,
  mine: !!fid && r.family_id === fid ? true : undefined,
});

export const toPurchase = (r: PurchaseRow): Purchase => ({
  id: r.id,
  listingId: r.listing_id ?? '',
  title: r.title,
  seller: r.seller,
  price: Number(r.price),
  fundingSource: r.funding_source,
  purchasedAt: r.created_at,
  status: r.status === 'cancelled' ? 'pending' : r.status,
  demo: r.demo || undefined,
  esaEligible: r.esa_eligible,
});

// ───────────────────────────── Catalog

/** Load the catalog (and, when signed in, this family's purchases, listings, reviews, votes). */
export async function refreshMarketplace(): Promise<void> {
  if (!supabase) {
    useMarket.getState().setCatalog({ ...sampleCatalog(), source: 'sample' });
    return;
  }
  const market = useMarket.getState();
  market.setStatus({ loading: true });
  try {
    const fid = familyId();
    const { data, error } = await supabase.from('listings').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(1000);
    if (error) throw error;
    const listings = (data as ListingRow[]).map((r) => toListing(r, fid));
    // Keep reviews already loaded for listing pages; they refresh per listing.
    const kept = useMarket.getState();
    market.setCatalog({ listings, reviews: kept.source === 'cloud' ? kept.reviews : [], source: 'cloud' });
    if (signedIn() && fid) await refreshMine(fid);
  } catch (e) {
    market.setStatus({ loading: false, error: friendlyError(e) });
  }
}

async function refreshMine(fid: string) {
  if (!supabase) return;
  const [mine, reviews, votes] = await Promise.all([
    supabase.from('listings').select('*').eq('seller_family', fid).eq('status', 'active'),
    supabase.from('reviews').select('*').eq('family_id', fid),
    supabase.from('review_votes').select('review_id'),
  ]);
  useStore.setState({
    myListings: ((mine.data ?? []) as ListingRow[]).map((r) => toListing(r, fid)),
    myReviews: ((reviews.data ?? []) as ReviewRow[]).map((r) => toReview(r, fid)),
    helpfulVotes: ((votes.data ?? []) as { review_id: string }[]).map((v) => v.review_id),
  });
  await refreshPurchases();
}

/** Reviews for one listing (loaded when its page opens). */
export async function loadReviews(listingId: string): Promise<void> {
  if (!supabase || useMarket.getState().source !== 'cloud') return;
  const { data, error } = await supabase.from('reviews').select('*').eq('listing_id', listingId).order('created_at', { ascending: false }).limit(500);
  if (error) return;
  const fid = familyId();
  const fresh = (data as ReviewRow[]).map((r) => toReview(r, fid));
  const market = useMarket.getState();
  market.setCatalog({ listings: market.listings, reviews: [...market.reviews.filter((r) => r.listingId !== listingId), ...fresh], source: 'cloud' });
}

async function refreshListing(listingId: string) {
  if (!supabase) return;
  const { data } = await supabase.from('listings').select('*').eq('id', listingId).maybeSingle();
  const market = useMarket.getState();
  if (data) {
    const l = toListing(data as ListingRow, familyId());
    market.setCatalog({ listings: market.listings.some((x) => x.id === l.id) ? market.listings.map((x) => (x.id === l.id ? l : x)) : [l, ...market.listings], reviews: market.reviews, source: market.source });
  }
  await loadReviews(listingId);
}

/** Sync purchases from the server: new ones are recorded locally (and land in expenses). */
export async function refreshPurchases(): Promise<Purchase[]> {
  if (!supabase || !signedIn()) return [];
  const { data, error } = await supabase.from('purchases').select('*').in('status', ['paid', 'free']).order('created_at', { ascending: false });
  if (error) return [];
  const store = useStore.getState();
  const fresh = (data as PurchaseRow[]).map(toPurchase);
  for (const p of fresh) {
    const have = store.purchases.find((x) => x.id === p.id);
    if (!have) store.recordPurchase(p);
  }
  return fresh;
}

// ───────────────────────────── Writes

function requireCloud(): string {
  if (!supabase || !signedIn()) throw new Error('Sign in to do this in the live marketplace.');
  const fid = familyId();
  if (!fid) throw new Error('Finish setting up your family first.');
  return fid;
}

const live = () => !!supabase && useMarket.getState().source === 'cloud';

export async function submitReview(r: Review): Promise<void> {
  if (!live()) {
    useStore.getState().upsertMyReview(r);
    return;
  }
  const fid = requireCloud();
  const { data, error } = await supabase!
    .from('reviews')
    .upsert({ listing_id: r.listingId, family_id: fid, author_name: r.author, rating: r.rating, title: r.title, body: r.body, child_grade: r.childGrade ?? null }, { onConflict: 'listing_id,family_id' })
    .select()
    .single();
  if (error) throw new Error(friendlyError(error));
  const saved = toReview(data as ReviewRow, fid);
  useStore.setState((s) => ({ myReviews: [saved, ...s.myReviews.filter((x) => x.listingId !== saved.listingId)] }));
  await refreshListing(r.listingId);
}

export async function deleteReview(id: string): Promise<void> {
  if (!live()) {
    useStore.getState().removeMyReview(id);
    return;
  }
  requireCloud();
  const listingId = useStore.getState().myReviews.find((r) => r.id === id)?.listingId;
  const { error } = await supabase!.from('reviews').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error));
  useStore.getState().removeMyReview(id);
  const market = useMarket.getState();
  market.setCatalog({ listings: market.listings, reviews: market.reviews.filter((r) => r.id !== id), source: market.source });
  if (listingId) await refreshListing(listingId);
}

export async function saveListing(l: Listing): Promise<void> {
  if (!live()) {
    useStore.getState().upsertMyListing(l);
    return;
  }
  const fid = requireCloud();
  const exists = useStore.getState().myListings.some((x) => x.id === l.id);
  const row = fromListing(l, fid);
  const q = exists ? supabase!.from('listings').update(row).eq('id', l.id) : supabase!.from('listings').insert({ ...row, id: undefined });
  const { data, error } = await q.select().single();
  if (error) throw new Error(friendlyError(error));
  const saved = toListing(data as ListingRow, fid);
  useStore.getState().upsertMyListing(saved);
  const market = useMarket.getState();
  market.setCatalog({ listings: [saved, ...market.listings.filter((x) => x.id !== saved.id)], reviews: market.reviews, source: market.source });
}

export async function deleteListing(id: string): Promise<void> {
  if (!live()) {
    useStore.getState().removeMyListing(id);
    return;
  }
  requireCloud();
  const { error } = await supabase!.from('listings').update({ status: 'removed' }).eq('id', id);
  if (error) throw new Error(friendlyError(error));
  useStore.getState().removeMyListing(id);
  const market = useMarket.getState();
  market.setCatalog({ listings: market.listings.filter((x) => x.id !== id), reviews: market.reviews, source: market.source });
}

export async function voteHelpful(reviewId: string): Promise<void> {
  if (!live()) {
    useStore.getState().toggleHelpful(reviewId);
    return;
  }
  requireCloud();
  const voted = useStore.getState().helpfulVotes.includes(reviewId);
  const { error } = voted ? await supabase!.from('review_votes').delete().eq('review_id', reviewId) : await supabase!.from('review_votes').insert({ review_id: reviewId });
  if (error) throw new Error(friendlyError(error));
  useStore.getState().toggleHelpful(reviewId);
  const listingId = useMarket.getState().reviews.find((r) => r.id === reviewId)?.listingId;
  if (listingId) await loadReviews(listingId);
}

/** Kept for screens that refresh the catalog explicitly (e.g. pull to refresh). */
export const refreshCatalog = refreshMarketplace;
