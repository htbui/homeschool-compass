import { LOCAL_CREATOR_ID, type ApplicationStatus, type Badge, type BadgeApplication, type BadgeDraft, type SellerType } from '@/lib/creators';
import { normalizeUrl } from '@/lib/curriculum';
import type { Listing } from '@/lib/market';
import type { ID } from '@/lib/types';
import { useAccount } from '@/store/useAccount';
import { useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';

import { friendlyError, supabase } from './cloud';
import { toListing, type ListingRow } from './marketApi';

export { refreshFollows } from './marketApi';

/**
 * Creator storefronts, followers, and badge applications. Storefronts and
 * badges live on the Freerange service; without an account the only
 * storefront is this device's own Studio, and follows stay on the device.
 */

const signedIn = () => !!supabase && !!useAccount.getState().userId;
const live = () => !!supabase && useMarket.getState().source === 'cloud';

// ───────────────────────────── Storefronts

export interface Storefront {
  id: ID;
  name: string;
  bio: string;
  website?: string;
  verified: boolean;
  esaStates: string[];
  listings: Listing[];
  /** This is the signed-in creator's own storefront (or this device's Studio). */
  mine: boolean;
}

type ProfileRow = { user_id: string; name: string; bio: string; website: string | null; verified?: boolean; esa_states?: string[] | null };

/** A creator's profile and active listings; undefined when there's no such creator. */
export async function loadStorefront(id: ID): Promise<Storefront | undefined> {
  if (id === LOCAL_CREATOR_ID || !live()) {
    const profile = useStudio.getState().profile;
    if (id !== LOCAL_CREATOR_ID || !profile) return undefined;
    return {
      id,
      name: profile.name,
      bio: profile.bio,
      website: profile.website,
      verified: !!profile.verified,
      esaStates: profile.esaStates ?? [],
      listings: useStore.getState().myListings.filter((l) => l.packageId && !l.suspended),
      mine: true,
    };
  }
  const [profile, rows] = await Promise.all([
    supabase!.from('creator_profiles').select('user_id, name, bio, website, verified, esa_states').eq('user_id', id).maybeSingle(),
    supabase!.from('listings').select('*').eq('creator_user', id).eq('status', 'active').order('created_at', { ascending: false }).limit(500),
  ]);
  if (profile.error) throw new Error(friendlyError(profile.error));
  const p = profile.data as ProfileRow | null;
  if (!p) return undefined;
  const fid = useAccount.getState().familyId;
  return {
    id,
    name: p.name,
    bio: p.bio,
    website: p.website ?? undefined,
    verified: !!p.verified,
    esaStates: p.esa_states ?? [],
    listings: ((rows.data ?? []) as ListingRow[]).map((r) => toListing(r, fid)),
    mine: id === useAccount.getState().userId,
  };
}

// ───────────────────────────── Following

/** Follow or unfollow a creator: on the account when signed in, otherwise on this device. */
export async function setFollowing(creatorId: ID, on: boolean): Promise<void> {
  if (signedIn() && creatorId !== LOCAL_CREATOR_ID) {
    const { error } = on
      ? await supabase!.from('creator_follows').upsert({ creator_user: creatorId }, { onConflict: 'user_id,creator_user', ignoreDuplicates: true })
      : await supabase!.from('creator_follows').delete().eq('creator_user', creatorId);
    if (error) throw new Error(friendlyError(error));
  }
  useStore.getState().setFollowing(creatorId, on);
}

/** How many people follow the signed-in creator (Studio). */
export async function followerCount(): Promise<number | undefined> {
  if (!signedIn()) return undefined;
  const { data, error } = await supabase!.rpc('my_follower_count');
  return error ? undefined : Number(data);
}

// ───────────────────────────── Badge applications

type ApplicationRow = {
  id: string; badge: Badge; status: ApplicationStatus; seller_type: SellerType; legal_name: string; website: string | null; about: string; sample_url: string | null;
  states: string[]; vendor_info: string; decision_note: string | null; decided_at: string | null; created_at: string;
};

const toApplication = (r: ApplicationRow): BadgeApplication => ({
  id: r.id,
  badge: r.badge,
  status: r.status,
  sellerType: r.seller_type,
  legalName: r.legal_name,
  website: r.website ?? '',
  about: r.about,
  sampleUrl: r.sample_url ?? '',
  states: r.states,
  vendorInfo: r.vendor_info,
  decisionNote: r.decision_note ?? undefined,
  decidedAt: r.decided_at ?? undefined,
  createdAt: r.created_at,
});

export interface MyBadges {
  verified: boolean;
  esaStates: string[];
  /** The latest application for each badge. */
  latest: Partial<Record<Badge, BadgeApplication>>;
}

/** The signed-in creator's badges and applications (also refreshes the Studio profile). */
export async function myBadges(): Promise<MyBadges | undefined> {
  if (!signedIn()) return undefined;
  const uid = useAccount.getState().userId!;
  const [profile, apps] = await Promise.all([
    supabase!.from('creator_profiles').select('verified, esa_states').eq('user_id', uid).maybeSingle(),
    supabase!.from('seller_applications').select('*').order('created_at', { ascending: false }),
  ]);
  if (apps.error) throw new Error(friendlyError(apps.error));
  const p = profile.data as { verified: boolean; esa_states: string[] } | null;
  const verified = !!p?.verified;
  const esaStates = p?.esa_states ?? [];
  if (useStudio.getState().profile) useStudio.getState().saveProfile({ ...useStudio.getState().profile!, verified: verified || undefined, esaStates: esaStates.length ? esaStates : undefined });
  const latest: MyBadges['latest'] = {};
  for (const r of (apps.data ?? []) as ApplicationRow[]) if (!latest[r.badge] && r.status !== 'withdrawn') latest[r.badge] = toApplication(r);
  return { verified, esaStates, latest };
}

export async function applyForBadge(badge: Badge, d: BadgeDraft): Promise<BadgeApplication> {
  if (!signedIn()) throw new Error('Sign in to a Freerange account to apply. Freerange reviews every application.');
  const details = {
    sellerType: d.sellerType,
    legalName: d.legalName.trim(),
    website: d.website.trim() ? (normalizeUrl(d.website) ?? d.website.trim()) : null,
    about: d.about.trim(),
    sampleUrl: d.sampleUrl.trim() ? (normalizeUrl(d.sampleUrl) ?? d.sampleUrl.trim()) : null,
    states: badge === 'esa' ? d.states : [],
    vendorInfo: badge === 'esa' ? d.vendorInfo.trim() : '',
  };
  const { data, error } = await supabase!.rpc('apply_for_badge', { badge, details });
  if (error) throw new Error(friendlyError(error));
  return toApplication(data as ApplicationRow);
}

export async function withdrawApplication(badge: Badge): Promise<void> {
  if (!signedIn()) return;
  const { error } = await supabase!.rpc('withdraw_badge_application', { badge });
  if (error) throw new Error(friendlyError(error));
}

// ───────────────────────────── Moderators

export interface BadgeQueueItem extends BadgeDraft {
  id: ID;
  userId: ID;
  badge: Badge;
  createdAt: string;
  creatorName: string;
  creatorBio: string;
  creatorWebsite?: string;
  /** Badges the creator already has. */
  verified: boolean;
  esaStates: string[];
  listingCount: number;
}

export async function badgeQueue(): Promise<BadgeQueueItem[]> {
  const { data, error } = await supabase!.rpc('badge_queue');
  if (error) throw new Error(friendlyError(error));
  return (
    (data ?? []) as (Omit<ApplicationRow, 'status' | 'decision_note' | 'decided_at'> & { user_id: string; creator_name: string; creator_bio: string; creator_website: string | null; verified: boolean; esa_states: string[]; listing_count: number })[]
  ).map((r) => ({
    id: r.id,
    userId: r.user_id,
    badge: r.badge,
    createdAt: r.created_at,
    sellerType: r.seller_type,
    legalName: r.legal_name,
    website: r.website ?? '',
    about: r.about,
    sampleUrl: r.sample_url ?? '',
    states: r.states,
    vendorInfo: r.vendor_info,
    creatorName: r.creator_name,
    creatorBio: r.creator_bio,
    creatorWebsite: r.creator_website ?? undefined,
    verified: r.verified,
    esaStates: r.esa_states,
    listingCount: Number(r.listing_count),
  }));
}

export async function decideBadge(appId: ID, decision: 'approve' | 'decline', note?: string): Promise<void> {
  const { error } = await supabase!.rpc('decide_badge', { app: appId, decision, note: note?.trim() || null });
  if (error) throw new Error(friendlyError(error));
}

export async function revokeBadge(creatorId: ID, badge: Badge, note?: string): Promise<void> {
  const { error } = await supabase!.rpc('revoke_badge', { creator: creatorId, badge, note: note?.trim() || null });
  if (error) throw new Error(friendlyError(error));
}
