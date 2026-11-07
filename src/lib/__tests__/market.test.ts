import { describe, expect, it } from 'vitest';

import { weekdayOf } from '../dates';
import {
  defaultLessonDays,
  filterListings,
  finishDateFor,
  gradeNumber,
  gradeRangeLabel,
  matchListing,
  planFromListing,
  ratingSummary,
  sortListings,
  sortReviews,
  suggestStartTime,
  weightedRating,
  withReviews,
  type Listing,
  type Review,
} from '../market';
import { sampleCatalog } from '../marketSample';
import type { Child, RhythmBlock } from '../types';

const base: Listing = {
  id: 'l1', title: 'Fraction Forest', seller: 'Test Press', sellerKind: 'publisher', sellerVerified: true, subjects: ['math'], gradeMin: 3, gradeMax: 5,
  philosophies: ['charlotte_mason'], format: 'print', price: 40, description: 'Gentle fractions', includes: [], lessons: 20, lessonsPerWeek: 2, minutesPerLesson: 30,
  parentInvolvement: 'high', familyStyle: false, lessonSteps: ['Warm up'], cover: '🧮', color: '#000', esaEligible: true, ratingAvg: 4.5, ratingCount: 10, createdAt: '2026-01-01T00:00:00Z',
};
const L = (p: Partial<Listing>): Listing => ({ ...base, ...p });
const kid = (id: string, grade: string, birthdate = '2017-05-21'): Child => ({ id, name: id, birthdate, grade, avatar: '🦊', color: '#f00', learningDifferences: [], passions: [], soloToleranceMin: 20, sparks: 0 });
const family = { philosophy: { breakdown: [{ philosophy: 'charlotte_mason' as const, percent: 70 }, { philosophy: 'classical' as const, percent: 30 }], dimensions: { structure: 0, experiential: 0, faith: 0, screenFree: 0, collective: 0 }, takenAt: '' } };

describe('grades', () => {
  it('maps labels to numbers and back to ranges', () => {
    expect(gradeNumber('Pre-K')).toBe(-1);
    expect(gradeNumber('Kindergarten')).toBe(0);
    expect(gradeNumber('4th Grade')).toBe(4);
    expect(gradeNumber('Grade four')).toBeUndefined();
    expect(gradeRangeLabel(-1, 1)).toBe('Pre-K–1');
    expect(gradeRangeLabel(4, 4)).toBe('Grade 4');
    expect(gradeRangeLabel(0, 8)).toBe('K–8');
  });
});

describe('ratings', () => {
  it('summarizes and weights reviews', () => {
    const s = ratingSummary([{ rating: 5 }, { rating: 4 }, { rating: 4 }]);
    expect(s).toEqual({ avg: 4.3, count: 3, histogram: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 } });
    // Many good reviews beat a couple of perfect ones.
    expect(weightedRating(4.8, 300)).toBeGreaterThan(weightedRating(5, 2));
    expect(withReviews(L({ ratingAvg: 4, ratingCount: 1 }), [{ rating: 5 }])).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
  });
  it('sorts reviews', () => {
    const r = (id: string, rating: 1 | 5, helpful: number, createdAt: string): Review => ({ id, listingId: 'l1', author: 'A', rating, title: '', body: '', createdAt, verified: true, helpful });
    const list = [r('a', 5, 1, '2026-01-01'), r('b', 1, 9, '2026-03-01'), r('c', 5, 3, '2026-02-01')];
    expect(sortReviews(list, 'helpful').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortReviews(list, 'newest').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortReviews(list, 'low')[0].id).toBe('b');
  });
});

describe('browse', () => {
  const list = [
    L({ id: 'a', title: 'Fraction Forest', price: 40 }),
    L({ id: 'b', title: 'Phonics Fun', subjects: ['phonics'], gradeMin: -1, gradeMax: 1, price: 0, philosophies: ['traditional'], ratingAvg: 5, ratingCount: 2 }),
    L({ id: 'c', title: 'Used Algebra', sellerKind: 'family', gradeMin: 7, gradeMax: 9, price: 15, esaEligible: false, format: 'bundle', createdAt: '2026-06-01T00:00:00Z' }),
  ];
  it('filters by query, subject, grade, price, format, ESA, used, rating', () => {
    const ids = (f: Parameters<typeof filterListings>[1]) => filterListings(list, f).map((l) => l.id);
    expect(ids({ query: 'forest' })).toEqual(['a']);
    expect(ids({ query: 'charlotte fraction' })).toEqual(['a', 'c']); // description + style both match
    expect(ids({ subjects: ['phonics'] })).toEqual(['b']);
    expect(ids({ grades: [4] })).toEqual(['a']);
    expect(ids({ grades: [0, 8] })).toEqual(['b', 'c']);
    expect(ids({ price: 'free' })).toEqual(['b']);
    expect(ids({ price: 'under25' })).toEqual(['b', 'c']);
    expect(ids({ formats: ['bundle'] })).toEqual(['c']);
    expect(ids({ esaOnly: true })).toEqual(['a', 'b']);
    expect(ids({ used: 'used' })).toEqual(['c']);
    expect(ids({ used: 'new' })).toEqual(['a', 'b']);
    expect(ids({ minRating: 4.8 })).toEqual(['b']);
  });
  it('sorts by price, date, and family match', () => {
    const ctx = { family, kids: [kid('maya', '4th Grade')] };
    expect(sortListings(list, 'price_asc', ctx).map((l) => l.id)).toEqual(['b', 'c', 'a']);
    expect(sortListings(list, 'newest', ctx)[0].id).toBe('c');
    expect(sortListings(list, 'match', ctx)[0].id).toBe('a');
    const m = matchListing(list[0], ctx);
    expect(m.fitsKids).toEqual(['maya']);
    expect(m.reasons.join(' ')).toContain('Charlotte Mason');
    expect(m.reasons.join(' ')).toContain('maya (4th Grade)');
  });
});

describe('planning', () => {
  it('spreads lessons over chosen days and finds the finish date', () => {
    expect(defaultLessonDays(2, [1, 2, 3, 4, 5])).toEqual([1, 3]);
    expect(defaultLessonDays(5, [1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
    expect(defaultLessonDays(1, [1, 2, 3, 4, 5])).toEqual([1]);
    // 4 lessons on Mon/Wed starting Mon Nov 9 → Nov 9, 11, 16, 18
    expect(finishDateFor('2026-11-09', [1, 3], 4)).toBe('2026-11-18');
    expect(finishDateFor('2026-11-09', [], 4)).toBeUndefined();
  });

  it('builds a curriculum and staggered parent-led blocks', () => {
    const kids = [kid('a', '4th Grade'), kid('b', '4th Grade')];
    const { curriculum, blocks, finish } = planFromListing(base, { childIds: ['a', 'b'], startDate: '2026-11-09', days: [1, 3], startTime: '10:00', children: kids });
    expect(curriculum).toMatchObject({ name: 'Fraction Forest', totalLessons: 20, lessonsDone: 0, childIds: ['a', 'b'], schoolDays: [1, 3], targetEndDate: finish });
    expect(blocks.map((b) => [b.childIds[0], b.mode, b.start])).toEqual([['a', 'parent', '10:00'], ['b', 'parent', '10:30']]);
    expect(blocks.every((b) => b.curriculumId === curriculum.id && b.steps[0] === 'Warm up')).toBe(true);
  });

  it('makes one group block for family-style curricula', () => {
    const { blocks } = planFromListing(L({ familyStyle: true }), { childIds: ['a', 'b'], startDate: '2026-11-09', days: [2], startTime: '13:00', children: [kid('a', '1st Grade'), kid('b', '5th Grade')] });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ mode: 'group', childIds: ['a', 'b'], days: [2] });
  });

  it('suggests a start time that avoids the kids and the parent', () => {
    const block = (p: Partial<RhythmBlock>): RhythmBlock => ({ id: 'x', title: '', subject: 'math', childIds: ['a'], mode: 'solo', start: '08:30', durationMin: 60, days: [1], icon: '', steps: [], ...p });
    const blocks = [block({}), block({ childIds: ['z'], mode: 'parent', start: '09:30', durationMin: 30 })];
    expect(suggestStartTime(blocks, ['a'], [1], 30, false)).toBe('09:30');
    expect(suggestStartTime(blocks, ['a'], [1], 30, true)).toBe('10:00');
    expect(suggestStartTime(blocks, ['a'], [2], 30, true)).toBe('08:30');
  });
});

describe('sample catalog', () => {
  it('is internally consistent and clearly marked', () => {
    const { listings, reviews } = sampleCatalog();
    expect(listings.length).toBeGreaterThan(20);
    expect(new Set(listings.map((l) => l.id)).size).toBe(listings.length);
    for (const l of listings) {
      expect(l.sample).toBe(true);
      const rs = reviews.filter((r) => r.listingId === l.id);
      expect(l.ratingCount).toBe(rs.length);
      expect(l.gradeMin).toBeLessThanOrEqual(l.gradeMax);
      expect(l.lessons).toBeGreaterThan(0);
    }
    expect(reviews.every((r) => r.sample && r.rating >= 1 && r.rating <= 5)).toBe(true);
    expect(weekdayOf('2026-11-09')).toBe(1);
  });
});
