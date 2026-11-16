import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { libraryListings } from '../library';
import { listingIssues, type Listing, type Purchase } from '../market';
import {
  emptyState,
  everyLessonLinked,
  filterCounts,
  formatLabel,
  fromFollowed,
  groupLibrary,
  hasRatings,
  licenseHeading,
  listingCardLabel,
  namesList,
  numberFieldError,
  sortOptions,
  splitCredit,
  topBundles,
} from '../marketView';
import { bundleSummary, MIN_SHOWN_SAVE, shownSavePercent, type Bundle } from '../pricing';

// What the Marketplace screens derive from the catalog (design review MKT-05, 06,
// 08, 10, 13, 16, 18, 19, 20, 21, 22, 30, 32). Dates are relative to a fixed NOW.

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
  id: 'l1', title: 'Fraction Forest', seller: 'Test Press', sellerKind: 'publisher', sellerVerified: false, subjects: ['math'], gradeMin: 3, gradeMax: 5,
  philosophies: ['charlotte_mason'], format: 'print', price: 40, description: 'Gentle fractions', includes: [], lessons: 20, lessonsPerWeek: 2, minutesPerLesson: 30,
  parentInvolvement: 'high', familyStyle: false, lessonSteps: [], cover: '🧮', color: '#000', esaEligible: false, ratingAvg: 0, ratingCount: 0, createdAt: '2026-01-01T00:00:00Z',
};
const L = (p: Partial<Listing>): Listing => ({ ...base, ...p });
const P = (id: string, p: Partial<Purchase> = {}): Purchase => ({ id, listingId: id, title: id, seller: 's', price: 0, fundingSource: 'out_of_pocket', purchasedAt: '2026-11-01T00:00:00Z', status: 'free', esaEligible: false, ...p });

describe('MKT-13 bundle savings against today’s prices', () => {
  const pond = L({ id: 'pond', price: 20, salePercent: 25, saleEndsAt: inDays(7) });
  const birds = L({ id: 'birds', price: 10 });
  const b = { listingIds: ['pond', 'birds'], price: 24 };
  it('compares with what buying them separately costs today, not list prices', () => {
    const s = bundleSummary(b, [pond, birds], new Set(), NOW);
    expect(s.listTotal).toBe(30);
    expect(s.nowTotal).toBe(25); // Pond Life is on sale at $15
    expect(s.price).toBe(24);
    expect(s.save).toBe(0); // 4% isn't advertised
  });
  it('still shows a real saving when nothing is on sale', () => {
    const s = bundleSummary(b, [L({ ...pond, salePercent: undefined, saleEndsAt: undefined }), birds], new Set(), NOW);
    expect(s).toMatchObject({ nowTotal: 30, price: 24, save: 20 });
  });
  it('an expired sale counts at full price again', () => {
    const s = bundleSummary(b, [L({ ...pond, saleEndsAt: inDays(-1) }), birds], new Set(), NOW);
    expect(s.nowTotal).toBe(30);
  });
  it('savings under 5% are not shown', () => {
    expect(MIN_SHOWN_SAVE).toBe(5);
    expect(shownSavePercent(100, 96)).toBe(0);
    expect(shownSavePercent(100, 95)).toBe(5);
    expect(shownSavePercent(0, 0)).toBe(0);
    expect(shownSavePercent(10, 12)).toBe(0);
  });
});

describe('MKT-05 option counts in Filters', () => {
  const list = [
    L({ id: 'a', price: 0, sellerKind: 'open', format: 'online' }),
    L({ id: 'b', price: 20, ratingAvg: 4.8, ratingCount: 3, esaEligible: true }),
    L({ id: 'c', price: 60, sellerKind: 'family', format: 'digital', philosophies: ['classical'] }),
    L({ id: 'd', price: 30, salePercent: 50, saleEndsAt: inDays(3), philosophies: ['classical'] }),
  ];
  it('counts each pick-one option in place of the current one', () => {
    const c = filterCounts(list, { price: 'under25' });
    expect(c.price).toMatchObject({ any: 4, free: 1, under25: 3, under75: 4, under150: 4 }); // d is $15 on sale
    expect(c.used).toEqual({ any: 3, new: 3, used: 0 });
    expect(c.rating[4.5]).toBe(1);
    expect(c.esa).toBe(1);
  });
  it('counts pick-many options on their own, with the other choices kept', () => {
    const c = filterCounts(list, { price: 'any', philosophies: ['charlotte_mason'] });
    expect(c.formats).toMatchObject({ print: 1, online: 1, digital: 0, bundle: 0 });
    expect(c.philosophies.classical).toBe(2);
    expect(c.philosophies.montessori).toBe(0);
  });
  it('a combination with no results shows 0 before you pick it', () => {
    const c = filterCounts(list, { price: 'under25' });
    expect(c.rating[4.5]).toBe(1);
    expect(filterCounts(list, { price: 'free' }).rating[4.5]).toBe(0);
  });
  it('hides rating controls until something has a review', () => {
    expect(hasRatings(libraryListings())).toBe(false);
    expect(hasRatings(list)).toBe(true);
  });
});

describe('MKT-21 sorts that need reviews', () => {
  it('drops Top rated and Most reviewed when nothing is reviewed', () => {
    expect(sortOptions([L({})])).toEqual(['match', 'price_asc', 'price_desc', 'newest']);
    expect(sortOptions([L({}), L({ ratingCount: 2 })])).toContain('rating');
    expect(sortOptions([])).not.toContain('reviews');
  });
});

describe('MKT-06 empty results say why', () => {
  const list = [L({ id: 'a', gradeMin: 0, gradeMax: 1, subjects: ['science'] }), L({ id: 'b', gradeMin: 8, gradeMax: 9, subjects: ['history'] }), L({ id: 'c', gradeMin: 8, gradeMax: 9, subjects: ['history'] })];
  it('a search with no hits names the search and offers to clear it', () => {
    const e = emptyState(list, { query: 'xyzzy', grades: undefined }, { mineGrades: false });
    expect(e.title).toBe('No curricula match “xyzzy”');
    expect(e.actions).toEqual(['clear_search']);
    expect(e.title).not.toMatch(/filters/);
  });
  it('offers all grades only when the kids’ grades are what hides things', () => {
    const e = emptyState(list, { query: 'Fraction', grades: [5] }, { mineGrades: true });
    expect(e.actions).toEqual(['clear_search', 'all_grades']);
    expect(e.body).toMatch(/search all grades/);
    const none = emptyState(list, { query: 'xyzzy', grades: [5] }, { mineGrades: true });
    expect(none.actions).toEqual(['clear_search']);
  });
  it('grades alone', () => {
    const e = emptyState(list, { grades: [5] }, { mineGrades: true });
    expect(e.title).toMatch(/kids’ grades/);
    expect(e.actions).toEqual(['all_grades']);
  });
  it('filters: clear them, and suggest nearby subjects that have curricula', () => {
    const e = emptyState(list, { subjects: ['math'], grades: undefined }, { mineGrades: false });
    expect(e.title).toBe('Nothing matches those filters');
    expect(e.actions).toEqual(['clear_filters']);
    expect(e.subjects).toEqual([{ subject: 'history', count: 2 }, { subject: 'science', count: 1 }]);
  });
});

describe('MKT-16 / MKT-22 listing labels', () => {
  it('reads a card as one sentence', () => {
    expect(listingCardLabel({ title: 'Burgess Bird Book', seller: 'Thornton Burgess', sellerKind: 'open' }, 'Free', '1–4')).toBe('Burgess Bird Book, by Thornton Burgess, free, grades 1–4');
    expect(listingCardLabel({ title: 'Beta', seller: 'Dana M.', sellerKind: 'family' }, '$25', 'Grade 3', true)).toBe('Beta, from Dana M., a family, $25, grade 3, you own it');
    expect(listingCardLabel({ title: 'Tots', seller: 'P', sellerKind: 'publisher' }, '$5', 'K')).toBe('Tots, from P, $5, kindergarten');
  });
  it('free & open classics are online texts, not courses', () => {
    expect(formatLabel({ format: 'online', sellerKind: 'open' })).toBe('📖 Free online text');
    expect(formatLabel({ format: 'online', sellerKind: 'creator' })).toBe('💻 Online course');
    expect(libraryListings().every((l) => formatLabel(l) !== '💻 Online course')).toBe(true);
  });
});

describe('MKT-20 license card', () => {
  it('doesn’t repeat itself', () => {
    expect(licenseHeading('Public domain', 'Public domain')).toBe('Public domain');
    expect(licenseHeading('CC BY 4.0', 'Creative Commons Attribution')).toBe('CC BY 4.0 · Creative Commons Attribution');
  });
  it('takes the source address out of the credit line and labels it', () => {
    const pd = splitCredit('“The Aesop for Children” by Aesop (1919), in the public domain. Free full text: https://www.gutenberg.org/ebooks/19994. Lesson plan by Freerange.');
    expect(pd).toEqual({ text: '“The Aesop for Children” by Aesop (1919), in the public domain. Lesson plan by Freerange.', url: 'https://www.gutenberg.org/ebooks/19994', linkLabel: 'Read the free full text' });
    const cc = splitCredit('Adapted from “Water” by USGS (2020), https://www.usgs.gov/water. Organized into lessons by Freerange.');
    expect(cc.url).toBe('https://www.usgs.gov/water');
    expect(cc.text).toBe('Adapted from “Water” by USGS (2020). Organized into lessons by Freerange.');
    expect(cc.linkLabel).toBe('See the original');
    expect(splitCredit('By me.')).toEqual({ text: 'By me.' });
    expect(libraryListings().filter((l) => splitCredit(l.attribution ?? '').url).length).toBeGreaterThan(30);
  });
  it('drops the license deed address (the card links the license itself)', () => {
    const s = splitCredit('From “Yawp”, licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Shared alike.');
    expect(s).toEqual({ text: 'From “Yawp”, licensed under CC BY-SA 4.0. Shared alike.' });
  });
  it('every Library credit line reads cleanly with no address left in it', () => {
    for (const l of libraryListings()) {
      const s = splitCredit(l.attribution ?? '');
      if (s.url) expect(s.url, l.id).toMatch(/^https:\/\/[^\s]+[^.]$/);
      expect(s.text, l.id).not.toMatch(/https?:/);
      expect(s.text, l.id).not.toMatch(/\s[.,]|\.\./);
    }
  });
});

describe('MKT-18 / MKT-19 creators you follow, bundles above the results', () => {
  it('lists followed creators’ curricula, newest first', () => {
    const list = [L({ id: 'a', creatorId: 'u1', sellerKind: 'creator', createdAt: '2026-01-01' }), L({ id: 'b', creatorId: 'u1', sellerKind: 'creator', createdAt: '2026-02-01' }), L({ id: 'c', creatorId: 'u2', sellerKind: 'creator' }), L({ id: 'd', creatorId: 'u1', sellerKind: 'creator', mine: true })];
    expect(fromFollowed(list, ['u1']).map((l) => l.id)).toEqual(['b', 'a']);
    expect(fromFollowed(list, [])).toEqual([]);
    expect(fromFollowed(list, ['u1'], 1).map((l) => l.id)).toEqual(['b']);
  });
  it('shows at most two bundles, the ones with most results first', () => {
    const bs = [
      { id: 'x', listingIds: ['a', 'q'] },
      { id: 'y', listingIds: ['a', 'b', 'c'] },
      { id: 'z', listingIds: ['q', 'r'] },
      { id: 'w', listingIds: ['b', 'r'] },
    ] as Pick<Bundle, 'id' | 'listingIds'>[];
    const t = topBundles(bs, new Set(['a', 'b', 'c']));
    expect(t.shown.map((b) => b.id)).toEqual(['y', 'x']);
    expect(t.total).toBe(3);
    expect(topBundles(bs, new Set(), 2)).toEqual({ shown: [], total: 0 });
  });
});

describe('MKT-32 My library groups', () => {
  it('splits not started, in your plan, and gifts', () => {
    const g = groupLibrary(
      [P('a', { purchasedAt: '2026-10-01' }), P('b', { curriculumId: 'c1' }), P('c', { giftFrom: 'Grandma' }), P('d', { curriculumId: 'gone' }), P('e', { giftFrom: 'Lee', curriculumId: 'c2' }), P('f', { purchasedAt: '2026-11-05' })],
      [{ id: 'c1' }, { id: 'c2' }],
    );
    expect(g.notStarted.map((p) => p.id)).toEqual(['f', 'd', 'a']); // newest first; a removed curriculum counts as not started
    expect(g.inPlan.map((p) => p.id)).toEqual(['b', 'e']);
    expect(g.gifts.map((p) => p.id)).toEqual(['c']);
  });
});

describe('MKT-10 lessons that already link to their text', () => {
  it('only when every lesson has a link', () => {
    expect(everyLessonLinked([{ lessons: [{ links: [1] }, { links: [2] }] }])).toBe(true);
    expect(everyLessonLinked([{ lessons: [{ links: [1] }, { links: [] }] }])).toBe(false);
    expect(everyLessonLinked([])).toBe(false);
    expect(everyLessonLinked(undefined)).toBe(false);
  });
});

describe('MKT-30 / MKT-08 small helpers', () => {
  it('names siblings', () => {
    expect(namesList(['Leo'])).toBe('Leo');
    expect(namesList(['Leo', 'Noah'])).toBe('Leo & Noah');
    expect(namesList(['Leo', 'Noah', 'Mia'])).toBe('Leo, Noah & Mia');
  });
  it('number fields say what’s wrong right away', () => {
    expect(numberFieldError('', 120)).toBeUndefined();
    expect(numberFieldError('abc', 120)).toBe('Enter a number, e.g. 120');
    expect(numberFieldError('12.5', 120)).toBe('Enter a number, e.g. 120');
    expect(numberFieldError('0', 120)).toBe('Enter 1 or more');
    expect(numberFieldError('2001', 120, 2000)).toBe('At most 2,000');
    expect(numberFieldError(' 45 ', 30, 480)).toBeUndefined();
  });
  it('a used book can skip the lesson numbers, but needs grades', () => {
    const ok = { title: 'Beta', subjects: ['math' as const], price: 5, description: 'Lightly used set', grades: true };
    expect(listingIssues({ ...ok, paceKnown: false })).toEqual([]);
    expect(listingIssues({ ...ok, grades: false, paceKnown: false })).toEqual(['the grades it’s for']);
    expect(listingIssues({ ...ok })).toEqual(['number of lessons', 'minutes per lesson']);
    expect(listingIssues({ ...ok, paceKnown: false, pickupArea: 'x'.repeat(61) })).toEqual(['a shorter pickup area (60 characters at most)']);
    expect(listingIssues({ ...ok, paceKnown: false, photos: 5 })).toEqual(['at most 4 photos']);
  });
});
