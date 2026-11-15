import { describe, expect, it } from 'vitest';

import { DISTANCE_BANDS, distanceBand, fuzzCoord, haversineMiles, matchFamilies, MEETUP_SAFETY_TIPS, SAMPLE_FAMILIES, type FamilyCard } from '../community';
import { classToListing, familyProgress, MAX_FAMILIES, normalizeClassCode, rosterSummary, studentLabel, type ClassMember, type CoopClass } from '../coop';
import { addDays, todayKey } from '../dates';
import { aggregateReports, insightSentences, lessonReports, MIN_FAMILIES, STALLED_DAYS, type LessonStat, type StoredReport } from '../insights';
import { arrangeNotices, eventNotices, messageNotices, moderationNotice, planNotices, pruneRead, timeAgo, type ConversationSummary } from '../notifications';
import { newLesson, type PackageUnit } from '../package';
import { parseStandard, parseStandardList, standardCode, standardLabel, STRANDS, strandsFor, subjectCoverage } from '../standards';
import type { Curriculum, Task } from '../types';

// Studio & Community: the pure logic behind the family finder, co-op classes,
// Studio Insights' privacy rules, standards tags, and notifications.

const card = (p: Partial<FamilyCard>): FamilyCard => ({ id: 'x', displayName: 'X', kidAges: [], philosophies: [], interests: [], distanceMiles: 1, verified: false, ...p });

describe('family finder', () => {
  it('shows a distance band, never the distance', () => {
    expect([0, 2, 2.01, 5, 9.9, 25, 49, 50, 50.1, 400].map(distanceBand)).toEqual(['within 2 mi', 'within 2 mi', 'within 5 mi', 'within 5 mi', 'within 10 mi', 'within 25 mi', 'within 50 mi', 'within 50 mi', '50+ mi', '50+ mi']);
    expect(DISTANCE_BANDS.at(-1)).toBe(50);
  });

  it('snaps coordinates to a grid so neighbors look the same', () => {
    expect(fuzzCoord(39.741, -104.981)).toEqual(fuzzCoord(39.739, -104.979));
    const [lat, lng] = fuzzCoord(39.741, -104.981);
    expect(Math.abs(lat - 39.74)).toBeLessThan(1e-9);
    expect(Math.abs(lng + 104.98)).toBeLessThan(1e-9);
  });

  it('measures miles between points', () => {
    expect(haversineMiles([39.7392, -104.9903], [39.7392, -104.9903])).toBe(0);
    // Denver → Boulder is about 24 miles.
    expect(Math.round(haversineMiles([39.7392, -104.9903], [40.015, -105.2705]))).toBe(24);
  });

  it('filters by distance, kids’ ages, style and interest, and ranks shared interests first', () => {
    const cards = [
      card({ id: 'far', distanceMiles: 30, interests: ['birds'] }),
      card({ id: 'near', distanceMiles: 1, kidAges: [6], interests: ['chess'] }),
      card({ id: 'birdy', distanceMiles: 4, kidAges: [8], interests: ['Birds', 'art'], verified: true, philosophies: ['charlotte_mason'] }),
    ];
    expect(matchFamilies(cards, { maxMiles: 25 }, ['birds']).map((c) => c.id)).toEqual(['birdy', 'near']);
    expect(matchFamilies(cards, { maxMiles: 50, ageMin: 7, ageMax: 9 }).map((c) => c.id)).toEqual(['birdy']);
    expect(matchFamilies(cards, { maxMiles: 50, ageMin: 7 }).map((c) => c.id)).toEqual(['birdy']);
    expect(matchFamilies(cards, { maxMiles: 50, philosophy: 'charlotte_mason' }).map((c) => c.id)).toEqual(['birdy']);
    expect(matchFamilies(cards, { maxMiles: 50, interest: 'BIRD' }).map((c) => c.id).sort()).toEqual(['birdy', 'far']);
    expect(matchFamilies(cards, { maxMiles: 50 })[0]).toHaveProperty('band');
  });

  it('the sample network uses first names and initials only, and shows no addresses', () => {
    for (const f of SAMPLE_FAMILIES) expect(f.displayName).toMatch(/^[\p{L}]+( & [\p{L}]+)? [A-Z]\.$/u);
    expect(JSON.stringify(SAMPLE_FAMILIES)).not.toMatch(/\d{5}|street|@/i);
  });

  it('meetup safety tips cover public places, staying with kids, and block/report', () => {
    const text = MEETUP_SAFETY_TIPS.map((t) => `${t.title} ${t.body}`).join(' ');
    expect(MEETUP_SAFETY_TIPS.length).toBeGreaterThanOrEqual(5);
    for (const must of [/public/i, /stays with their own kids/i, /Block and report/i, /home address/i]) expect(text).toMatch(must);
  });
});

describe('co-op classes', () => {
  const cls = { id: 'c', title: 'T', teacherName: 'Ms T', description: '', subjects: [], gradeMin: 1, gradeMax: 3, lessonsPerWeek: 2, minutesPerLesson: 30, parentInvolvement: 'low', familyStyle: false, cover: '🐸', color: '#000', maxFamilies: 30, status: 'open', version: 2, families: 0 } as CoopClass;

  it('normalizes invite codes however they’re typed', () => {
    expect(normalizeClassCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeClassCode('ab cd\t23!45')).toBe('ABCD2345');
    expect(MAX_FAMILIES).toBe(30);
  });

  it('a class without subjects or lessons still plans as one lesson of “other”', () => {
    expect(classToListing(cls)).toMatchObject({ subjects: ['other'], lessons: 1, price: 0, packageVersion: 2 });
  });

  it('keeps only first names when sharing, and nothing when not', () => {
    const c = { childIds: ['a', 'b', 'gone'], progress: { a: 5, b: 99 }, totalLessons: 10, lessonsDone: 0 } as unknown as Curriculum;
    expect(familyProgress(c, [{ id: 'a', name: 'Ava Rose Rivera' }, { id: 'b', name: '' }], true)).toEqual([{ done: 5, name: 'Ava' }, { done: 10 }, { done: 0 }]);
    expect(JSON.stringify(familyProgress(c, [{ id: 'a', name: 'Ava Rose Rivera' }], false))).not.toContain('Ava');
    expect(studentLabel({ done: 1 }, 1)).toBe('Student 2');
  });

  it('summarizes an empty roster, and caps progress past the end', () => {
    expect(rosterSummary([], 10)).toEqual({ families: 0, students: 0, average: 0, finished: 0, notStarted: 0 });
    const m = (progress: { done: number }[]) => ({ progress }) as ClassMember;
    expect(rosterSummary([m([{ done: 15 }, { done: 0 }]), m([])], 10)).toEqual({ families: 2, students: 2, average: 0.5, finished: 1, notStarted: 1 });
    // A plan with no lessons doesn't divide by zero.
    expect(rosterSummary([m([{ done: 0 }])], 0).average).toBe(0);
  });
});

describe('Studio Insights privacy', () => {
  const units: PackageUnit[] = [{ id: 'u', title: 'U', lessons: [{ ...newLesson('One'), id: 'l1' }, { ...newLesson('Two', { minutes: 20 }), id: 'l2' }] }];
  const cur = { id: 'c1', name: 'Rocks', subject: 'science', childIds: ['k1'], totalLessons: 2, lessonsDone: 0, startDate: '', targetEndDate: '', schoolDays: [], model: 'modular', outline: units, listingId: 'lst' } as Curriculum;
  const task = (p: Partial<Task>): Task => ({ id: 't', childId: 'k1', date: '2026-11-09', title: 'Rocks', subject: 'science', mode: 'solo', start: '09:00', durationMin: 30, icon: '🪨', steps: [], status: 'done', curriculumId: 'c1', ...p }) as Task;

  it('clamps silly timer values and leaves out zero minutes', () => {
    const [r1, r2] = lessonReports([cur], [task({ id: 'a', lessonId: 'l1', minutesSpent: 5000 }), task({ id: 'b', lessonId: 'l2', minutesSpent: 0 })]);
    expect(r1.minutes).toBe(600);
    expect(r2).toMatchObject({ minutes: undefined, planned: 20 });
  });

  it('only finished or skipped tasks count, and a lesson done by one kid is done', () => {
    const reports = lessonReports([{ ...cur, childIds: ['k1', 'k2'] }], [task({ id: 'a', lessonId: 'l1', status: 'skipped' }), task({ id: 'b', childId: 'k2', lessonId: 'l1' }), task({ id: 'c', lessonId: 'l2', status: 'todo' })]);
    expect(reports).toEqual([expect.objectContaining({ lessonId: 'l1', done: true, skipped: false })]);
  });

  it('needs at least MIN_FAMILIES rows per lesson, and counts the same family once per lesson', () => {
    const now = new Date();
    const row = (family: string, p: Partial<StoredReport> = {}): StoredReport => ({ family, listingId: 'lst', lessonId: 'l1', lessonNo: 1, done: true, skipped: false, tricky: false, updatedAt: now.toISOString(), ...p });
    const four = ['a', 'b', 'c', 'd'].map((f) => row(f));
    expect(MIN_FAMILIES).toBe(5);
    expect(aggregateReports(four, now)).toEqual([]);
    expect(aggregateReports([...four, row('e')], now)[0].families).toBe(5);
    // A skipped-and-done row counts as done, not skipped.
    expect(aggregateReports([...four, row('e', { skipped: true })], now)[0].skipped).toBe(0);
  });

  it('a family counts as stopped only after STALLED_DAYS without progress', () => {
    const now = new Date();
    const at = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    const rows = ['a', 'b', 'c', 'd', 'e'].map((f, i) => ({ family: f, listingId: 'lst', lessonId: 'l1', lessonNo: 1, done: true, skipped: false, tricky: false, updatedAt: at(i < 3 ? STALLED_DAYS + 1 : STALLED_DAYS - 1) }));
    expect(aggregateReports(rows, now)[0].stoppedHere).toBe(3);
  });

  it('says nothing about lessons that left the plan, and nothing at all without data', () => {
    const stat: LessonStat = { lessonId: 'gone', families: 9, done: 1, skipped: 8, tricky: 0, stoppedHere: 0, totalFamilies: 9 };
    expect(insightSentences(units, [stat])).toEqual([]);
    expect(insightSentences(units, [])).toEqual([]);
  });

  it('calls a quick lesson quick, and a slow one slow', () => {
    const base = { families: 6, done: 6, skipped: 0, tricky: 0, stoppedHere: 0, totalFamilies: 6 };
    const out = insightSentences(units, [
      { ...base, lessonId: 'l1', avgMinutes: 10, avgPlanned: 30 },
      { ...base, lessonId: 'l2', avgMinutes: 90, avgPlanned: 30 },
    ]);
    expect(out.map((i) => [i.kind, i.n])).toEqual([
      ['time', 2],
      ['quick', 1],
    ]);
    expect(out[0].text).toMatch(/about 3 times as long as planned \(about 90 min vs\. 30 planned\)/);
  });
});

describe('standards tags', () => {
  it('reads long and short Common Core codes, and nothing else', () => {
    expect(parseStandard('CCSS.MATH.CONTENT.K.CC.A.1')).toMatchObject({ strand: { code: 'CC' }, grade: 'K' });
    expect(parseStandard('ccss.ela-literacy.rl.4.2')).toMatchObject({ strand: { code: 'RL' }, grade: '4' });
    expect(parseStandard('3.NF.A.1')).toMatchObject({ strand: { code: 'NF' }, grade: '3' });
    expect(parseStandard('TEKS 3.3A')).toBeUndefined();
    expect(parseStandard('3.XX.1')).toBeUndefined();
    expect(parseStandard('')).toBeUndefined();
  });

  it('labels built-in codes and leaves others as typed', () => {
    expect(standardLabel(' MATH.CONTENT.6.EE ')).toBe('Math 6.EE · Expressions & Equations');
    expect(standardLabel('  NGSS 4-LS1-1 ')).toBe('NGSS 4-LS1-1');
  });

  it('builds codes clamped to the grades a strand is written for', () => {
    const nf = STRANDS.find((s) => s.code === 'NF')!;
    expect(standardCode(nf, 1)).toBe('CCSS.MATH.CONTENT.3.NF');
    expect(standardCode(nf, 9)).toBe('CCSS.MATH.CONTENT.5.NF');
    expect(standardCode(STRANDS.find((s) => s.code === 'W')!, 0)).toBe('CCSS.ELA-LITERACY.W.K');
  });

  it('suggests strands only for matching subjects and grades', () => {
    expect(strandsFor(['science'], 1, 5)).toEqual([]);
    expect(strandsFor(['math'], 6, 6).map((s) => s.code)).toEqual(['G', 'RP', 'NS', 'EE', 'SP']);
    expect(strandsFor(['phonics'], 0, 0).map((s) => s.code)).toEqual(['RL', 'RI', 'RF', 'W', 'SL', 'L']);
  });

  it('reads a typed list: commas, semicolons, new lines; deduped; each at most 60 characters', () => {
    expect(parseStandardList('a, b;\nA ;; c')).toEqual(['a', 'b', 'c']);
    expect(parseStandardList('x'.repeat(80))[0]).toHaveLength(60);
    expect(parseStandardList('')).toEqual([]);
  });

  it('counts a tagged standard toward its own subject', () => {
    const outline: PackageUnit[] = [{ id: 'u', title: 'U', lessons: [newLesson('Read a story', { standards: ['CCSS.ELA-LITERACY.RL.3', 'CCSS.ELA-LITERACY.RL.3'] })] }];
    const cov = subjectCoverage([{ id: 'c', name: 'Pond Science', subject: 'science', childIds: [], totalLessons: 1, lessonsDone: 0, startDate: '', targetEndDate: '', schoolDays: [], model: 'modular', outline } as Curriculum]);
    expect(cov.find((c) => c.subject === 'reading')).toEqual({ subject: 'reading', sources: ['Pond Science'], standards: ['CCSS.ELA-LITERACY.RL.3'] });
  });
});

describe('notifications', () => {
  const convo = (p: Partial<ConversationSummary>): ConversationSummary => ({ conversationId: 'c1', familyId: 'f1', displayName: 'Rosa', verified: false, lastFromMe: false, unread: 1, canMessage: true, blocked: false, lastAt: '2026-11-14T10:00:00Z', lastBody: 'Hi!', ...p });

  it('never announces messages from a blocked family or with nothing unread', () => {
    expect(messageNotices([convo({ blocked: true }), convo({ unread: 0 })])).toEqual([]);
    expect(messageNotices([convo({ unread: 2, lastFromMe: true })])[0]).toMatchObject({ title: '2 new messages from Rosa', body: undefined });
  });

  it('announces trips from today through a week ahead, computed from today', () => {
    const today = todayKey();
    const events = [-1, 0, 7, 8].map((d) => ({ id: `e${d}`, title: `Trip ${d}`, date: addDays(today, d), location: d === 0 ? '' : 'Museum' }));
    const notes = eventNotices(events, today);
    expect(notes.map((n) => n.title)).toEqual(['Coming up: Trip 0', 'Coming up: Trip 7']);
    expect(notes[0].body).not.toContain('📍');
  });

  it('skips plan updates for curricula that are gone', () => {
    expect(planNotices({ gone: { key: 'k', source: 'release', version: 2 } }, [])).toEqual([]);
  });

  it('explains every moderation decision, quoting the hidden message', () => {
    const e = (targetKind: 'listing' | 'review' | 'message' | 'verification', action: 'hidden' | 'auto_hidden' | 'restored' | 'verified' | 'declined' | 'revoked', title = 'Pond') => moderationNotice({ id: '1', targetKind, targetId: 't', action, title, at: '2026-11-14T00:00:00Z' });
    expect(e('message', 'hidden', 'Rude thing').body).toMatch(/^“Rude thing” If you think/);
    expect(e('review', 'auto_hidden', '').title).toBe('Your review is hidden for review');
    expect(e('listing', 'restored').title).toBe('A moderator restored your listing “Pond”');
    expect(e('verification', 'declined').title).toBe('We couldn’t verify your family yet');
    expect(e('verification', 'revoked').title).toBe('Your Verified badge was removed');
    expect(e('message', 'hidden').link).toEqual({ to: 'messages' });
  });

  it('sorts unread first, newest first, with untimed notices as “now”', () => {
    const now = '2026-11-14T12:00:00Z';
    const { items, unread } = arrangeNotices([
      { id: 'old', kind: 'help', icon: '', title: '', at: '2026-11-01T00:00:00Z', link: { to: 'today' } },
      { id: 'untimed', kind: 'plan', icon: '', title: '', link: { to: 'today' } },
      { id: 'read', kind: 'help', icon: '', title: '', at: '2026-11-14T11:00:00Z', link: { to: 'today' } },
    ], { read: now }, now);
    expect(items.map((i) => i.id)).toEqual(['untimed', 'old', 'read']);
    expect(unread).toBe(2);
  });

  it('forgets bad and old read marks; says how long ago', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    expect(pruneRead({ a: 'garbage', b: '2026-11-13T00:00:00Z', c: '2026-01-01T00:00:00Z' }, now)).toEqual({ b: '2026-11-13T00:00:00Z' });
    expect(timeAgo('nonsense', now)).toBe('');
    expect(timeAgo('2026-11-14T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-13T12:00:00Z', now)).toBe('1 day ago');
  });
});
