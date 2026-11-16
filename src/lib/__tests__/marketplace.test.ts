import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { formatGiftCode, GIFT_NOTE_MAX, isEmail, normalizeGiftCode, randomCode } from '../gifts';
import {
  fitsGrade,
  filterListings,
  gradeRangeLabel,
  listingIssues,
  matchListing,
  ratingSummary,
  reviewProgress,
  sortListings,
  sortReviews,
  withReviews,
  type Listing,
  type Review,
} from '../market';
import { allocate, bundleIssues, bundleSummary, couponDiscount, couponIssues, couponProblem, currentPrice, normalizeCode, onSale, quote, saleIssues, type Bundle, type Coupon, type QuoteContext } from '../pricing';
import type { Child } from '../types';

// Edge cases for browsing, matching, pricing, and gifts (the basics are in
// market.test.ts and pricing.test.ts). Dates are relative to a fixed NOW.

const NOW = new Date('2026-11-14T12:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();
// Browsing and pricing read the clock (a sale ends at a moment in time): pin it to NOW.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

const base: Listing = {
  id: 'l1', title: 'Fraction Forest', seller: 'Test Press', sellerKind: 'publisher', sellerVerified: true, subjects: ['math'], gradeMin: 3, gradeMax: 5,
  philosophies: ['charlotte_mason'], format: 'print', price: 40, description: 'Gentle fractions outdoors', includes: [], lessons: 20, lessonsPerWeek: 2, minutesPerLesson: 30,
  parentInvolvement: 'high', familyStyle: false, lessonSteps: [], cover: '🧮', color: '#000', esaEligible: true, ratingAvg: 4.5, ratingCount: 10, createdAt: '2026-01-01T00:00:00Z',
};
const L = (p: Partial<Listing>): Listing => ({ ...base, ...p });
const kid = (id: string, grade: string): Pick<Child, 'id' | 'name' | 'grade'> => ({ id, name: id, grade });
const R = (id: string, p: Partial<Review> = {}): Review => ({ id, listingId: 'l1', author: 'A', rating: 4, title: '', body: 'x', createdAt: '2026-01-01T00:00:00Z', verified: false, helpful: 0, ...p });

describe('search and filters', () => {
  const list = [
    L({ id: 'a', title: 'Fraction Forest', seller: 'Test Press' }),
    L({ id: 'b', title: 'Phonics Fun', seller: 'Rosa R.', sellerKind: 'family', subjects: ['phonics'], gradeMin: -1, gradeMax: 0, price: 30, salePercent: 50, saleEndsAt: inDays(2), esaEligible: false, philosophies: [] }),
    L({ id: 'c', title: 'Aesop', seller: 'Aesop', sellerKind: 'open', subjects: ['reading'], gradeMin: 0, gradeMax: 3, price: 0, esaEligible: false, ratingAvg: 0, ratingCount: 0, format: 'online', philosophies: [] }),
    L({ id: 'd', title: 'Space Science', seller: 'Maple Room', sellerKind: 'creator', subjects: ['science'], gradeMin: 6, gradeMax: 8, price: 80, salePercent: 50, saleEndsAt: inDays(-1), format: 'digital' }),
  ];
  const ids = (f: Parameters<typeof filterListings>[1]) => filterListings(list, f).map((l) => l.id);

  it('matches every word, in any field, ignoring case and extra spaces', () => {
    expect(ids({ query: '  FRACTION   press ' })).toEqual(['a']);
    expect(ids({ query: 'rosa' })).toEqual(['b']);
    expect(ids({ query: 'charlotte mason' })).toEqual(['a', 'd']);
    expect(ids({ query: 'science maple' })).toEqual(['d']);
    expect(ids({ query: 'forest phonics' })).toEqual([]);
    expect(ids({ query: '   ' })).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by price today, so a running sale counts and an ended one doesn’t', () => {
    // Phonics Fun is $30 but $15 on sale; Space Science's sale ended.
    expect(ids({ price: 'under25' })).toEqual(['b', 'c']);
    expect(ids({ price: 'under75' })).toEqual(['a', 'b', 'c']);
    expect(ids({ price: 'under150' })).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ price: 'free' })).toEqual(['c']);
    expect(ids({ price: 'any' })).toEqual(['a', 'b', 'c', 'd']);
  });

  it('treats creators and free & open curricula as new; only families sell used', () => {
    expect(ids({ used: 'used' })).toEqual(['b']);
    expect(ids({ used: 'new' })).toEqual(['a', 'c', 'd']);
    expect(ids({ used: 'any' })).toEqual(['a', 'b', 'c', 'd']);
  });

  it('combines filters, and empty lists mean no filter', () => {
    expect(ids({ subjects: [], grades: [], philosophies: [], formats: [] })).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ grades: [-1] })).toEqual(['b']);
    expect(ids({ grades: [0], subjects: ['reading', 'phonics'] })).toEqual(['b', 'c']);
    expect(ids({ formats: ['online', 'digital'], esaOnly: true })).toEqual(['d']);
    expect(ids({ minRating: 4.5 })).toEqual(['a', 'b', 'd']);
    expect(ids({ minRating: 4.6 })).toEqual([]);
    expect(ids({ minRating: 0 })).toEqual(['a', 'b', 'c', 'd']);
  });

  it('knows which grades a listing fits', () => {
    expect(fitsGrade(base, 3)).toBe(true);
    expect(fitsGrade(base, 5)).toBe(true);
    expect(fitsGrade(base, 6)).toBe(false);
    expect(fitsGrade(base, undefined)).toBe(false);
    expect(gradeRangeLabel(-1, -1)).toBe('Pre-K');
    expect(gradeRangeLabel(0, 0)).toBe('K');
    expect(gradeRangeLabel(12, 12)).toBe('Grade 12');
    expect(gradeRangeLabel(9, 12)).toBe('9–12');
  });
});

describe('selling a used curriculum', () => {
  const ok = { title: 'Math 3 set', subjects: ['math' as const], price: 25, lessons: 120, minutesPerLesson: 30, description: 'Gently used, complete.' };

  it('needs the basics, and 0 is a fine price', () => {
    expect(listingIssues(ok)).toEqual([]);
    expect(listingIssues({ ...ok, price: 0 })).toEqual([]);
    expect(listingIssues({ title: '  ', subjects: [], price: undefined, lessons: undefined, minutesPerLesson: undefined, description: 'short' })).toEqual(['a title', 'a subject', 'a price (0 for free)', 'number of lessons', 'minutes per lesson', 'a short description']);
  });

  it('stays within what the live marketplace accepts', () => {
    expect(listingIssues({ ...ok, lessons: 2000, minutesPerLesson: 480, price: 10000, title: 'x'.repeat(160), description: 'x'.repeat(4000) })).toEqual([]);
    expect(listingIssues({ ...ok, lessons: 2001 })).toEqual(['at most 2,000 lessons']);
    expect(listingIssues({ ...ok, minutesPerLesson: 481 })).toEqual(['at most 480 minutes per lesson']);
    expect(listingIssues({ ...ok, price: 10000.01 })).toEqual(['a price of $10,000 or less']);
    expect(listingIssues({ ...ok, title: 'x'.repeat(161) })).toEqual(['a shorter title (160 characters at most)']);
    expect(listingIssues({ ...ok, description: 'x'.repeat(4001) })).toEqual(['a shorter description (4,000 characters at most)']);
  });
});

describe('sorting', () => {
  const ctx = { kids: [] };
  const list = [
    L({ id: 'x', title: 'Zebra', price: 20, ratingAvg: 5, ratingCount: 2, createdAt: '2026-03-01T00:00:00Z' }),
    L({ id: 'y', title: 'Apple', price: 20, ratingAvg: 4.7, ratingCount: 200, createdAt: '2026-02-01T00:00:00Z' }),
    L({ id: 'z', title: 'Mango', price: 50, salePercent: 80, saleEndsAt: inDays(3), ratingAvg: 0, ratingCount: 0, createdAt: '2026-04-01T00:00:00Z' }),
  ];
  const ids = (k: Parameters<typeof sortListings>[1]) => sortListings(list, k, ctx).map((l) => l.id);

  it('by price uses today’s price, and ties go alphabetically', () => {
    expect(ids('price_asc')).toEqual(['z', 'y', 'x']);
    expect(ids('price_desc')).toEqual(['y', 'x', 'z']);
  });

  it('by rating trusts many reviews over a couple of perfect ones', () => {
    expect(ids('rating')).toEqual(['y', 'x', 'z']);
    expect(ids('reviews')).toEqual(['y', 'x', 'z']);
    expect(ids('newest')).toEqual(['z', 'x', 'y']);
  });

  it('never reorders the input list', () => {
    const before = list.map((l) => l.id);
    sortListings(list, 'price_asc', ctx);
    expect(list.map((l) => l.id)).toEqual(before);
  });
});

describe('matching a family', () => {
  it('with no style or kids, ranks on reputation alone', () => {
    const m = matchListing(base, { kids: [] });
    expect(m.reasons).toEqual([]);
    expect(m.fitsKids).toEqual([]);
    expect(m.score).toBeCloseTo((((4.5 * 10 + 4 * 8) / 18) - 3) / 4);
  });

  it('counts each kid at the right level, and family style only for siblings who fit', () => {
    const fam = L({ familyStyle: true });
    const one = matchListing(fam, { kids: [kid('ava', '3rd Grade'), kid('ben', '8th Grade')] });
    expect(one.fitsKids).toEqual(['ava']);
    expect(one.reasons.join(' ')).not.toMatch(/together/);
    const two = matchListing(fam, { kids: [kid('ava', '3rd Grade'), kid('cy', '5th Grade')] });
    expect(two.fitsKids).toEqual(['ava', 'cy']);
    expect(two.reasons).toContain('Teach several kids together');
    expect(two.score - one.score).toBeCloseTo(0.2 + 0.2);
    // A grade the app doesn't know never fits.
    expect(matchListing(base, { kids: [kid('dee', 'Year 4')] }).fitsKids).toEqual([]);
  });

  it('adds the share of the family’s style the listing teaches', () => {
    const family = { philosophy: { breakdown: [{ philosophy: 'charlotte_mason' as const, percent: 60 }, { philosophy: 'classical' as const, percent: 40 }], dimensions: { structure: 0, experiential: 0, faith: 0, screenFree: 0, collective: 0 }, takenAt: '' } };
    const cm = matchListing(base, { family, kids: [] });
    const both = matchListing(L({ philosophies: ['charlotte_mason', 'classical'] }), { family, kids: [] });
    expect(both.score - cm.score).toBeCloseTo(0.4);
    expect(both.reasons[0]).toBe('Fits your Charlotte Mason + Classical style');
  });
});

describe('reviews', () => {
  it('summarize to nothing when there are none', () => {
    expect(ratingSummary([])).toEqual({ avg: 0, count: 0, histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    expect(withReviews(base, [])).toBe(base);
    expect(withReviews(L({ ratingAvg: 0, ratingCount: 0 }), [{ rating: 3 }])).toMatchObject({ ratingAvg: 3, ratingCount: 1 });
  });

  it('sort helpful ones first, verified purchases breaking ties, then newest', () => {
    const list = [R('old', { helpful: 2, createdAt: '2026-01-01T00:00:00Z' }), R('new', { helpful: 2, createdAt: '2026-05-01T00:00:00Z' }), R('ver', { helpful: 2, verified: true, createdAt: '2025-01-01T00:00:00Z' }), R('top', { helpful: 3 })];
    expect(sortReviews(list, 'helpful').map((r) => r.id)).toEqual(['top', 'ver', 'new', 'old']);
    expect(sortReviews([R('a', { rating: 2 }), R('b', { rating: 5 }), R('c', { rating: 3 })], 'high').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(sortReviews([R('a', { rating: 2 }), R('b', { rating: 5 }), R('c', { rating: 3 })], 'low').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('work out progress from messy plan data without trusting it', () => {
    const c = (o: Record<string, unknown>) => ({ listingId: 'l1', totalLessons: 10, lessonsDone: 0, childIds: [] as string[], ...o }) as Parameters<typeof reviewProgress>[0][number];
    expect(reviewProgress([c({ lessonsDone: -5 })], 'l1')).toEqual({ done: 0, total: 10 });
    expect(reviewProgress([c({ lessonsDone: Number.NaN })], 'l1')).toEqual({ done: 0, total: 10 });
    expect(reviewProgress([c({ lessonsDone: 3.9, totalLessons: 10.7 })], 'l1')).toEqual({ done: 3, total: 10 });
    expect(reviewProgress([c({ totalLessons: Number.NaN })], 'l1')).toBeUndefined();
    expect(reviewProgress([], 'l1')).toBeUndefined();
    // Two plans of the same curriculum: the one further along wins; on a tie, the longer one.
    expect(reviewProgress([c({ lessonsDone: 2 }), c({ lessonsDone: 8 })], 'l1')).toEqual({ done: 8, total: 10 });
    expect(reviewProgress([c({ lessonsDone: 10 }), c({ lessonsDone: 20, totalLessons: 20 })], 'l1')).toEqual({ done: 20, total: 20 });
  });
});

describe('pricing edge cases', () => {
  const pond = L({ id: 'pond', title: 'Pond', sellerKind: 'creator', price: 20 });
  const birds = L({ id: 'birds', title: 'Birds', sellerKind: 'creator', price: 10 });
  const free = L({ id: 'free', title: 'Free', sellerKind: 'creator', price: 0 });
  const coupon = (p: Partial<Coupon>): Coupon => ({ id: `c-${p.code}`, code: 'X', kind: 'percent', amount: 10, uses: 0, active: true, createdAt: '', ...p });
  const bundle: Bundle = { id: 'b', title: 'Both', description: '', seller: 'Me', listingIds: ['pond', 'birds'], price: 25, cover: '', color: '', status: 'active', createdAt: '' };
  const ctx = (p: Partial<QuoteContext> = {}): QuoteContext => ({ listings: [pond, birds, free], bundles: [bundle], coupons: [], owned: new Set(), now: NOW, ...p });

  it('sales start and stop exactly at their end time', () => {
    const l = L({ price: 10, salePercent: 30, saleEndsAt: NOW.toISOString() });
    expect(onSale(l, NOW)).toBe(false);
    expect(onSale(l, new Date(NOW.getTime() - 1))).toBe(true);
    expect(currentPrice(L({ price: 0.99, salePercent: 33, saleEndsAt: inDays(1) }), NOW)).toBe(0.66);
    expect(currentPrice(L({ price: 10, salePercent: 30 }), NOW)).toBe(10);
  });

  it('coupons never take a price below zero', () => {
    expect(couponDiscount({ kind: 'fixed', amount: 50 }, 20)).toBe(20);
    expect(couponDiscount({ kind: 'percent', amount: 100 }, 20)).toBe(20);
    expect(couponDiscount({ kind: 'percent', amount: 33 }, 0.1)).toBe(0.03);
    expect(quote({ kind: 'listing', id: 'pond' }, ctx({ coupons: [coupon({ code: 'HUGE', kind: 'fixed', amount: 999 })], code: 'huge' }))).toMatchObject({ price: 20, discount: 20, total: 0 });
    expect(quote({ kind: 'listing', id: 'free' }, ctx({ coupons: [coupon({ code: 'TEN' })], code: 'TEN' }))).toMatchObject({ discount: 0, total: 0 });
  });

  it('refuse inactive, used-up, and expired coupons; a limit-less one never runs out', () => {
    const t = { kind: 'listing' as const, id: 'pond' };
    expect(couponProblem(undefined, t, NOW)).toMatch(/doesn’t work/);
    expect(couponProblem(coupon({ active: false }), t, NOW)).toMatch(/doesn’t work/);
    expect(couponProblem(coupon({ listingId: 'birds' }), t, NOW)).toMatch(/doesn’t work/);
    expect(couponProblem(coupon({ listingId: 'pond' }), { kind: 'bundle', id: 'pond' }, NOW)).toMatch(/doesn’t work/);
    expect(couponProblem(coupon({ expiresAt: NOW.toISOString() }), t, NOW)).toMatch(/expired/);
    expect(couponProblem(coupon({ expiresAt: inDays(1) }), t, NOW)).toBeUndefined();
    expect(couponProblem(coupon({ maxUses: 3, uses: 3 }), t, NOW)).toMatch(/used up/);
    expect(couponProblem(coupon({ maxUses: 3, uses: 2 }), t, NOW)).toBeUndefined();
    expect(couponProblem(coupon({ uses: 1e6 }), t, NOW)).toBeUndefined();
    // Codes match after trimming and upper-casing.
    expect(normalizeCode('  spring-10 ')).toBe('SPRING-10');
    expect(() => quote(t, ctx({ coupons: [coupon({ code: 'SPRING-10' })], code: 'spring-1' }))).toThrow('doesn’t work');
  });

  it('bundles skip curricula that were taken down, and can be bought for less than the bundle price', () => {
    const s = bundleSummary(bundle, [pond, L({ ...birds, suspended: true })], new Set(), NOW);
    expect(s.items.map((l) => l.id)).toEqual(['pond']);
    expect(s).toMatchObject({ listTotal: 20, price: 20, save: 0 });
    expect(quote({ kind: 'bundle', id: 'b' }, ctx({ listings: [pond, L({ ...birds, suspended: true })] }))).toMatchObject({ price: 20, total: 20 });
    expect(() => quote({ kind: 'bundle', id: 'b' }, ctx({ bundles: [{ ...bundle, status: 'removed' }] }))).toThrow('no longer available');
    expect(() => quote({ kind: 'bundle', id: 'b' }, ctx({ bundles: [{ ...bundle, mine: true }] }))).toThrow('your own bundle');
    expect(() => quote({ kind: 'listing', id: 'pond' }, ctx({ listings: [L({ ...pond, suspended: true })] }))).toThrow('no longer available');
  });

  it('split a bundle’s total so the shares always add up to it', () => {
    const q = quote({ kind: 'bundle', id: 'b' }, ctx({ coupons: [coupon({ code: 'ODD', kind: 'fixed', amount: 0.01 })], code: 'ODD' }));
    expect(q.total).toBe(24.99);
    expect(Math.round(q.items.reduce((a, i) => a + i.price, 0) * 100)).toBe(2499);
    for (const [total, weights] of [[100, [33.33, 33.33, 33.34]], [0.01, [1, 1, 1]], [19.99, [7, 13]], [5, [0, 3]]] as [number, number[]][]) {
      const parts = allocate(total, weights);
      expect(Math.round(parts.reduce((a, b) => a + b, 0) * 100), `${total} over ${weights}`).toBe(Math.round(total * 100));
      expect(parts.every((p) => p >= 0)).toBe(true);
    }
  });

  it('validate the sale, bundle, and coupon forms at their limits', () => {
    expect(saleIssues(5, inDays(1), 10, NOW)).toEqual([]);
    expect(saleIssues(90, inDays(365), 10, NOW)).toEqual([]);
    expect(saleIssues(4, inDays(1), 10, NOW)).toHaveLength(1);
    expect(saleIssues(91, inDays(1), 10, NOW)).toHaveLength(1);
    expect(saleIssues(undefined, undefined, 10, NOW)).toHaveLength(2);
    expect(saleIssues(10, 'not a date', 10, NOW)).toEqual(['an end date within the next year']);
    const twenty = Array.from({ length: 21 }, (_, i) => `l${i}`);
    expect(bundleIssues({ title: 'Big', listingIds: twenty, price: 1 }, [])).toEqual(['at most 20 curricula']);
    expect(bundleIssues({ title: 'Free', listingIds: ['free', 'free2'], price: 0 }, [free, L({ ...free, id: 'free2' })])).toEqual([]);
    expect(bundleIssues({ title: 'Neg', listingIds: ['pond', 'birds'], price: Number.NaN }, [pond, birds])).toEqual(['a bundle price']);
    expect(couponIssues({ code: 'OK1', kind: 'fixed', amount: -1 })).toEqual(['an amount']);
    expect(couponIssues({ code: 'OK1', kind: 'percent', amount: 100 })).toEqual([]);
    expect(couponIssues({ code: '-AB', kind: 'percent', amount: 5 })).toEqual(['a code of 3–24 letters or numbers']);
    expect(couponIssues({ code: 'A'.repeat(24), kind: 'percent', amount: 5 })).toEqual([]);
    expect(couponIssues({ code: 'A'.repeat(25), kind: 'percent', amount: 5 })).toEqual(['a code of 3–24 letters or numbers']);
    expect(couponIssues({ code: 'ok1', kind: 'percent', amount: 5 }, [{ code: 'OK1' }])).toEqual(['a code you haven’t used yet']);
  });
});

describe('gift codes', () => {
  it('use an alphabet without look-alike characters', () => {
    for (let i = 0; i < 50; i++) expect(randomCode(10)).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(randomCode(4, () => 0)).toBe('AAAA');
    expect(randomCode(3, () => 0.9999)).toBe('999');
  });

  it('are typed in loosely and shown in two halves', () => {
    expect(normalizeGiftCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
    expect(normalizeGiftCode('ab cd.ef_gh!jk')).toBe('ABCDEFGHJK');
    expect(formatGiftCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(formatGiftCode('ABC')).toBe('ABC');
    expect(GIFT_NOTE_MAX).toBe(500);
  });

  it('go to something shaped like an email address (the server checks the same way)', () => {
    for (const ok of ['a@b.co', ' grandma@example.com ', 'x+y@sub.example.org']) expect(isEmail(ok), ok).toBe(true);
    for (const bad of ['', 'grandma', 'a@b', '@b.co', 'a@@b.co', 'a b@c.co', 'a@b .co']) expect(isEmail(bad), bad).toBe(false);
  });
});
