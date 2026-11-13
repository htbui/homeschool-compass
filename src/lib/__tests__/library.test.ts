import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalogEntry, libraryContent, libraryId, libraryListing, type LibraryEntry } from '../library/build';
import { LICENSE_INFO } from '../license';

const dir = new URL('../library/', import.meta.url);
const files = readdirSync(new URL('content/', dir)).filter((f) => f.endsWith('.json'));
const entries = files.map((f) => JSON.parse(readFileSync(new URL(`content/${f}`, dir), 'utf8')) as LibraryEntry);

describe('Freerange Library', () => {
  it('only holds works anyone may adapt and share, credited to their source', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
    for (const e of entries) {
      const info = LICENSE_INFO[e.license.kind];
      expect(info.adapt && info.commercial, e.key).toBe(true);
      const l = libraryListing(catalogEntry(e));
      expect(l.attribution).toContain(e.author.split(' (')[0]);
      expect(l).toMatchObject({ seller: e.seller, sellerKind: 'open', sellerVerified: false });
      expect(l.attribution!.length).toBeLessThanOrEqual(1000);
      expect(l.price).toBe(0);
      expect(l.sample).toBeUndefined();
      expect(e.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('has a complete, well-formed lesson plan for every curriculum', () => {
    for (const [i, e] of entries.entries()) {
      expect(`${e.key}.json`).toBe(files[i]);
      expect(e.gradeMin).toBeLessThanOrEqual(e.gradeMax);
      expect(e.description.length).toBeGreaterThan(40);
      const content = libraryContent(e);
      const lessons = content.units.flatMap((u) => u.lessons);
      expect(lessons.length, e.key).toBeGreaterThanOrEqual(10);
      expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
      for (const l of lessons) {
        expect(l.title.trim(), e.key).not.toBe('');
        expect(l.steps.length, l.title).toBeGreaterThan(0);
        expect(l.links.every((k) => /^https:\/\//.test(k.url)), l.title).toBe(true);
        expect((l.answers ?? []).length, l.title).toBeLessThanOrEqual(l.questions.length);
      }
    }
  });

  it('bundles a catalog that matches the lesson plans (run npm run library:gen)', () => {
    const catalog = JSON.parse(readFileSync(new URL('catalog.json', dir), 'utf8'));
    expect(catalog).toEqual(entries.map(catalogEntry).sort((a, b) => a.key.localeCompare(b.key)));
    expect(new Set(entries.map((e) => libraryId(e.key))).size).toBe(entries.length);
  });
});
