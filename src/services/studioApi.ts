import { Platform } from 'react-native';

import { uid } from '@/lib/id';
import type { Listing, PackageContent } from '@/lib/market';
import { attributionFor, packageToListing, publishIssues, type CurriculumPackage } from '@/lib/package';
import { sampleContent } from '@/lib/studioSample';
import { useAccount } from '@/store/useAccount';
import { useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { useStudio, type CreatorProfile } from '@/store/useStudio';

import { friendlyError, supabase } from './cloud';
import { toListing, type ListingRow } from './marketApi';

/**
 * Studio actions. Packages always save on this device first; when signed in
 * they're also saved to the creator's account, and publishing goes through
 * the server (which enforces the license rules). Without an account,
 * publishing puts the listing in this device's catalog for testing.
 */

const signedIn = () => !!supabase && !!useAccount.getState().userId;

// ───────────────────────────── Profile

export async function saveCreatorProfile(p: Omit<CreatorProfile, 'createdAt'>): Promise<void> {
  if (signedIn()) {
    const { error } = await supabase!.from('creator_profiles').upsert({ user_id: useAccount.getState().userId, name: p.name.trim(), bio: p.bio.trim(), website: p.website?.trim() || null });
    if (error) throw new Error(friendlyError(error));
  }
  useStudio.getState().saveProfile({ ...p, name: p.name.trim(), bio: p.bio.trim(), website: p.website?.trim() || undefined });
}

// ───────────────────────────── Packages

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Save a draft locally now, and to the account shortly after (edits are frequent). */
export function savePackage(pkg: CurriculumPackage): void {
  useStudio.getState().upsertPackage(pkg);
  if (!signedIn()) return;
  clearTimeout(timers.get(pkg.id));
  timers.set(
    pkg.id,
    setTimeout(() => {
      timers.delete(pkg.id);
      const latest = useStudio.getState().packages.find((p) => p.id === pkg.id);
      if (latest) pushPackage(latest).catch(() => {});
    }, 1500),
  );
}

async function pushPackage(pkg: CurriculumPackage): Promise<void> {
  const { error } = await supabase!.from('packages').upsert({ id: pkg.id, title: pkg.title.slice(0, 160), origin_kind: pkg.origin.kind, content: pkg, updated_at: pkg.updatedAt });
  if (error) throw new Error(friendlyError(error));
}

export async function deletePackage(pkg: CurriculumPackage): Promise<void> {
  if (pkg.status === 'published') await unpublishPackage(pkg);
  if (signedIn()) {
    const { error } = await supabase!.from('packages').delete().eq('id', pkg.id);
    if (error) throw new Error(friendlyError(error));
  }
  useStudio.getState().removePackage(pkg.id);
}

/** After signing in: bring down the account's profile and packages, and upload this device's. */
export async function loadStudio(): Promise<void> {
  if (!signedIn()) return;
  const studio = useStudio.getState();
  const [profile, rows] = await Promise.all([
    supabase!.from('creator_profiles').select('*').eq('user_id', useAccount.getState().userId).maybeSingle(),
    supabase!.from('packages').select('content, updated_at'),
  ]);
  if (profile.data) studio.saveProfile({ name: profile.data.name, bio: profile.data.bio, website: profile.data.website ?? undefined });
  else if (studio.profile) await saveCreatorProfile(studio.profile).catch(() => {});
  const remote = ((rows.data ?? []) as { content: CurriculumPackage }[]).map((r) => r.content);
  const local = studio.packages;
  const byId = new Map(remote.map((p) => [p.id, p]));
  for (const p of local) {
    const r = byId.get(p.id);
    if (!r || p.updatedAt > r.updatedAt) {
      byId.set(p.id, p);
      await pushPackage(p).catch(() => {});
    }
  }
  studio.setPackages([...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

// ───────────────────────────── Publishing

export async function publishPackage(pkg: CurriculumPackage): Promise<CurriculumPackage> {
  const profile = useStudio.getState().profile;
  if (!profile) throw new Error('Set up your creator profile first.');
  const issues = publishIssues(pkg);
  if (issues.length) throw new Error(`Still needed: ${issues.join(', ')}`);
  const ready: CurriculumPackage = { ...pkg, attribution: attributionFor(pkg, profile.name), updatedAt: new Date().toISOString() };

  if (signedIn()) {
    clearTimeout(timers.get(pkg.id));
    await pushPackage(ready);
    const { data, error } = await supabase!.rpc('publish_package', { pkg_id: pkg.id });
    if (error) throw new Error(friendlyError(error));
    const listing = toListing(data as ListingRow, useAccount.getState().familyId);
    const { data: row } = await supabase!.from('packages').select('content').eq('id', pkg.id).single();
    const saved = (row?.content as CurriculumPackage | undefined) ?? { ...ready, status: 'published', listingId: listing.id };
    useStudio.getState().upsertPackage(saved);
    const market = useMarket.getState();
    if (market.source === 'cloud') market.setCatalog({ listings: [listing, ...market.listings.filter((l) => l.id !== listing.id)], reviews: market.reviews, source: 'cloud' });
    return saved;
  }

  // On this device only: list it in the local catalog.
  const now = new Date().toISOString();
  const saved: CurriculumPackage = { ...ready, status: 'published', version: pkg.version + 1, listingId: pkg.listingId ?? uid('l'), publishedAt: now, updatedAt: now };
  const existing = useStore.getState().myListings.find((l) => l.id === saved.listingId);
  useStore.getState().upsertMyListing(packageToListing(saved, profile.name, existing));
  useStudio.getState().upsertPackage(saved);
  return saved;
}

export async function unpublishPackage(pkg: CurriculumPackage): Promise<CurriculumPackage> {
  if (signedIn()) {
    const { error } = await supabase!.rpc('unpublish_package', { pkg_id: pkg.id });
    if (error) throw new Error(friendlyError(error));
    const market = useMarket.getState();
    market.setCatalog({ listings: market.listings.filter((l) => l.id !== pkg.listingId), reviews: market.reviews, source: market.source });
  }
  if (pkg.listingId) useStore.getState().removeMyListing(pkg.listingId);
  const saved: CurriculumPackage = { ...pkg, status: 'draft' };
  useStudio.getState().upsertPackage(saved);
  return saved;
}

/** The full lesson plan for a listing (after buying it, or for free ones). */
export async function packageContent(listing: Listing): Promise<PackageContent | undefined> {
  if (!listing.packageId) return undefined;
  const local = useStudio.getState().packages.find((p) => p.id === listing.packageId);
  if (supabase && useMarket.getState().source === 'cloud' && !listing.sample) {
    const { data, error } = await supabase.rpc('package_content', { lid: listing.id });
    if (error) throw new Error(friendlyError(error));
    return (data as PackageContent | null) ?? undefined;
  }
  if (local) return { units: local.units, version: local.version, license: local.license, attribution: local.attribution };
  return sampleContent(listing.id);
}

export interface ListingStats {
  sales: number;
  revenue: number;
  ratingAvg: number;
  ratingCount: number;
}

/** Sales and ratings per listing for the dashboard (account only). */
export async function creatorStats(): Promise<Record<string, ListingStats>> {
  if (!signedIn()) return {};
  const { data, error } = await supabase!.rpc('creator_stats');
  if (error) return {};
  return Object.fromEntries(
    ((data ?? []) as { listing_id: string; sales: number; revenue: number | string; rating_avg: number | string; rating_count: number }[]).map((r) => [
      r.listing_id,
      { sales: Number(r.sales), revenue: Number(r.revenue), ratingAvg: Number(r.rating_avg), ratingCount: r.rating_count },
    ]),
  );
}

// ───────────────────────────── Web import

/** Load a web page's HTML. Through the Kinship service when signed in; phones can also fetch directly. */
export async function fetchPage(url: string): Promise<{ url: string; html: string }> {
  if (signedIn()) {
    const { data, error } = await supabase!.functions.invoke('fetch-page', { body: { url } });
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => undefined);
      throw new Error(body?.error ?? friendlyError(error));
    }
    return data as { url: string; html: string };
  }
  if (Platform.OS === 'web') throw new Error('Loading a website needs a Kinship account (browsers can’t read other sites directly).');
  const res = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`That page answered ${res.status}.`);
  if (!/text\/html|text\/plain/i.test(res.headers.get('content-type') ?? '')) throw new Error('That address isn’t a web page.');
  const html = await res.text();
  return { url: res.url || url, html: html.slice(0, 3 * 1024 * 1024) };
}
