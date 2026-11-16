import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { agesLabel, eventWhen, FINDER_PAGE, finderCount, finderView, knownPlace, memberSince } from '../community';
import { addDays, formatUsDate, todayKey } from '../dates';
import { parseScanRecord, parseTable, parseWebPage } from '../importers';
import { licenseLabel, licenseSummary } from '../license';
import { arrangeNotices, groupNotices, moderationNotice, type Notice } from '../notifications';
import { hasUnpublishedChanges, newLesson, newPackage, newUnit, privateForGood, publishAction, type CurriculumPackage } from '../package';
import { plural } from '../text';
import { useStudio } from '@/store/useStudio';

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return { default: { getItem: async (k: string) => mem.get(k) ?? null, setItem: async (k: string, v: string) => void mem.set(k, v), removeItem: async (k: string) => void mem.delete(k) } };
});

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

// A complete original that could be published.
const ready = (p: Partial<CurriculumPackage> = {}) =>
  newPackage({ title: 'Space Math', description: 'Rockets, orbits and a lot of counting.', subjects: ['math'], units: [newUnit('Orbits', [newLesson('Count the planets')])], license: { kind: 'cc_by' }, ...p });

describe('SC-04 publishing: label, readiness and release notes', () => {
  it('a draft publishes to the Marketplace once nothing is missing', () => {
    expect(publishAction(ready())).toEqual({ title: 'Publish to the Marketplace', ready: true, reason: '', releaseNote: false });
    const empty = publishAction(ready({ title: '' }));
    expect(empty.ready).toBe(false);
    expect(empty.reason).toBe('Still needed: a title');
  });

  it('right after publishing there is nothing new to publish (no empty v2)', () => {
    const at = '2026-11-15T10:00:00.000Z';
    const live = ready({ status: 'published', version: 1, publishedAt: at, updatedAt: at });
    expect(hasUnpublishedChanges(live)).toBe(false);
    expect(publishAction(live)).toEqual({ title: 'Publish update (v2)', ready: false, reason: 'No changes since v1', releaseNote: false });
  });

  it('an edit after publishing offers the update and asks for release notes', () => {
    const live = ready({ status: 'published', version: 1, publishedAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:05:00.000Z' });
    expect(hasUnpublishedChanges(live)).toBe(true);
    expect(publishAction(live)).toEqual({ title: 'Publish update (v2)', ready: true, reason: '', releaseNote: true });
  });

  it('compares times, not strings (the server writes +00:00 with microseconds)', () => {
    const live = ready({ status: 'published', version: 3, publishedAt: '2026-11-15T10:00:00.123456+00:00', updatedAt: '2026-11-15T10:00:00.123Z' });
    expect(hasUnpublishedChanges(live)).toBe(false);
  });

  it('a republish after unpublishing keeps asking what’s new (families had an earlier version)', () => {
    expect(publishAction(ready({ status: 'draft', version: 2 })).releaseNote).toBe(true);
  });

  it('saving the published package keeps its time; an edit stamps a new one', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const pkg = ready({ status: 'published', version: 1, publishedAt: at, updatedAt: at });
    useStudio.getState().upsertPackage(pkg, false);
    expect(useStudio.getState().packages.find((p) => p.id === pkg.id)?.updatedAt).toBe(at);
    useStudio.getState().upsertPackage({ ...pkg, title: 'Space Math 2' });
    const edited = useStudio.getState().packages.find((p) => p.id === pkg.id)!;
    expect(edited.updatedAt > at).toBe(true);
    expect(publishAction(edited).ready).toBe(true);
  });
});

describe('SC-10 private plans', () => {
  it('book conversions and no-derivatives sources are private for good; drafts and unsure sources are not', () => {
    expect(privateForGood(ready({ origin: { kind: 'owned_book', title: 'Math 4' } }))).toBe(true);
    const web = { kind: 'open_web' as const, url: 'https://x.org', title: 'X', retrievedAt: '2026-01-01', licenseDetected: true };
    expect(privateForGood(ready({ origin: web, license: { kind: 'cc_by_nd' } }))).toBe(true);
    expect(privateForGood(ready({ origin: web, license: { kind: 'unknown' } }))).toBe(false);
    expect(privateForGood(ready({ origin: web, license: { kind: 'cc_by_sa' } }))).toBe(false);
    expect(privateForGood(ready())).toBe(false);
  });
});

describe('SC-11 spreadsheet rows that can’t be read', () => {
  it('says which rows were dropped instead of losing them silently', () => {
    const r = parseTable('Unit,Lesson,Pages\nAnimals,Mammals,4-9\nbogus line without commas\nAnimals,Birds,10-12');
    expect(r.units[0].lessons.map((l) => l.title)).toEqual(['Mammals', 'Birds']);
    expect(r.warnings).toContain('1 row couldn’t be read (row 3): no lesson title in the “Lesson” column.');
  });

  it('counts several and caps the list', () => {
    const rows = ['Unit,Lesson', 'A,One', ...Array.from({ length: 7 }, (_, i) => `junk ${i}`)].join('\n');
    expect(parseTable(rows).warnings.find((w) => w.includes('couldn’t be read'))).toBe('7 rows couldn’t be read (rows 3, 4, 5, 6, 7…): no lesson title in the “Lesson” column.');
  });

  it('a clean sheet has no such warning, and an empty one keeps its own message', () => {
    expect(parseTable('Unit,Lesson\nA,One\nA,Two').warnings).toEqual([]);
    expect(parseTable('Unit,Lesson\nonly junk').warnings).toEqual(['No lessons found in those rows.']);
  });
});

describe('SC-12 web import wording', () => {
  it('a Gutenberg book reads as a book', () => {
    expect(parseWebPage(fixture('gutenberg-book.html'), 'https://www.gutenberg.org/ebooks/2290').format).toBe('book');
    expect(parseWebPage(fixture('generic-course.html'), 'https://garden.example.org/backyard/').format).toBe('page');
  });

  it('a license is named once when its long name adds nothing', () => {
    expect(licenseSummary({ kind: 'public_domain' })).toBe('Public domain');
    expect(licenseSummary({ kind: 'cc_by', version: '4.0' })).toMatch(/^CC BY 4\.0 — /);
  });

  it('an archive.org identifier with no record has no title (the screen asks for one)', () => {
    expect(parseScanRecord('{}').title).toBeUndefined();
    expect(parseScanRecord('not json').title).toBeUndefined();
    expect(parseScanRecord(fixture('archive-scan.json')).title).toBeTruthy();
  });
});

describe('SC-23 license labels in lists', () => {
  it('spells out all rights reserved instead of a bare ©', () => {
    expect(licenseLabel({ kind: 'all_rights_reserved' })).toBe('All rights reserved');
    expect(licenseLabel({ kind: 'cc_by_sa', version: '4.0' })).toBe('CC BY-SA 4.0');
  });
});

describe('SC-26 date examples', () => {
  it('formats a date the way the date fields take it, and examples are in the future', () => {
    expect(formatUsDate('2027-06-04')).toBe('06/04/2027');
    expect(addDays(todayKey(), 30) > todayKey()).toBe(true);
  });
});

describe('SC-28 counts', () => {
  it('pluralizes', () => {
    expect(plural(1, 'unit')).toBe('1 unit');
    expect(plural(2, 'lesson')).toBe('2 lessons');
    expect(plural(3, 'family', 'families')).toBe('3 families');
    expect(plural(0, 'lesson')).toBe('0 lessons');
  });
});

describe('SC-16 the family finder', () => {
  const fam = (id: string, connection = 'none') => ({ id, connection });
  it('leaves out families you’re already connected to', () => {
    const v = finderView([fam('a'), fam('b', 'connected'), fam('c', 'requested')]);
    expect(v.list.map((f) => f.id)).toEqual(['a', 'c']);
    expect(v.total).toBe(2);
  });

  it('shows a page at a time, keeping the server’s nearest-first order', () => {
    const all = Array.from({ length: 23 }, (_, i) => fam(`f${i}`));
    expect(finderView(all)).toMatchObject({ total: 23, more: 23 - FINDER_PAGE });
    expect(finderView(all).list[0].id).toBe('f0');
    expect(finderView(all, FINDER_PAGE * 3)).toMatchObject({ more: 0 });
    expect(finderView(all, FINDER_PAGE * 3).list).toHaveLength(23);
  });

  it('counts families within the radius', () => {
    expect(finderCount(12, 25)).toBe('12 families within 25 mi');
    expect(finderCount(1, 5)).toBe('1 family within 5 mi');
  });
});

describe('SC-05 telling lookalike families apart', () => {
  it('says when a family joined, by month', () => {
    expect(memberSince('2026-11-01T00:00:00+00:00')).toBe('On Freerange since Nov 2026');
    expect(memberSince(undefined)).toBeUndefined();
    expect(memberSince('nope')).toBeUndefined();
  });

  it('a hidden family profile is explained to that family', () => {
    const n = moderationNotice({ id: 'm1', targetKind: 'family', targetId: 'f', action: 'hidden', title: 'Dana M.', at: '2026-11-15T10:00:00Z' });
    expect(n.title).toBe('A moderator hid your family’s community profile');
    expect(n.link).toEqual({ to: 'community' });
  });
});

describe('SC-15 field trip cards', () => {
  it('shows the start time with the date', () => {
    expect(eventWhen('2026-11-20', '10:00')).toBe('Fri, Nov 20 · 10 AM');
    expect(eventWhen('2026-11-20', '13:30')).toBe('Fri, Nov 20 · 1:30 PM');
    expect(eventWhen('2026-11-20')).toBe('Fri, Nov 20');
  });

  it('reads ages naturally, and hides the old TBD place', () => {
    expect(agesLabel('All ages')).toBe('Ages: all');
    expect(agesLabel('6–10')).toBe('Ages: 6–10');
    expect(agesLabel('Ages 5+')).toBe('Ages: 5+');
    expect(knownPlace('TBD')).toBeUndefined();
    expect(knownPlace(' Library steps ')).toBe('Library steps');
  });
});

describe('SC-20 notification groups', () => {
  const n = (id: string, at: string): Notice => ({ id, kind: 'help', icon: '✋', title: id, at, link: { to: 'today' } });
  it('splits into New and Earlier, keeping the order and leaving out empty groups', () => {
    const { items } = arrangeNotices([n('a', '2026-11-15T09:00:00Z'), n('b', '2026-11-15T10:00:00Z'), n('c', '2026-11-14T10:00:00Z')], { a: '2026-11-15T11:00:00Z' });
    expect(groupNotices(items).map((g) => [g.title, g.items.map((x) => x.id)])).toEqual([
      ['New', ['b', 'c']],
      ['Earlier', ['a']],
    ]);
    expect(groupNotices(items.filter((x) => x.read)).map((g) => g.title)).toEqual(['Earlier']);
    expect(groupNotices([])).toEqual([]);
  });
});
