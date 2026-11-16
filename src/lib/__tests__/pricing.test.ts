import { describe, expect, it } from 'vitest';

import type { Listing } from '../market';
import {
  allocate,
  bundleIssues,
  bundleSummary,
  couponIssues,
  couponLabel,
  currentPrice,
  onSale,
  quote,
  saleIssues,
  savePercent,
  type Bundle,
  type Coupon,
  type QuoteContext,
} from '../pricing';

const NOW = new Date('2026-11-14T12:00:00Z');
const later = '2026-11-21T12:00:00Z';
const earlier = '2026-11-01T12:00:00Z';

const base: Listing = {
  id: 'l1', title: 'Pond Life', seller: 'Ms T', sellerKind: 'creator', sellerVerified: false, subjects: ['science'], gradeMin: 1, gradeMax: 3,
  philosophies: [], format: 'digital', price: 20, description: '', includes: [], lessons: 10, lessonsPerWeek: 3, minutesPerLesson: 30,
  parentInvolvement: 'medium', familyStyle: false, lessonSteps: [], cover: '🐸', color: '#000', esaEligible: false, ratingAvg: 0, ratingCount: 0, createdAt: '2026-01-01T00:00:00Z',
};
const L = (p: Partial<Listing>): Listing => ({ ...base, ...p });
const pond = L({ salePercent: 25, saleEndsAt: later });
const birds = L({ id: 'l2', title: 'Bird Math', price: 10, esaEligible: true });
const free = L({ id: 'l3', title: 'Free Notes', price: 0 });
const bundle: Bundle = { id: 'b1', title: 'Pond + Birds', description: '', seller: 'Ms T', listingIds: ['l1', 'l2'], price: 24, cover: '🎁', color: '#000', status: 'active', createdAt: '' };
const coupon = (p: Partial<Coupon>): Coupon => ({ id: `c-${p.code}`, code: 'WELCOME10', kind: 'percent', amount: 10, uses: 0, active: true, createdAt: '', ...p });
const coupons = [coupon({}), coupon({ code: 'POND5', kind: 'fixed', amount: 5, listingId: 'l1' }), coupon({ code: 'OLD', expiresAt: earlier }), coupon({ code: 'ONCE', maxUses: 1, uses: 1 }), coupon({ code: 'ALL', amount: 100 })];
const ctx = (p: Partial<QuoteContext> = {}): QuoteContext => ({ listings: [pond, birds, free], bundles: [bundle], coupons, owned: new Set(), now: NOW, ...p });

describe('sales', () => {
  it('apply only until the end date', () => {
    expect(onSale(pond, NOW)).toBe(true);
    expect(currentPrice(pond, NOW)).toBe(15);
    expect(currentPrice(pond, new Date('2026-12-01T00:00:00Z'))).toBe(20);
    expect(currentPrice(L({ price: 19.99, salePercent: 15, saleEndsAt: later }), NOW)).toBe(16.99);
    expect(savePercent(20, 15)).toBe(25);
    expect(savePercent(20, 20)).toBe(0);
    expect(savePercent(0, 0)).toBe(0);
  });

  it('need a discount, a future end date, and a price', () => {
    expect(saleIssues(25, later, 20, NOW)).toEqual([]);
    expect(saleIssues(95, later, 20, NOW)).toEqual(['a discount between 5% and 90%']);
    expect(saleIssues(25, earlier, 20, NOW)).toEqual(['an end date within the next year']);
    expect(saleIssues(25, '2028-01-01T00:00:00Z', 20, NOW)).toEqual(['an end date within the next year']);
    expect(saleIssues(25, later, 0, NOW)[0]).toMatch(/free curricula/);
  });
});

describe('quote', () => {
  it('prices a listing with its sale and a coupon', () => {
    const q = quote({ kind: 'listing', id: 'l1' }, ctx({ code: ' pond5 ' }));
    expect(q).toMatchObject({ listPrice: 20, salePercent: 25, price: 15, couponCode: 'POND5', discount: 5, total: 10 });
    expect(q.items).toEqual([{ listingId: 'l1', title: 'Pond Life', seller: 'Ms T', esaEligible: false, listPrice: 20, price: 10 }]);
    expect(quote({ kind: 'listing', id: 'l2' }, ctx({ code: 'welcome10' })).total).toBe(9);
    expect(quote({ kind: 'listing', id: 'l2' }, ctx({ code: 'ALL' })).total).toBe(0);
  });

  it('refuses bad coupons with the server’s reasons', () => {
    expect(() => quote({ kind: 'listing', id: 'l2' }, ctx({ code: 'POND5' }))).toThrow('doesn’t work for this curriculum');
    expect(() => quote({ kind: 'listing', id: 'l2' }, ctx({ code: 'NOPE' }))).toThrow('doesn’t work');
    expect(() => quote({ kind: 'listing', id: 'l2' }, ctx({ code: 'OLD' }))).toThrow('expired');
    expect(() => quote({ kind: 'listing', id: 'l2' }, ctx({ code: 'ONCE' }))).toThrow('used up');
    expect(() => quote({ kind: 'bundle', id: 'b1' }, ctx({ code: 'POND5' }))).toThrow('doesn’t work');
  });

  it('refuses your own and missing listings', () => {
    expect(() => quote({ kind: 'listing', id: 'zz' }, ctx())).toThrow('no longer available');
    expect(() => quote({ kind: 'listing', id: 'l1' }, ctx({ listings: [L({ mine: true })] }))).toThrow('your own');
  });

  it('prices a bundle at the lower of its price and what the rest costs, split by list price', () => {
    // On sale, the two cost 15 + 10 = 25; the bundle is 24; a 10% coupon makes it 21.60.
    const q = quote({ kind: 'bundle', id: 'b1' }, ctx({ code: 'WELCOME10' }));
    expect(q).toMatchObject({ listPrice: 30, price: 24, discount: 2.4, total: 21.6, owned: [] });
    expect(q.items.map((i) => [i.listingId, i.price])).toEqual([['l1', 14.4], ['l2', 7.2]]);
    // Already own Pond Life: only Bird Math left, which costs less than the bundle on its own.
    const rest = quote({ kind: 'bundle', id: 'b1' }, ctx({ owned: new Set(['l1']) }));
    expect(rest).toMatchObject({ listPrice: 10, price: 10, total: 10, owned: ['l1'] });
    expect(() => quote({ kind: 'bundle', id: 'b1' }, ctx({ owned: new Set(['l1', 'l2']) }))).toThrow('already have everything');
  });

  it('splits totals to the cent', () => {
    expect(allocate(10, [1, 1, 1])).toEqual([3.33, 3.33, 3.34]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 7]);
  });
});

describe('bundles', () => {
  it('summarize savings and skip what you own', () => {
    expect(bundleSummary(bundle, [pond, birds], new Set(), NOW)).toMatchObject({ listTotal: 30, nowTotal: 25, price: 24, save: 0 });
    expect(bundleSummary(bundle, [pond, birds], new Set(['l2']), NOW)).toMatchObject({ listTotal: 20, nowTotal: 15, price: 15, save: 0 });
    expect(bundleSummary(bundle, [birds], new Set(), NOW).items.map((l) => l.id)).toEqual(['l2']);
  });

  it('need a name, two or more curricula, and a lower price', () => {
    expect(bundleIssues(bundle, [pond, birds])).toEqual([]);
    expect(bundleIssues({ ...bundle, price: 30 }, [pond, birds])).toEqual(['a price under $30 (what they cost separately)']);
    expect(bundleIssues({ ...bundle, title: ' ', listingIds: ['l1'], price: 12 }, [pond, birds])).toEqual(['a name', 'at least 2 curricula']);
  });
});

describe('coupons', () => {
  it('need a clean, new code and a sensible amount', () => {
    expect(couponIssues({ code: 'spring-25', kind: 'percent', amount: 25 })).toEqual([]);
    expect(couponIssues({ code: 'x', kind: 'percent', amount: 150 })).toEqual(['a code of 3–24 letters or numbers', 'a percent of 100 or less']);
    expect(couponIssues({ code: 'welcome10', kind: 'fixed', amount: 0 }, coupons)).toEqual(['a code you haven’t used yet', 'an amount']);
    expect(couponIssues({ code: 'ABC', kind: 'fixed', amount: 5, maxUses: 0, expiresAt: earlier })).toEqual(['a number of uses (1 or more)', 'an expiry date in the future']);
    expect(couponLabel({ kind: 'percent', amount: 10 })).toBe('10% off');
    expect(couponLabel({ kind: 'fixed', amount: 2.5 })).toBe('$2.50 off');
  });
});
