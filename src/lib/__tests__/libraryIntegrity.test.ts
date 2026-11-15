import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalogEntry, CONVERTED_BY, libraryAttribution, libraryContent, libraryId, libraryListing, type LibraryEntry } from '../library/build';
import { LOADERS } from '../library/loaders';
import { LICENSE_INFO } from '../license';
import { PHILOSOPHY_SHORT } from '../market';
import { SUBJECT_LIST } from '../subjects';

// The free & open curricula as data: every entry fits the database's rules
// for a listing (so the seed loads), the generated catalog, loaders, and seed
// are in step with the lesson files, and every link is a well-formed web address.

const dir = new URL('../library/', import.meta.url);
const files = readdirSync(new URL('content/', dir)).filter((f) => f.endsWith('.json')).sort();
const entries = files.map((f) => JSON.parse(readFileSync(new URL(`content/${f}`, dir), 'utf8')) as LibraryEntry);
const seed = readFileSync(new URL('../../../supabase/seed.sql', import.meta.url), 'utf8');

/** A link families can open: https, a real host, nothing that breaks out of the address. */
function wellFormed(url: string): boolean {
  if (url !== url.trim() || /\s/.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /\./.test(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

describe('Library entries fit the listings table', () => {
  it('within every column limit the database checks', () => {
    for (const e of entries) {
      const l = libraryListing(catalogEntry(e));
      expect(l.title.length, e.key).toBeGreaterThan(0);
      expect(l.title.length, e.key).toBeLessThanOrEqual(160);
      expect(l.seller.length, e.key).toBeGreaterThan(0);
      expect(l.seller.length, e.key).toBeLessThanOrEqual(80);
      expect(l.description.length, e.key).toBeLessThanOrEqual(4000);
      expect(l.gradeMin, e.key).toBeGreaterThanOrEqual(-1);
      expect(l.gradeMax, e.key).toBeLessThanOrEqual(12);
      expect(l.lessons, e.key).toBeGreaterThanOrEqual(1);
      expect(l.lessons, e.key).toBeLessThanOrEqual(2000);
      expect(Number.isInteger(l.lessonsPerWeek) && l.lessonsPerWeek >= 1 && l.lessonsPerWeek <= 7, e.key).toBe(true);
      expect(Number.isInteger(l.minutesPerLesson) && l.minutesPerLesson >= 1 && l.minutesPerLesson <= 480, e.key).toBe(true);
      expect(['high', 'medium', 'low'], e.key).toContain(l.parentInvolvement);
      expect(l.color, e.key).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(l.cover.trim(), e.key).not.toBe('');
      expect(l.attribution!.length, e.key).toBeLessThanOrEqual(1000);
    }
  });

  it('use subjects and teaching styles the app knows', () => {
    for (const e of entries) {
      expect(e.subjects.length, e.key).toBeGreaterThan(0);
      for (const s of e.subjects) expect(SUBJECT_LIST, `${e.key}: ${s}`).toContain(s);
      for (const p of e.philosophies) expect(Object.keys(PHILOSOPHY_SHORT), `${e.key}: ${p}`).toContain(p);
      expect(new Set(e.subjects).size, e.key).toBe(e.subjects.length);
    }
  });

  it('have unique keys, ids, and titles', () => {
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
    expect(new Set(entries.map((e) => libraryId(e.key))).size).toBe(entries.length);
    expect(new Set(entries.map((e) => e.title.toLowerCase())).size).toBe(entries.length);
    for (const e of entries) expect(e.key, e.key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('Library licensing and credit', () => {
  it('records where each license was checked, and only uses licenses that allow selling adaptations', () => {
    for (const e of entries) {
      expect(e.licenseEvidence?.trim().length ?? 0, e.key).toBeGreaterThan(10);
      expect(['public_domain', 'cc0', 'cc_by', 'cc_by_sa'], e.key).toContain(e.license.kind);
      const info = LICENSE_INFO[e.license.kind];
      expect(info.adapt && info.commercial, e.key).toBe(true);
      if (e.license.kind.startsWith('cc_by')) expect(e.license.version, `${e.key} needs a CC version`).toMatch(/^\d\.\d$/);
      expect(e.year, e.key).toBeGreaterThan(1500);
      expect(e.year, e.key).toBeLessThanOrEqual(new Date().getFullYear());
    }
  });

  it('credit the original work, its author, and where to find it', () => {
    for (const e of entries) {
      const credit = libraryAttribution(e);
      expect(credit, e.key).toContain(e.author.split(' (')[0]);
      if (!e.attribution) {
        expect(credit, e.key).toContain(e.sourceTitle);
        expect(credit, e.key).toContain(e.sourceUrl);
        expect(credit, e.key).toContain(CONVERTED_BY);
      }
      // Every plan carries the same credit as its listing.
      expect(libraryContent(e).attribution).toBe(credit);
      expect(libraryContent(e).license).toEqual(e.license);
    }
  });

  it('are sold as free plans, never as a sample or by a verified seller', () => {
    for (const e of entries) {
      expect(libraryListing(catalogEntry(e))).toMatchObject({ price: 0, sellerKind: 'open', sellerVerified: false, esaEligible: false, format: 'online', packageId: `pk-lib-${e.key}`, packageVersion: e.version ?? 1 });
    }
  });
});

describe('Library links', () => {
  it('are well-formed https addresses everywhere: source, full text, and every lesson link', () => {
    const bad: string[] = [];
    for (const e of entries) {
      if (!wellFormed(e.sourceUrl)) bad.push(`${e.key}: sourceUrl ${e.sourceUrl}`);
      if (e.readUrl !== undefined && !wellFormed(e.readUrl)) bad.push(`${e.key}: readUrl ${e.readUrl}`);
      for (const u of e.units) {
        for (const l of u.lessons) {
          for (const k of l.links ?? []) {
            if (!wellFormed(k.url)) bad.push(`${e.key} / ${l.title}: ${k.url}`);
            if (!k.label?.trim()) bad.push(`${e.key} / ${l.title}: link without a label`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('don’t repeat the same link twice in one lesson', () => {
    for (const e of entries) {
      for (const l of libraryContent(e).units.flatMap((u) => u.lessons)) {
        const urls = l.links.map((k) => k.url);
        expect(new Set(urls).size, `${e.key} / ${l.title}`).toBe(urls.length);
      }
    }
  });
});

describe('Library build outputs are up to date (npm run library:gen)', () => {
  it('loads every curriculum’s lessons on demand, and nothing else', () => {
    expect(Object.keys(LOADERS).sort()).toEqual(entries.map((e) => e.key));
  });

  it('has a seed that lists every curriculum and its current release', () => {
    const listingRows = seed.match(/^insert into public\.listings /gm) ?? [];
    const releaseRows = seed.match(/^insert into public\.package_releases /gm) ?? [];
    expect(listingRows).toHaveLength(entries.length);
    expect(releaseRows).toHaveLength(entries.length);
    for (const e of entries) {
      const l = libraryListing(catalogEntry(e));
      expect(seed, e.key).toContain(`values ('${l.id}', '${l.seller.replace(/'/g, "''")}', 'open', false, '${l.title.replace(/'/g, "''")}',`);
      expect(seed, e.key).toContain(`insert into public.package_releases (listing_id, version, content) values ('${l.id}', ${l.packageVersion}, `);
      expect(seed, e.key).toContain(`'${l.attribution!.replace(/'/g, "''")}'`);
    }
    // Every row is an upsert, so loading the seed again is safe.
    expect(listingRows.length).toBe((seed.match(/on conflict \(id\) do update set/g) ?? []).length);
    expect(releaseRows.length).toBe((seed.match(/on conflict \(listing_id, version\) do update set content = excluded\.content;/g) ?? []).length);
  });

  it('seeds each release with exactly the lessons the app shows', () => {
    for (const e of entries) {
      const l = libraryListing(catalogEntry(e));
      const line = seed.split('\n').find((s) => s.startsWith(`insert into public.package_releases (listing_id, version, content) values ('${l.id}', `))!;
      const json = line.slice(line.indexOf(", '") + 3, line.lastIndexOf("'::jsonb")).replace(/''/g, "'");
      const content = JSON.parse(json) as ReturnType<typeof libraryContent>;
      expect(content.units.flatMap((u) => u.lessons).length, e.key).toBe(l.lessons);
      expect(content, e.key).toEqual(JSON.parse(JSON.stringify(libraryContent(e))));
    }
  });
});
