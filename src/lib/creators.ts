import { normalizeUrl } from './curriculum';
import { weightedRating, type Listing } from './market';
import { STATE_LAWS } from './states';
import type { ID } from './types';

/**
 * Creators: verified-creator badges, ESA vendor status, and storefronts.
 *
 * Badges are granted by Freerange moderators after an application, never set
 * by the seller (the server copies them onto every listing). Free & open
 * curricula are listed under their original authors, who aren't Freerange
 * accounts, so they have no storefront.
 */

export type Badge = 'verified' | 'esa';
export type SellerType = 'creator' | 'publisher';
export type ApplicationStatus = 'pending' | 'approved' | 'declined' | 'withdrawn' | 'revoked';

/** Storefront id for this device's own Studio listings when there's no account. */
export const LOCAL_CREATOR_ID = 'me';

export const VERIFIED_LABEL = '✓ Verified creator';
export const VERIFIED_EXPLAINER =
  'Freerange checked who made this. The creator told us who they are, showed us their website or portfolio and how they made their curricula, and a Freerange moderator reviewed it. It isn’t a review of every lesson, so read what other families say too.';
export const ESA_EXPLAINER =
  'The seller told Freerange which state programs list them as an approved vendor, and a moderator checked it. Signing up for an ESA or state program, and getting a purchase reimbursed, happens with your state program, outside Freerange. Check with your program before you buy.';

/** What a creator fills in to apply for a badge. */
export interface BadgeDraft {
  sellerType: SellerType;
  /** Verified: your name or your organization's. ESA: the business name as on your W-9. */
  legalName: string;
  /** Website or portfolio (required for verification). */
  website: string;
  /** Verified: how you made your curricula. ESA: anything else to know. */
  about: string;
  /** A sample lesson or preview (optional). */
  sampleUrl: string;
  /** ESA: two-letter codes of the states whose programs approved you. */
  states: string[];
  /** ESA: vendor IDs, or links to the programs' vendor listings. */
  vendorInfo: string;
}

export interface BadgeApplication extends BadgeDraft {
  id: ID;
  badge: Badge;
  status: ApplicationStatus;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

export const emptyBadgeDraft = (): BadgeDraft => ({ sellerType: 'creator', legalName: '', website: '', about: '', sampleUrl: '', states: [], vendorInfo: '' });

/** Shaped like a Social Security number or EIN (mirrors looks_like_tax_id() on the server). */
export function looksLikeTaxId(text: string): boolean {
  return /\b\d{3}-\d{2}-\d{4}\b|\b\d{2}-\d{7}\b|\b\d{9}\b/.test(text);
}

/** What's still missing before an application can be sent (mirrors apply_for_badge()). */
export function badgeIssues(badge: Badge, d: BadgeDraft): string[] {
  const issues: string[] = [];
  if (d.legalName.trim().length < 2) issues.push(badge === 'esa' ? 'your business name' : 'your name or organization');
  if (badge === 'verified') {
    if (!d.website.trim()) issues.push('your website or portfolio');
    if (d.about.trim().length < 20) issues.push('how you made your curricula (a few sentences)');
  } else {
    if (!d.states.length) issues.push('the states you’re approved in');
    if (d.vendorInfo.trim().length < 3) issues.push('your vendor IDs or links');
  }
  if (d.website.trim() && !normalizeUrl(d.website)) issues.push('a valid website address');
  if (d.sampleUrl.trim() && !normalizeUrl(d.sampleUrl)) issues.push('a valid sample link');
  if ([d.legalName, d.about, d.vendorInfo].some(looksLikeTaxId)) issues.push('no tax ID, Social Security, or bank numbers');
  return issues;
}

/** States with an ESA, voucher, or allotment program, for picking vendor approvals. */
export const ESA_PROGRAM_STATES = STATE_LAWS.filter((s) => s.funding.some((f) => f.kind === 'esa' || f.kind === 'allotment' || f.kind === 'voucher')).map((s) => s.code);

const STATE_NAME = new Map(STATE_LAWS.map((s) => [s.code, s.name]));
export const stateName = (code: string) => STATE_NAME.get(code) ?? code;

/** "Arizona, Florida, and Utah". */
export function stateList(codes: string[]): string {
  const names = [...codes].sort().map(stateName);
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

// ───────────────────────────── Storefronts

/** Where a listing's "visit the storefront" link goes; none for free & open curricula or family sellers. */
export function storefrontId(l: Pick<Listing, 'sellerKind' | 'creatorId'>): ID | undefined {
  if (l.sellerKind === 'open' || l.sellerKind === 'family') return undefined;
  return l.creatorId;
}

export interface StorefrontSummary {
  listings: number;
  reviews: number;
  /** Average stars across all their reviews (0 without reviews). */
  avg: number;
  /** Their best-rated listings first. */
  sorted: Listing[];
}

export function storefrontSummary(listings: Listing[]): StorefrontSummary {
  const reviews = listings.reduce((a, l) => a + l.ratingCount, 0);
  const avg = reviews ? Math.round((listings.reduce((a, l) => a + l.ratingAvg * l.ratingCount, 0) / reviews) * 10) / 10 : 0;
  const sorted = [...listings].sort((a, b) => weightedRating(b.ratingAvg, b.ratingCount) - weightedRating(a.ratingAvg, a.ratingCount) || a.title.localeCompare(b.title));
  return { listings: listings.length, reviews, avg, sorted };
}

/** Creators this family follows, named from the catalog (most listings first). */
export function followedCreators(listings: Listing[], following: ID[]): { id: ID; name: string; listings: number; verified: boolean }[] {
  const byId = new Map<ID, { id: ID; name: string; listings: number; verified: boolean }>();
  for (const l of listings) {
    const id = storefrontId(l);
    if (!id || !following.includes(id)) continue;
    const have = byId.get(id);
    byId.set(id, { id, name: have?.name ?? l.seller, listings: (have?.listings ?? 0) + 1, verified: (have?.verified ?? false) || l.sellerVerified });
  }
  return [...byId.values()].sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));
}
