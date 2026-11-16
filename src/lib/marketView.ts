import { FORMAT_LABEL, filterListings, PHILOSOPHY_SHORT, PRICE_LABEL, SORT_LABEL, type Listing, type ListingFilters, type ListingFormat, type PriceBand, type Purchase, type SortKey } from './market';
import { SUBJECT_LIST, SUBJECTS } from './subjects';
import type { Bundle } from './pricing';
import type { Curriculum, ID, Philosophy, Subject } from './types';

/**
 * What the Marketplace screens show, worked out from the catalog and the
 * family's choices: option counts in Filters, why a search came up empty,
 * which sorts make sense, how My library is grouped, and a few labels.
 */

// ───────────────────────────── Labels

/** Free & open classics are books to read online, not courses. */
export function formatLabel(l: Pick<Listing, 'format' | 'sellerKind'>): string {
  if (l.format === 'online' && l.sellerKind === 'open') return '📖 Free online text';
  return FORMAT_LABEL[l.format];
}

/** "Burgess Bird Book, by Thornton Burgess, free, grades 1–4" — what a screen reader says for a listing card. */
export function listingCardLabel(l: Pick<Listing, 'title' | 'seller' | 'sellerKind'>, price: string, grades: string, owned?: boolean): string {
  const by = l.sellerKind === 'open' ? `by ${l.seller}` : `from ${l.seller}${l.sellerKind === 'family' ? ', a family' : ''}`;
  const g = grades.startsWith('Grade') ? grades.replace('Grade', 'grade') : grades === 'K' ? 'kindergarten' : grades === 'Pre-K' ? 'pre-K' : `grades ${grades}`;
  return [l.title, by, price === 'Free' ? 'free' : price, g, owned ? 'you own it' : ''].filter(Boolean).join(', ');
}

/**
 * A credit line split into its words and the source link, so the link can be a real button
 * ("Read the free full text") instead of a long address in the middle of a sentence.
 */
export function splitCredit(credit: string): { text: string; url?: string; linkLabel?: string; more?: string[] } {
  // License deeds are linked from the license card itself.
  const attribution = credit.replace(/\s*\(https?:\/\/creativecommons\.org[^)]*\)/g, '');
  const urls = [...attribution.matchAll(/https?:\/\/[^\s,)]+/g)].map((m) => m[0].replace(/[.;:]+$/, ''));
  if (!urls.length) return { text: attribution };
  const fullText = /free full text/i.test(attribution);
  let text = attribution.replace(/\s*Free full text:\s*/i, ' ');
  for (const u of urls) text = text.split(`(${u})`).join('').split(u).join('');
  text = text
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([.,])/g, '$1')
    .replace(/,\./g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const [url, ...more] = urls;
  return { text, url, linkLabel: fullText ? 'Read the free full text' : 'See the original', ...(more.length ? { more } : {}) };
}

/** "Public domain" rather than "Public domain — Public domain". */
export function licenseHeading(name: string, label: string): string {
  return name === label || label.startsWith(name) ? label : `${name} · ${label}`;
}

// ───────────────────────────── Browse

/** Rating sorts only mean something once some curricula have reviews. */
export function sortOptions(listings: Pick<Listing, 'ratingCount'>[]): SortKey[] {
  const rated = listings.some((l) => l.ratingCount > 0);
  return (Object.keys(SORT_LABEL) as SortKey[]).filter((k) => rated || (k !== 'rating' && k !== 'reviews'));
}

/** Whether to offer the Rating filter at all. */
export const hasRatings = (listings: Pick<Listing, 'ratingCount'>[]) => listings.some((l) => l.ratingCount > 0);

export interface FilterCounts {
  price: Record<PriceBand, number>;
  used: Record<'any' | 'new' | 'used', number>;
  formats: Record<ListingFormat, number>;
  philosophies: Record<Philosophy, number>;
  rating: Record<number, number>;
  esa: number;
}

/**
 * How many curricula each option in Filters would show, given everything else
 * that's chosen. Pick-one groups count that option instead of the current one;
 * pick-many groups count the option alone (what tapping it on its own shows).
 */
export function filterCounts(listings: Listing[], f: ListingFilters): FilterCounts {
  const n = (over: Partial<ListingFilters>) => filterListings(listings, { ...f, ...over }).length;
  const bands: PriceBand[] = Object.keys(PRICE_LABEL) as PriceBand[];
  return {
    price: Object.fromEntries(bands.map((p) => [p, n({ price: p })])) as Record<PriceBand, number>,
    used: { any: n({ used: 'any' }), new: n({ used: 'new' }), used: n({ used: 'used' }) },
    formats: Object.fromEntries((Object.keys(FORMAT_LABEL) as ListingFormat[]).map((x) => [x, n({ formats: [x] })])) as Record<ListingFormat, number>,
    philosophies: Object.fromEntries((Object.keys(PHILOSOPHY_SHORT) as Philosophy[]).map((p) => [p, n({ philosophies: [p] })])) as Record<Philosophy, number>,
    rating: Object.fromEntries([0, 3, 4, 4.5].map((r) => [r, n({ minRating: r })])),
    esa: n({ esaOnly: true }),
  };
}

export interface EmptyState {
  title: string;
  body: string;
  /** Buttons to offer, most useful first. */
  actions: ('clear_search' | 'all_grades' | 'clear_filters')[];
  /** Subjects that do have curricula with the other choices kept. */
  subjects: { subject: Subject; count: number }[];
}

/**
 * What to say when Browse shows nothing, by cause: a search with no hits, the
 * kids' grades, or the filters. Offers the fixes that would actually help.
 */
export function emptyState(listings: Listing[], f: ListingFilters, opts: { mineGrades: boolean }): EmptyState {
  const q = f.query?.trim();
  const extra = !!(f.subjects?.length || (f.price && f.price !== 'any') || f.formats?.length || f.philosophies?.length || f.esaOnly || (f.used && f.used !== 'any') || f.minRating);
  const allGradesHelps = opts.mineGrades && filterListings(listings, { ...f, grades: undefined }).length > 0;
  const actions: EmptyState['actions'] = [];
  if (q) actions.push('clear_search');
  if (allGradesHelps) actions.push('all_grades');
  if (extra) actions.push('clear_filters');
  // Nearby subjects: what the rest of the choices would find in another subject.
  const relaxed = filterListings(listings, { ...f, subjects: undefined, query: undefined });
  const subjects = SUBJECT_LIST.map((s) => ({ subject: s, count: relaxed.filter((l) => l.subjects.includes(s)).length }))
    .filter((x) => x.count > 0 && !f.subjects?.includes(x.subject))
    .sort((a, b) => b.count - a.count || SUBJECTS[a.subject].label.localeCompare(SUBJECTS[b.subject].label))
    .slice(0, 3);
  if (q) {
    return {
      title: `No curricula match “${q}”`,
      body: allGradesHelps ? 'Only your kids’ grades are searched right now. Check the spelling, try a shorter word, or search all grades.' : 'Check the spelling or try a shorter word, like a subject or an author.',
      actions,
      subjects,
    };
  }
  if (allGradesHelps && !extra) {
    return { title: 'Nothing for your kids’ grades here yet', body: 'There are curricula for other grades. Show all grades to see them.', actions, subjects };
  }
  return { title: 'Nothing matches those filters', body: allGradesHelps ? 'Try fewer filters or all grades.' : 'Try fewer filters.', actions: actions.length ? actions : ['clear_filters'], subjects };
}

/** Curricula by creators this family follows, newest first. */
export function fromFollowed(listings: Listing[], following: ID[], limit = 6): Listing[] {
  if (!following.length) return [];
  return listings
    .filter((l) => !l.mine && l.creatorId && following.includes(l.creatorId) && l.sellerKind !== 'open' && l.sellerKind !== 'family')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * Bundles worth showing above the results: the ones with the most curricula
 * among the results first, at most `limit` (the rest are a tap away).
 */
export function topBundles<B extends Pick<Bundle, 'id' | 'listingIds'>>(bundles: B[], shownIds: Set<ID>, limit = 2): { shown: B[]; total: number } {
  const matching = bundles
    .map((b, i) => ({ b, i, hits: b.listingIds.filter((id) => shownIds.has(id)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.i - b.i)
    .map((x) => x.b);
  return { shown: matching.slice(0, limit), total: matching.length };
}

// ───────────────────────────── My library

export interface LibraryGroups {
  /** Not in the plan yet (excluding gifts). */
  notStarted: Purchase[];
  inPlan: Purchase[];
  /** Gifts not in the plan yet. */
  gifts: Purchase[];
}

export function groupLibrary(purchases: Purchase[], curricula: Pick<Curriculum, 'id'>[]): LibraryGroups {
  const planned = new Set(curricula.map((c) => c.id));
  const inPlan = (p: Purchase) => !!p.curriculumId && planned.has(p.curriculumId);
  const newest = (a: Purchase, b: Purchase) => b.purchasedAt.localeCompare(a.purchasedAt);
  return {
    notStarted: purchases.filter((p) => !inPlan(p) && !p.giftFrom).sort(newest),
    inPlan: purchases.filter(inPlan).sort(newest),
    gifts: purchases.filter((p) => !inPlan(p) && !!p.giftFrom).sort(newest),
  };
}

// ───────────────────────────── Add to plan

/** Every lesson in the plan already links to its text or video, so asking for a link is optional. */
export function everyLessonLinked(outline: { lessons: { links?: unknown[] }[] }[] | undefined): boolean {
  const lessons = (outline ?? []).flatMap((u) => u.lessons);
  return lessons.length > 0 && lessons.every((l) => (l.links?.length ?? 0) > 0);
}

/** "Leo & Noah", "Leo, Noah & Mia". */
export function namesList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

// ───────────────────────────── Selling

/** Inline message for a number field: empty is fine (it's listed under "Still needed"), letters aren't. */
export function numberFieldError(text: string, example: number, max?: number): string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (!/^\d+$/.test(t)) return `Enter a number, e.g. ${example}`;
  const n = Number(t);
  if (n < 1) return 'Enter 1 or more';
  if (max !== undefined && n > max) return `At most ${max.toLocaleString('en-US')}`;
  return undefined;
}
