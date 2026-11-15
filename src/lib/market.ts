import { addDays, ageOn, fromMinutes, schoolDatesBetween, toMinutes, todayKey, weekdayOf } from './dates';
import { uid } from './id';
import type { License } from './license';
import { lessonTotal, type PackageUnit } from './package';
import { currentPrice } from './pricing';
import type { AttentionMode, Child, ClockTime, Curriculum, DateKey, FamilyProfile, FundingSource, ID, Philosophy, RhythmBlock, Subject, Weekday } from './types';

/**
 * Curriculum Marketplace.
 *
 * Listings come from two kinds of sellers: publishers (new curricula, often
 * ESA-approved vendors) and families (used books and their own creations).
 * Families browse, buy, review, and turn a purchase into a paced plan: a
 * Curriculum (lesson count + target date) and RhythmBlocks on the schedule.
 */

export type ListingFormat = 'print' | 'digital' | 'online' | 'bundle';
/** Publishers, Studio creators, families selling used books, and free & open curricula (listed under their original author). */
export type SellerKind = 'publisher' | 'creator' | 'family' | 'open';
export type Involvement = 'high' | 'medium' | 'low';
export type Condition = 'new' | 'like_new' | 'good' | 'fair';

export interface Listing {
  id: ID;
  title: string;
  seller: string;
  sellerKind: SellerKind;
  sellerVerified: boolean;
  subjects: Subject[];
  /** -1 = Pre-K, 0 = Kindergarten, 1..12 = grades. */
  gradeMin: number;
  gradeMax: number;
  philosophies: Philosophy[];
  format: ListingFormat;
  price: number;
  condition?: Condition;
  description: string;
  includes: string[];
  lessons: number;
  lessonsPerWeek: number;
  minutesPerLesson: number;
  parentInvolvement: Involvement;
  /** All kids can do it together (morning basket, read-alouds, unit studies). */
  familyStyle: boolean;
  /** Steps each scheduled lesson starts with. */
  lessonSteps: string[];
  cover: string;
  color: string;
  esaEligible: boolean;
  /** States whose ESA programs approved this seller as a vendor. */
  esaStates?: string[];
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  /** Demo catalog entry (shown with a "Sample" badge). */
  sample?: boolean;
  /** The Studio creator selling it: their storefront is /creator/<creatorId>. */
  creatorId?: ID;
  /** Listed by this family (or this Studio creator). */
  mine?: boolean;
  /** Taken down by moderators (only its seller still sees it). */
  suspended?: boolean;
  /** Made in Studio: the full lesson plan comes with it. */
  packageId?: ID;
  /** Latest published release of its lesson plan. */
  packageVersion?: number;
  license?: License;
  /** Credit line required by the license. */
  attribution?: string;
  /** Unit and lesson titles, shown before buying. */
  outline?: { title: string; lessons: string[] }[];
  /** The creator's sale: percent off until `saleEndsAt`. */
  salePercent?: number;
  saleEndsAt?: string;
}

export interface Review {
  id: ID;
  listingId: ID;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  childGrade?: string;
  createdAt: string;
  verified: boolean;
  helpful: number;
  mine?: boolean;
  sample?: boolean;
  /** Hidden by moderators (only its author still sees it). */
  hidden?: boolean;
  /** How far the reviewer's family got, from their own plan (worked out on the server when signed in). */
  progress?: ReviewProgress;
  /** The family chose to show their progress (the default). */
  showProgress?: boolean;
}

export interface ReviewProgress {
  done: number;
  total: number;
}

/**
 * How far a family's plan is through the curriculum it got from a listing:
 * the furthest kid's lessons done, out of the curriculum's lessons
 * (mirrors listing_progress() on the server).
 */
export function reviewProgress(curricula: Pick<Curriculum, 'listingId' | 'totalLessons' | 'lessonsDone' | 'progress' | 'childIds'>[], listingId: ID): ReviewProgress | undefined {
  let best: ReviewProgress | undefined;
  for (const c of curricula) {
    if (c.listingId !== listingId || !(c.totalLessons >= 1)) continue;
    const total = Math.floor(c.totalLessons);
    const counts = c.childIds.length ? c.childIds.map((k) => c.progress?.[k] ?? c.lessonsDone) : [c.lessonsDone];
    const done = Math.min(total, Math.max(0, Math.floor(Math.max(...counts.map((n) => (Number.isFinite(n) ? n : 0))))));
    if (!best || done / total > best.done / best.total || (done / total === best.done / best.total && total > best.total)) best = { done, total };
  }
  return best;
}

/** "Finished 120/120 lessons" or "On lesson 35 of 120" (the lesson they're on now). */
export function progressLabel(p: ReviewProgress): string {
  if (p.done >= p.total) return `Finished ${p.total}/${p.total} lessons`;
  return `On lesson ${p.done + 1} of ${p.total}`;
}

export interface Purchase {
  id: ID;
  listingId: ID;
  title: string;
  seller: string;
  price: number;
  fundingSource: FundingSource;
  purchasedAt: string;
  status: 'paid' | 'free' | 'pending';
  /** Seller is an approved ESA vendor (for the expense tracker). */
  esaEligible: boolean;
  /** Demo purchases never charge a card. */
  demo?: boolean;
  curriculumId?: ID;
  /** Price before the sale, bundle, or coupon (when it was less). */
  listPrice?: number;
  /** Bought as part of this bundle. */
  bundleId?: ID;
  /** A gift from this family (the recipient paid nothing). */
  giftFrom?: string;
}

export const FORMAT_LABEL: Record<ListingFormat, string> = { print: '📦 Print', digital: '📄 Digital PDF', online: '💻 Online course', bundle: '🎁 Bundle' };
export const INVOLVEMENT_LABEL: Record<Involvement, string> = { high: 'Parent-led', medium: 'Some parent time', low: 'Mostly independent' };
/** Shown after the seller's name. */
export const SELLER_NOTE: Record<SellerKind, string> = { publisher: '', creator: ' · Studio creator', family: ' · family seller', open: ' · free & open' };
export const CONDITION_LABEL: Record<Condition, string> = { new: 'New', like_new: 'Like new', good: 'Good', fair: 'Fair' };

// ───────────────────────────── Selling

/** What's still missing or out of range on a listing a family sells (mirrors the listings table's checks). */
export function listingIssues(l: { title: string; subjects: Subject[]; price?: number; lessons?: number; minutesPerLesson?: number; description: string }): string[] {
  const title = l.title.trim();
  const description = l.description.trim();
  return [
    !title && 'a title',
    title.length > 160 && 'a shorter title (160 characters at most)',
    l.subjects.length === 0 && 'a subject',
    l.price === undefined && 'a price (0 for free)',
    l.price !== undefined && l.price > 10000 && 'a price of $10,000 or less',
    !l.lessons && 'number of lessons',
    !!l.lessons && l.lessons > 2000 && 'at most 2,000 lessons',
    !l.minutesPerLesson && 'minutes per lesson',
    !!l.minutesPerLesson && l.minutesPerLesson > 480 && 'at most 480 minutes per lesson',
    description.length < 10 && 'a short description',
    description.length > 4000 && 'a shorter description (4,000 characters at most)',
  ].filter((x): x is string => !!x);
}

// ───────────────────────────── Grades

export const GRADE_LABELS = ['Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade', '9th Grade', '10th Grade', '11th Grade', '12th Grade'];
const SHORT = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

/** "4th Grade" → 4, "Kindergarten" → 0, "Pre-K" → -1. */
export function gradeNumber(label: string): number | undefined {
  const i = GRADE_LABELS.indexOf(label);
  return i >= 0 ? i - 1 : undefined;
}

export function gradeRangeLabel(min: number, max: number): string {
  const a = SHORT[min + 1];
  const b = SHORT[max + 1];
  if (min === max) return min <= 0 ? a : `Grade ${a}`;
  return `${a}–${b}`;
}

export const fitsGrade = (l: Pick<Listing, 'gradeMin' | 'gradeMax'>, grade?: number) => grade !== undefined && grade >= l.gradeMin && grade <= l.gradeMax;

// ───────────────────────────── Ratings

/** Bayesian average so 5.0 from 2 reviews doesn't outrank 4.8 from 300. */
export function weightedRating(avg: number, count: number, prior = 4, weight = 8): number {
  return (avg * count + prior * weight) / (count + weight);
}

export function ratingSummary(reviews: Pick<Review, 'rating'>[]): { avg: number; count: number; histogram: Record<1 | 2 | 3 | 4 | 5, number> } {
  const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) histogram[r.rating]++;
  const count = reviews.length;
  const avg = count ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : 0;
  return { avg, count, histogram };
}

/** Listing stats folded together with reviews not yet counted in them (e.g. your own, written offline). */
export function withReviews(l: Listing, extra: Pick<Review, 'rating'>[]): Listing {
  if (!extra.length) return l;
  const total = l.ratingAvg * l.ratingCount + extra.reduce((a, r) => a + r.rating, 0);
  const count = l.ratingCount + extra.length;
  return { ...l, ratingAvg: Math.round((total / count) * 10) / 10, ratingCount: count };
}

// ───────────────────────────── Matching

export interface MatchContext {
  family?: Pick<FamilyProfile, 'philosophy'>;
  kids: Pick<Child, 'id' | 'name' | 'grade'>[];
}

export interface MatchResult {
  score: number;
  reasons: string[];
  /** Kids whose grade falls within the listing's range. */
  fitsKids: ID[];
}

/** How well a listing fits this family: teaching style, kids' grades, and reputation. */
export function matchListing(l: Listing, ctx: MatchContext): MatchResult {
  const reasons: string[] = [];
  let score = 0;
  const breakdown = ctx.family?.philosophy?.breakdown ?? [];
  const style = breakdown.filter((b) => l.philosophies.includes(b.philosophy));
  if (style.length) {
    const pct = style.reduce((a, b) => a + b.percent, 0);
    score += pct / 100; // 0..1
    reasons.push(`Fits your ${style.map((s) => PHILOSOPHY_SHORT[s.philosophy]).join(' + ')} style`);
  }
  const fitsKids = ctx.kids.filter((k) => fitsGrade(l, gradeNumber(k.grade))).map((k) => k.id);
  if (fitsKids.length) {
    score += 0.6 + 0.2 * (fitsKids.length - 1);
    const names = ctx.kids.filter((k) => fitsKids.includes(k.id)).map((k) => `${k.name} (${k.grade})`);
    reasons.push(`Right level for ${names.join(', ')}`);
  }
  score += (weightedRating(l.ratingAvg, l.ratingCount) - 3) / 4; // ~0..0.5
  if (l.familyStyle && fitsKids.length > 1) {
    score += 0.2;
    reasons.push('Teach several kids together');
  }
  return { score, reasons, fitsKids };
}

export const PHILOSOPHY_SHORT: Record<Philosophy, string> = {
  charlotte_mason: 'Charlotte Mason',
  classical: 'Classical',
  montessori: 'Montessori',
  unschooling: 'Unschooling',
  nature_forest: 'Nature-based',
  faith_based: 'Faith-based',
  unit_study: 'Unit study',
  traditional: 'Traditional',
};

// ───────────────────────────── Browse

export type SortKey = 'match' | 'rating' | 'reviews' | 'price_asc' | 'price_desc' | 'newest';
export const SORT_LABEL: Record<SortKey, string> = {
  match: 'Best match',
  rating: 'Top rated',
  reviews: 'Most reviewed',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  newest: 'Newest',
};

export type PriceBand = 'any' | 'free' | 'under25' | 'under75' | 'under150';
export const PRICE_LABEL: Record<PriceBand, string> = { any: 'Any price', free: 'Free', under25: 'Under $25', under75: 'Under $75', under150: 'Under $150' };
const PRICE_MAX: Record<PriceBand, number> = { any: Infinity, free: 0, under25: 25, under75: 75, under150: 150 };

export interface ListingFilters {
  query?: string;
  subjects?: Subject[];
  /** Only listings that fit at least one of these grades. */
  grades?: number[];
  philosophies?: Philosophy[];
  price?: PriceBand;
  formats?: ListingFormat[];
  esaOnly?: boolean;
  used?: 'any' | 'new' | 'used';
  minRating?: number;
}

export function filterListings(listings: Listing[], f: ListingFilters): Listing[] {
  const q = f.query?.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  return listings.filter((l) => {
    if (terms.length) {
      const hay = `${l.title} ${l.seller} ${l.description} ${l.subjects.join(' ')} ${l.philosophies.map((p) => PHILOSOPHY_SHORT[p]).join(' ')}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    if (f.subjects?.length && !l.subjects.some((s) => f.subjects!.includes(s))) return false;
    if (f.grades?.length && !f.grades.some((g) => fitsGrade(l, g))) return false;
    if (f.philosophies?.length && !l.philosophies.some((p) => f.philosophies!.includes(p))) return false;
    if (f.price && f.price !== 'any' && currentPrice(l) > PRICE_MAX[f.price]) return false;
    if (f.formats?.length && !f.formats.includes(l.format)) return false;
    if (f.esaOnly && !l.esaEligible) return false;
    if (f.used === 'used' && l.sellerKind !== 'family') return false;
    if (f.used === 'new' && l.sellerKind === 'family') return false;
    if (f.minRating && l.ratingAvg < f.minRating) return false;
    return true;
  });
}

export function sortListings(listings: Listing[], sort: SortKey, ctx: MatchContext): Listing[] {
  const out = [...listings];
  const by = {
    match: (l: Listing) => -matchListing(l, ctx).score,
    rating: (l: Listing) => -weightedRating(l.ratingAvg, l.ratingCount),
    reviews: (l: Listing) => -l.ratingCount,
    price_asc: (l: Listing) => currentPrice(l),
    price_desc: (l: Listing) => -currentPrice(l),
    newest: (l: Listing) => -Date.parse(l.createdAt),
  }[sort];
  return out.sort((a, b) => by(a) - by(b) || a.title.localeCompare(b.title));
}

export type ReviewSort = 'helpful' | 'newest' | 'high' | 'low' | 'progress';
export function sortReviews(reviews: Review[], sort: ReviewSort): Review[] {
  const out = [...reviews];
  const by = {
    helpful: (r: Review) => -r.helpful - (r.verified ? 0.5 : 0),
    newest: (r: Review) => -Date.parse(r.createdAt),
    high: (r: Review) => -r.rating,
    low: (r: Review) => r.rating,
    // Furthest through the curriculum first (finished ones on top); reviews without progress last.
    progress: (r: Review) => (r.progress ? -r.progress.done / r.progress.total - r.progress.done / 1e6 : 1),
  }[sort];
  return out.sort((a, b) => by(a) - by(b) || b.createdAt.localeCompare(a.createdAt));
}

// ───────────────────────────── Into the plan

/** The date the last lesson lands on when doing one lesson per chosen day. */
export function finishDateFor(start: DateKey, days: Weekday[], lessons: number): DateKey | undefined {
  if (!days.length || lessons <= 0) return undefined;
  // At most ~5 years of calendar to search, enough for any curriculum.
  const dates = schoolDatesBetween(start, addDays(start, Math.ceil((lessons / days.length) * 7) + 14), days);
  return dates[lessons - 1];
}

/** Default lesson days: spread `perWeek` over the family's school days. */
export function defaultLessonDays(perWeek: number, schoolDays: Weekday[]): Weekday[] {
  const days = [...schoolDays].sort();
  if (perWeek >= days.length) return days;
  if (perWeek <= 0) return [];
  const step = days.length / perWeek;
  return Array.from({ length: perWeek }, (_, i) => days[Math.floor(i * step)]);
}

export interface PlanOptions {
  childIds: ID[];
  startDate: DateKey;
  days: Weekday[];
  startTime: ClockTime;
  children: Pick<Child, 'id' | 'birthdate'>[];
}

/**
 * Turn a listing into a curriculum + rhythm blocks.
 * Family-style listings become one group block; otherwise each child gets
 * their own block. Parent-led blocks for different kids are staggered so the
 * parent isn't needed in two places at once.
 */
/** A package's lesson plan, delivered with the purchase. */
export interface PackageContent {
  units: PackageUnit[];
  version: number;
  license?: License;
  attribution?: string;
  /** The creator's "what's new" for this release. */
  note?: string;
}

export function planFromListing(l: Listing, o: PlanOptions, content?: PackageContent): { curriculum: Curriculum; blocks: RhythmBlock[]; finish?: DateKey } {
  const lessons = content ? lessonTotal(content.units) || l.lessons : l.lessons;
  const finish = finishDateFor(o.startDate, o.days, lessons);
  const curriculum: Curriculum = {
    id: uid('c'),
    name: l.title,
    subject: l.subjects[0] ?? 'other',
    childIds: o.childIds,
    totalLessons: lessons,
    lessonsDone: 0,
    progress: Object.fromEntries(o.childIds.map((id) => [id, 0])),
    startDate: o.startDate,
    targetEndDate: finish ?? addDays(o.startDate, 180),
    schoolDays: o.days,
    model: l.format === 'bundle' ? 'turnkey' : 'modular',
    listingId: l.id,
    ...(content
      ? { outline: content.units, packageId: l.packageId, packageVersion: content.version, license: content.license ?? l.license, attribution: content.attribution ?? l.attribution }
      : {}),
  };
  const modeFor = (childId: ID): AttentionMode => {
    if (l.parentInvolvement === 'high') return 'parent';
    if (l.parentInvolvement === 'low') return 'solo';
    const kid = o.children.find((k) => k.id === childId);
    return kid && ageOn(kid.birthdate) < 9 ? 'parent' : 'solo';
  };
  const base = { subject: curriculum.subject, durationMin: l.minutesPerLesson, days: o.days, icon: l.cover, steps: l.lessonSteps, curriculumId: curriculum.id };
  let blocks: RhythmBlock[];
  if (l.familyStyle && o.childIds.length > 1) {
    blocks = [{ ...base, id: uid('b'), title: l.title, childIds: o.childIds, mode: l.parentInvolvement === 'low' ? 'solo' : 'group', start: o.startTime }];
  } else {
    let parentCursor = toMinutes(o.startTime);
    blocks = o.childIds.map((childId) => {
      const mode = modeFor(childId);
      const start = mode === 'parent' ? parentCursor : toMinutes(o.startTime);
      if (mode === 'parent') parentCursor += l.minutesPerLesson;
      return { ...base, id: uid('b'), title: l.title, childIds: [childId], mode, start: fromMinutes(start) };
    });
  }
  return { curriculum, blocks, finish };
}

/** First school day on or after today, for a default start date. */
export function nextStartDate(schoolDays: Weekday[], from: DateKey = todayKey()): DateKey {
  for (let i = 0; i < 14; i++) {
    const d = addDays(from, i);
    if (schoolDays.includes(weekdayOf(d))) return d;
  }
  return from;
}

/**
 * Earliest start (08:30–16:00, 15-minute steps) when none of the children
 * already have a block on the chosen days — and, for parent-led work, when the
 * parent isn't committed to another 1-on-1 or group block.
 */
export function suggestStartTime(blocks: RhythmBlock[], childIds: ID[], days: Weekday[], durationMin: number, needsParent: boolean): ClockTime {
  const relevant = blocks.filter((b) => b.days.some((d) => days.includes(d)));
  const busy = relevant
    .filter((b) => b.childIds.some((c) => childIds.includes(c)) || (needsParent && (b.mode === 'parent' || b.mode === 'group')))
    .map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.start) + b.durationMin }));
  for (let t = 8 * 60 + 30; t + durationMin <= 16 * 60; t += 15) {
    if (!busy.some((b) => t < b.end && b.start < t + durationMin)) return fromMinutes(t);
  }
  return '13:00';
}
