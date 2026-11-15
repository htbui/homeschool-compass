import { describe, expect, it } from 'vitest';

import { badgeIssues, emptyBadgeDraft, ESA_PROGRAM_STATES, followedCreators, looksLikeTaxId, stateList, storefrontId, storefrontSummary, type BadgeDraft } from '../creators';
import type { Listing } from '../market';

const base: Listing = {
  id: 'l1', title: 'Space Math', seller: 'Maple Room', sellerKind: 'creator', sellerVerified: false, subjects: ['math'], gradeMin: 2, gradeMax: 4,
  philosophies: [], format: 'digital', price: 6, description: '', includes: [], lessons: 10, lessonsPerWeek: 3, minutesPerLesson: 30,
  parentInvolvement: 'medium', familyStyle: false, lessonSteps: [], cover: '🚀', color: '#000', esaEligible: false, ratingAvg: 0, ratingCount: 0, createdAt: '2026-01-01T00:00:00Z', creatorId: 'u1',
};
const L = (p: Partial<Listing>): Listing => ({ ...base, ...p });
const draft = (p: Partial<BadgeDraft>): BadgeDraft => ({ ...emptyBadgeDraft(), ...p });

describe('storefronts', () => {
  it('only Freerange creators have one: not free & open curricula or family sellers', () => {
    expect(storefrontId(L({}))).toBe('u1');
    expect(storefrontId(L({ sellerKind: 'publisher' }))).toBe('u1');
    expect(storefrontId(L({ sellerKind: 'open', creatorId: undefined }))).toBeUndefined();
    expect(storefrontId(L({ sellerKind: 'open' }))).toBeUndefined();
    expect(storefrontId(L({ sellerKind: 'family', creatorId: undefined }))).toBeUndefined();
    expect(storefrontId(L({ creatorId: undefined }))).toBeUndefined();
  });

  it('sums ratings across listings, weighted by review count, best first', () => {
    const s = storefrontSummary([L({ id: 'a', title: 'A', ratingAvg: 5, ratingCount: 1 }), L({ id: 'b', title: 'B', ratingAvg: 4.8, ratingCount: 20 }), L({ id: 'c', title: 'C' })]);
    expect(s).toMatchObject({ listings: 3, reviews: 21, avg: 4.8 });
    expect(s.sorted.map((l) => l.id)).toEqual(['b', 'a', 'c']);
    expect(storefrontSummary([])).toMatchObject({ listings: 0, reviews: 0, avg: 0 });
  });

  it('names followed creators from the catalog', () => {
    const listings = [L({ id: 'a' }), L({ id: 'b', sellerVerified: true }), L({ id: 'c', creatorId: 'u2', seller: 'Other' }), L({ id: 'd', sellerKind: 'open', creatorId: undefined })];
    expect(followedCreators(listings, ['u1'])).toEqual([{ id: 'u1', name: 'Maple Room', listings: 2, verified: true }]);
    expect(followedCreators(listings, ['u2', 'u1']).map((c) => c.id)).toEqual(['u1', 'u2']);
    expect(followedCreators(listings, [])).toEqual([]);
  });
});

describe('badge applications', () => {
  it('verification needs a name, a website or portfolio, and how the curricula were made', () => {
    expect(badgeIssues('verified', draft({}))).toEqual(['your name or organization', 'your website or portfolio', 'how you made your curricula (a few sentences)']);
    expect(badgeIssues('verified', draft({ legalName: 'Jordan Rivera', website: 'maple.example.com', about: 'I wrote every lesson for my own kids.' }))).toEqual([]);
    expect(badgeIssues('verified', draft({ legalName: 'Jordan Rivera', website: 'not a site', about: 'I wrote every lesson for my own kids.', sampleUrl: 'nope nope' }))).toEqual(['a valid website address', 'a valid sample link']);
  });

  it('ESA listing needs a business name, states, and vendor IDs', () => {
    expect(badgeIssues('esa', draft({}))).toEqual(['your business name', 'the states you’re approved in', 'your vendor IDs or links']);
    expect(badgeIssues('esa', draft({ legalName: 'Maple Room Press LLC', states: ['AZ'], vendorInfo: 'AZ vendor V-12345' }))).toEqual([]);
  });

  it('turns away tax IDs and Social Security numbers', () => {
    expect(looksLikeTaxId('123-45-6789')).toBe(true);
    expect(looksLikeTaxId('EIN 12-3456789')).toBe(true);
    expect(looksLikeTaxId('ssn 123456789')).toBe(true);
    expect(looksLikeTaxId('AZ vendor V-12345, FL 2024-0042')).toBe(false);
    expect(looksLikeTaxId('call 555-123-4567')).toBe(false);
    expect(badgeIssues('esa', draft({ legalName: 'Maple Room Press LLC', states: ['AZ'], vendorInfo: 'EIN 12-3456789' }))).toContain('no tax ID, Social Security, or bank numbers');
  });

  it('lists states with ESA-style programs, and names them', () => {
    expect(ESA_PROGRAM_STATES).toContain('AZ');
    expect(ESA_PROGRAM_STATES.length).toBeGreaterThan(5);
    expect(stateList(['UT', 'AZ'])).toBe('Arizona and Utah');
    expect(stateList(['FL', 'AZ', 'UT'])).toBe('Arizona, Florida, and Utah');
  });
});
