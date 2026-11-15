import { describe, expect, it } from 'vitest';

import { aggregateReports, insightSentences, lessonReports, type LessonStat, type StoredReport } from '../insights';
import { newLesson, type PackageUnit } from '../package';
import type { Curriculum, Task } from '../types';

const units: PackageUnit[] = [
  { id: 'u1', title: 'Rocks', lessons: [{ ...newLesson('Fossils', { minutes: 30 }), id: 'l1' }, { ...newLesson('Crystals'), id: 'l2' }, { ...newLesson('Volcanoes'), id: 'l3' }] },
];
const cur = (p: Partial<Curriculum> = {}): Curriculum => ({
  id: 'c1', name: 'Rock Detectives', subject: 'science', childIds: ['k1', 'k2'], totalLessons: 3, lessonsDone: 0, startDate: '2026-08-17', targetEndDate: '2027-05-28',
  schoolDays: [1, 2, 3, 4, 5], model: 'modular', outline: units, listingId: 'lst', ...p,
});
const task = (p: Partial<Task>): Task => ({
  id: 't', childId: 'k1', date: '2026-11-09', title: 'Rocks', subject: 'science', mode: 'solo', start: '09:00', durationMin: 30, icon: '🪨', steps: [], status: 'done', curriculumId: 'c1', ...p,
});

describe('lesson reports (what a family sends)', () => {
  it('combines the family’s kids into one row per lesson, with nothing about the kids', () => {
    const tasks = [
      task({ id: 'a', childId: 'k1', lessonId: 'l1', minutesSpent: 50, selfAssessment: 1, reflection: 'Rocks are cool' }),
      task({ id: 'b', childId: 'k2', lessonId: 'l1', minutesSpent: 70 }),
      task({ id: 'c', childId: 'k1', lessonNo: 2 }), // no lessonId: found by number
      task({ id: 'd', childId: 'k2', lessonId: 'l3', status: 'skipped' }),
      task({ id: 'e', childId: 'k1', lessonId: 'l3', status: 'todo' }),
      task({ id: 'f', curriculumId: 'other', lessonId: 'l1' }),
    ];
    const reports = lessonReports([cur(), cur({ id: 'c2', listingId: undefined })], tasks);
    expect(reports).toEqual([
      { listingId: 'lst', lessonId: 'l1', lessonNo: 1, done: true, skipped: false, minutes: 60, planned: 30, tricky: true },
      { listingId: 'lst', lessonId: 'l2', lessonNo: 2, done: true, skipped: false, minutes: undefined, planned: 30, tricky: false },
      { listingId: 'lst', lessonId: 'l3', lessonNo: 3, done: false, skipped: true, minutes: undefined, planned: 30, tricky: false },
    ]);
    const sent = JSON.stringify(reports);
    for (const secret of ['k1', 'k2', 'Rocks are cool', 'Maya']) expect(sent).not.toContain(secret);
  });

  it('leaves out lessons no longer in the plan, and plans without a listing', () => {
    expect(lessonReports([cur()], [task({ lessonId: 'gone' })])).toEqual([]);
    expect(lessonReports([cur({ listingId: undefined })], [task({ lessonId: 'l1' })])).toEqual([]);
  });
});

describe('aggregated insights', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const row = (family: string, lessonId: string, lessonNo: number, p: Partial<StoredReport> = {}): StoredReport => ({
    family, listingId: 'lst', lessonId, lessonNo, done: true, skipped: false, tricky: false, updatedAt: '2026-11-10T00:00:00Z', ...p,
  });

  it('only shows lessons at least 5 families reported', () => {
    const rows = [...['a', 'b', 'c', 'd', 'e'].map((f) => row(f, 'l1', 1, { minutes: 60, planned: 30 })), ...['a', 'b', 'c', 'd'].map((f) => row(f, 'l2', 2))];
    const stats = aggregateReports(rows, now);
    expect(stats.map((s) => s.lessonId)).toEqual(['l1']);
    expect(stats[0]).toMatchObject({ families: 5, done: 5, avgMinutes: 60, avgPlanned: 30, totalFamilies: 5 });
    // Timings need 5 timed families too.
    const fewTimed = aggregateReports([...rows.slice(0, 4), row('e', 'l1', 1)], now);
    expect(fewTimed[0].avgMinutes).toBeUndefined();
  });

  it('counts families who stopped at a lesson a month ago', () => {
    const old = '2026-09-01T00:00:00Z';
    const rows = [
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((f) => row(f, 'l1', 1, { updatedAt: ['a', 'b', 'c'].includes(f) ? old : '2026-11-10T00:00:00Z' })),
      ...['d', 'e', 'f'].map((f) => row(f, 'l2', 2)),
    ];
    expect(aggregateReports(rows, now).find((s) => s.lessonId === 'l1')?.stoppedHere).toBe(3);
  });
});

describe('insight sentences', () => {
  const stat = (lessonId: string, p: Partial<LessonStat> = {}): LessonStat => ({ lessonId, families: 10, done: 10, skipped: 0, tricky: 0, stoppedHere: 0, totalFamilies: 12, ...p });

  it('says it plainly: time, tricky, skipped, and where families stop', () => {
    const s = insightSentences(units, [
      stat('l1', { avgMinutes: 62, avgPlanned: 30, tricky: 5 }),
      stat('l2', { done: 6, skipped: 4, stoppedHere: 4 }),
      stat('l3', { avgMinutes: 12, avgPlanned: 30 }),
      stat('removed-lesson', { avgMinutes: 100, avgPlanned: 10 }),
    ]);
    expect(s.map((x) => x.text)).toEqual([
      'Lesson 2 (“Crystals”) is where families most often stop: 4 of 10 who finished it haven’t gone further in a month.',
      'Lesson 1 (“Fossils”) takes about twice as long as planned (about 62 min vs. 30 planned).',
      'Kids often mark Lesson 1 (“Fossils”) as tricky (50% of families who finished it).',
      'Many families skip Lesson 2 (“Crystals”): only 60% of those who got to it finished it.',
      'Lesson 3 (“Volcanoes”) takes about half the planned time (about 12 min vs. 30 planned).',
    ]);
  });

  it('says when things are going to plan, and nothing without data', () => {
    expect(insightSentences(units, [stat('l1', { avgMinutes: 33, avgPlanned: 30 })])[0]).toMatchObject({ kind: 'good' });
    expect(insightSentences(units, [])).toEqual([]);
  });
});
