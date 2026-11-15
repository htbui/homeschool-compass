import { describe, expect, it } from 'vitest';

import { detectLicense, LICENSE_INFO, licenseName, licenseUrl, ORIGINAL_LICENSES, SOURCE_LICENSES, type LicenseKind } from '../license';
import {
  allLessons,
  attributionFor,
  lessonAt,
  lessonTotal,
  lessonVersion,
  newLesson,
  newPackage,
  newUnit,
  outlinePreview,
  packageToListing,
  planLevels,
  planThemes,
  publishIssues,
  publishRules,
  versionLabel,
  type CurriculumPackage,
  type Origin,
} from '../package';

// Studio & Community: licenses, the rules for publishing, credit lines, and
// what's still missing before a curriculum can go on the Marketplace.

const web = (licenseDetected = true): Origin => ({ kind: 'open_web', url: 'https://open.example.org/course', title: 'Open Course', author: 'Open Org', retrievedAt: '2026-01-01', licenseDetected });
const ALL: LicenseKind[] = ['all_rights_reserved', 'cc0', 'public_domain', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_sa', 'cc_by_nd', 'cc_by_nc_nd', 'unknown'];

const ready = (p: Partial<CurriculumPackage> = {}) =>
  newPackage({ title: 'Pond Life', description: 'Frogs, insects, and water testing for curious kids.', subjects: ['science'], units: [newUnit('Unit 1', [newLesson('Frogs')])], ...p });

describe('detecting a page’s license', () => {
  it('reads every Creative Commons badge link and its version', () => {
    const cases: [string, LicenseKind][] = [
      ['by', 'cc_by'],
      ['by-sa', 'cc_by_sa'],
      ['by-nc', 'cc_by_nc'],
      ['by-nc-sa', 'cc_by_nc_sa'],
      ['by-nd', 'cc_by_nd'],
      ['by-nc-nd', 'cc_by_nc_nd'],
    ];
    for (const [slug, kind] of cases) {
      expect(detectLicense(`<a rel="license" href="https://creativecommons.org/licenses/${slug.toUpperCase()}/3.0/us/">badge</a>`), slug).toEqual({ kind, version: '3.0', url: `https://creativecommons.org/licenses/${slug}/3.0/` });
    }
  });

  it('reads CC0 and the public domain mark', () => {
    expect(detectLicense('<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>')?.kind).toBe('cc0');
    expect(detectLicense('<a href="https://creativecommons.org/publicdomain/mark/1.0/">PDM</a>')?.kind).toBe('public_domain');
  });

  it('reads written statements, in any order and spelling', () => {
    expect(detectLicense('Licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License')).toEqual({ kind: 'cc_by_nc_nd', version: '4.0' });
    expect(detectLicense('<p>Creative Commons Attribution Share-Alike</p>')).toEqual({ kind: 'cc_by_sa', version: undefined });
    expect(detectLicense('Creative Commons Attribution-Non-Commercial-ShareAlike 2.5')).toEqual({ kind: 'cc_by_nc_sa', version: '2.5' });
    expect(detectLicense('Creative Commons Attribution-NoDerivs 3.0')).toEqual({ kind: 'cc_by_nd', version: '3.0' });
  });

  it('finds nothing on a page without a license', () => {
    expect(detectLicense('<p>© 2024 Fernwood Press. All rights reserved.</p>')).toBeUndefined();
    expect(detectLicense('<a href="https://creativecommons.org/about/">About CC</a>')).toBeUndefined();
  });
});

describe('license names and links', () => {
  it('names each license, with its version for Creative Commons', () => {
    expect(licenseName({ kind: 'cc_by_nc_sa', version: '4.0' })).toBe('CC BY-NC-SA 4.0');
    expect(licenseName({ kind: 'cc0', version: '1.0' })).toBe('CC0');
    expect(licenseName({ kind: 'public_domain' })).toBe('Public domain');
    expect(licenseName({ kind: 'unknown' })).toBe('Unknown license');
  });

  it('links each Creative Commons deed (4.0 unless another version is known)', () => {
    expect(licenseUrl({ kind: 'cc_by_nd' })).toBe('https://creativecommons.org/licenses/by-nd/4.0/');
    expect(licenseUrl({ kind: 'cc_by', version: '2.0' })).toBe('https://creativecommons.org/licenses/by/2.0/');
    expect(licenseUrl({ kind: 'cc0' })).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
    expect(licenseUrl({ kind: 'all_rights_reserved' })).toBeUndefined();
    expect(licenseUrl({ kind: 'cc_by', url: 'https://example.org/own-deed' })).toBe('https://example.org/own-deed');
  });

  it('offers creators every license for their own work, and sources the ones a page might use', () => {
    expect(ORIGINAL_LICENSES).not.toContain('unknown');
    expect(ORIGINAL_LICENSES).not.toContain('public_domain');
    expect(SOURCE_LICENSES).toContain('public_domain');
    expect(SOURCE_LICENSES).not.toContain('unknown');
  });
});

describe('publish rules for every origin and license', () => {
  it('originals can always publish, under any license and price', () => {
    for (const kind of ALL) {
      expect(publishRules({ origin: { kind: 'original' }, license: { kind } })).toMatchObject({ canPublish: true, mustBeFree: false, licenseLocked: false });
    }
  });

  it('book conversions never publish, whatever their license says', () => {
    for (const kind of ALL) {
      expect(publishRules({ origin: { kind: 'owned_book', title: 'Math 4' }, license: { kind }, licenseConfirmed: true })).toMatchObject({ canPublish: false, licenseLocked: true });
    }
  });

  it('adaptations follow the source license (once confirmed)', () => {
    const expected: Record<LicenseKind, { canPublish: boolean; mustBeFree: boolean }> = {
      all_rights_reserved: { canPublish: false, mustBeFree: false },
      unknown: { canPublish: false, mustBeFree: false },
      cc_by_nd: { canPublish: false, mustBeFree: false },
      cc_by_nc_nd: { canPublish: false, mustBeFree: false },
      cc0: { canPublish: true, mustBeFree: false },
      public_domain: { canPublish: true, mustBeFree: false },
      cc_by: { canPublish: true, mustBeFree: false },
      cc_by_sa: { canPublish: true, mustBeFree: false },
      cc_by_nc: { canPublish: true, mustBeFree: true },
      cc_by_nc_sa: { canPublish: true, mustBeFree: true },
    };
    for (const kind of ALL) {
      expect(publishRules({ origin: web(), license: { kind }, licenseConfirmed: true }), kind).toMatchObject(expected[kind]);
    }
  });

  it('adaptations wait for the creator to confirm the license, but still say if they must be free', () => {
    expect(publishRules({ origin: web(), license: { kind: 'cc_by_nc' } })).toMatchObject({ canPublish: false, mustBeFree: true, note: 'Confirm the source’s license before publishing.' });
  });

  it('locks a license found on the page; one the creator chose stays editable', () => {
    expect(publishRules({ origin: web(true), license: { kind: 'cc_by' }, licenseConfirmed: true }).licenseLocked).toBe(true);
    expect(publishRules({ origin: web(false), license: { kind: 'cc_by' }, licenseConfirmed: true }).licenseLocked).toBe(false);
    expect(publishRules({ origin: web(false), license: { kind: 'unknown' } }).note).toMatch(/couldn’t find a license/);
  });

  it('explains share-alike and non-commercial terms in the note', () => {
    expect(publishRules({ origin: web(), license: { kind: 'cc_by_nc_sa', version: '4.0' }, licenseConfirmed: true }).note).toBe('Shared under the source’s license, CC BY-NC-SA 4.0 — non-commercial, so it must be free; anyone may adapt it again under the same license.');
    expect(publishRules({ origin: web(), license: { kind: 'cc_by_nd' }, licenseConfirmed: true }).note).toMatch(/CC BY-ND doesn’t allow adapted versions/);
  });

  it('every license knows whether it allows adapting and selling', () => {
    for (const kind of ALL) expect(typeof LICENSE_INFO[kind].adapt).toBe('boolean');
    expect(LICENSE_INFO.cc_by_nc.commercial).toBe(false);
    expect(LICENSE_INFO.cc_by_nd.adapt).toBe(false);
  });
});

describe('credit lines', () => {
  it('credits an adaptation’s source, author, license and the creator', () => {
    expect(attributionFor({ title: 'Pond', origin: web(), license: { kind: 'cc_by_sa', version: '4.0' } }, 'Maple Room')).toBe('Adapted from “Open Course” by Open Org (https://open.example.org/course), licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Organized into lessons by Maple Room.');
    expect(attributionFor({ title: 'Pond', origin: { ...web(), author: undefined } as Origin, license: { kind: 'public_domain' } })).toBe('Adapted from “Open Course” (https://open.example.org/course), in the public domain.');
    expect(attributionFor({ title: 'Pond', origin: web(), license: { kind: 'unknown' } })).toBe('Adapted from “Open Course” by Open Org (https://open.example.org/course).');
  });

  it('book conversions say they’re for personal family use', () => {
    expect(attributionFor({ title: 'x', origin: { kind: 'owned_book', title: 'Math 4', publisher: 'Fernwood' }, license: { kind: 'all_rights_reserved' } })).toBe('Lesson plan for “Math 4” (Fernwood). For personal family use.');
  });

  it('originals: © for all rights reserved, the license otherwise', () => {
    expect(attributionFor({ title: 'Pond', origin: { kind: 'original' }, license: { kind: 'all_rights_reserved' } }, 'Maple')).toBe('© Maple');
    expect(attributionFor({ title: 'Pond', origin: { kind: 'original' }, license: { kind: 'all_rights_reserved' } })).toBeUndefined();
    expect(attributionFor({ title: 'Pond', origin: { kind: 'original' }, license: { kind: 'cc0' } }, 'Maple')).toBe('“Pond” by Maple, dedicated to the public domain (CC0).');
  });
});

describe('before publishing', () => {
  it('a complete original has nothing missing', () => {
    expect(publishIssues(ready())).toEqual([]);
  });

  it('lists every missing piece', () => {
    const empty = newPackage({ gradeMin: 5, gradeMax: 2, units: [newUnit('', [newLesson('')])], price: 20000 });
    expect(publishIssues(empty)).toEqual([
      'a title',
      'a description (20+ characters)',
      'a subject',
      'a title for every lesson',
      'a name for every unit',
      'a grade range that runs low to high',
      'a price between $0 and $10,000',
    ]);
    expect(publishIssues(ready({ units: [] }))).toEqual(['at least one lesson']);
    expect(publishIssues(ready({ title: '   ', description: ' '.repeat(30) }))).toEqual(['a title', 'a description (20+ characters)']);
    expect(publishIssues(ready({ price: -1 }))).toEqual(['a price between $0 and $10,000']);
    expect(publishIssues(ready({ price: Number.NaN }))).toEqual(['a price between $0 and $10,000']);
  });

  it('a non-commercial adaptation can’t have a price', () => {
    const pkg = ready({ origin: web(), license: { kind: 'cc_by_nc' }, licenseConfirmed: true, price: 5 });
    expect(publishIssues(pkg)).toEqual(['a price of $0 (the source is non-commercial)']);
    expect(packageToListing(pkg, 'Maple').price).toBe(0);
  });

  it('puts the publish-rule reason first when it can’t publish at all', () => {
    expect(publishIssues(ready({ origin: { kind: 'owned_book', title: 'Math 4' } }))[0]).toMatch(/stays private to your family/);
  });
});

describe('lessons and listings', () => {
  const units = [newUnit('A', [newLesson('one'), newLesson('two')]), newUnit('Empty'), newUnit('B', [newLesson('three')])];

  it('numbers lessons across units, skipping empty ones', () => {
    expect(allLessons(units).map((l) => [l.n, l.unit, l.title])).toEqual([
      [1, 'A', 'one'],
      [2, 'A', 'two'],
      [3, 'B', 'three'],
    ]);
    expect(lessonTotal(units)).toBe(3);
    expect(lessonAt(units, 3)?.title).toBe('three');
    expect(lessonAt(units, 0)).toBeUndefined();
    expect(lessonAt(units, 4)).toBeUndefined();
    expect(lessonAt(undefined, 1)).toBeUndefined();
  });

  it('the public outline has titles only', () => {
    const rich = [newUnit('A', [newLesson('one', { steps: ['secret step'], questions: ['q'], answers: ['a'], notes: 'n', links: [{ label: 'x', url: 'https://x' }] })])];
    expect(outlinePreview(rich)).toEqual([{ title: 'A', lessons: ['one'] }]);
    expect(JSON.stringify(packageToListing(ready({ units: rich }), 'Maple').outline)).not.toMatch(/secret|"a"|https:\/\/x/);
  });

  it('the listing describes what’s included, and keeps the existing listing’s id, ratings and sale', () => {
    const pkg = ready({
      units: [newUnit('A', [newLesson('one', { questions: ['q'], answers: ['a'], standards: ['CCSS.MATH.CONTENT.3.NF'], versions: { easier: { steps: ['s'], questions: [] } }, themes: [{ theme: 'Space', steps: ['x'], questions: [] }] })])],
    });
    const l = packageToListing(pkg, 'Maple', { id: 'l-1', ratingAvg: 4.5, ratingCount: 2, createdAt: '2026-01-01', salePercent: 20, saleEndsAt: '2026-12-01' } as never);
    expect(l).toMatchObject({ id: 'l-1', ratingAvg: 4.5, ratingCount: 2, createdAt: '2026-01-01', salePercent: 20, sellerKind: 'creator', packageId: pkg.id, mine: true });
    expect(l.includes).toEqual(['1 lessons in 1 unit', 'Lesson-by-lesson plan that schedules into Freerange', 'Printable worksheet questions', 'Answer key for grown-ups', 'Easier versions of lessons', 'Themed versions: Space', 'Lessons tagged to standards']);
    expect(l.packageVersion).toBeUndefined();
  });
});

describe('easier/harder versions and themes', () => {
  const lesson = newLesson('Orbits', {
    steps: ['Read'],
    questions: ['Q1', 'Q2'],
    answers: ['A1', 'A2'],
    versions: { easier: { steps: ['Look'], questions: [] }, harder: { steps: [], questions: [] } },
    themes: [
      { theme: ' Dinosaurs ', steps: [], questions: ['Dino Q'], answers: ['Dino A'] },
      { theme: 'Space', steps: [], questions: [] },
    ],
  });

  it('a level or theme with nothing in it is the main lesson', () => {
    expect(lessonVersion(lesson, { level: 'harder' })).toBe(lesson);
    expect(lessonVersion(lesson, { theme: 'Space' })).toBe(lesson);
    expect(lessonVersion(lesson, { theme: 'Unknown' })).toBe(lesson);
    expect(lessonVersion(lesson, {})).toBe(lesson);
  });

  it('themes match whatever the case or spacing, and answers travel with their questions', () => {
    const v = lessonVersion(lesson, { level: 'easier', theme: 'dinosaurs' });
    expect(v).toMatchObject({ steps: ['Look'], questions: ['Dino Q'], answers: ['Dino A'], applied: { level: 'easier', theme: ' Dinosaurs ' } });
  });

  it('a version’s questions without answers don’t borrow the main lesson’s answers', () => {
    const l = newLesson('x', { questions: ['Main'], answers: ['Main answer'], versions: { harder: { steps: [], questions: ['Hard'] } } });
    expect(lessonVersion(l, { level: 'harder' }).answers).toBeUndefined();
  });

  it('lists a plan’s themes once each (first spelling wins) and only levels with content', () => {
    const units = [newUnit('A', [lesson, newLesson('b', { themes: [{ theme: 'dinosaurs', steps: ['x'], questions: [] }, { theme: '  ', steps: ['x'], questions: [] }] })])];
    expect(planThemes(units)).toEqual(['Dinosaurs', 'Space']);
    expect(planLevels(units)).toEqual(['easier']);
    expect(planThemes()).toEqual([]);
  });

  it('labels the version a child sees', () => {
    expect(versionLabel({ theme: 'Space', level: 'harder' })).toBe('🎨 Space · 🚀 Harder version');
    expect(versionLabel({})).toBeUndefined();
    expect(versionLabel()).toBeUndefined();
  });
});
