import { describe, expect, it } from 'vitest';

import { distanceBand, fuzzCoord, matchFamilies, SAMPLE_FAMILIES } from '../community';
import { addDays, nextDayIn, schoolDatesBetween, weekdayOf } from '../dates';
import { evaluatorPacketHtml, esc, noiHtml } from '../documents';
import { summarizeHours } from '../hours';
import { pacing } from '../pacing';
import { QUIZ, scoreQuiz } from '../quiz';
import { autoStagger, bumpTargets, findParentConflicts, gentleBump, tasksForDate } from '../schedule';
import { getStateLaw, STATE_LAWS, stateFromZip } from '../states';
import type { Child, Curriculum, FamilyProfile, RhythmBlock, Task } from '../types';
import { generateUnitStudy } from '../unitStudy';

const task = (p: Partial<Task> & Pick<Task, 'id' | 'childId' | 'start' | 'mode'>): Task => ({
  date: '2026-10-19',
  title: p.id,
  subject: 'math',
  durationMin: 30,
  icon: '⭐',
  steps: [],
  status: 'todo',
  ...p,
});

const child = (id: string, birthdate: string): Child => ({
  id, name: id, birthdate, grade: 'K', avatar: '🦊', color: '#000', learningDifferences: [], passions: [], soloToleranceMin: 15, sparks: 0,
});

describe('dates', () => {
  it('finds the next school day across a weekend', () => {
    // 2026-10-16 is a Friday
    expect(weekdayOf('2026-10-16')).toBe(5);
    expect(nextDayIn('2026-10-16', [1, 2, 3, 4, 5])).toBe('2026-10-19');
  });
  it('lists school dates in range', () => {
    expect(schoolDatesBetween('2026-10-19', '2026-10-25', [1, 2, 3, 4, 5])).toHaveLength(5);
  });
});

describe('quiz', () => {
  it('has 15 questions', () => expect(QUIZ).toHaveLength(15));
  it('scores a Charlotte Mason-leaning family and sums to 100', () => {
    const answers: Record<string, number> = {};
    for (const q of QUIZ) {
      const idx = q.options.findIndex((o) => (o.weights.charlotte_mason ?? 0) >= 2);
      answers[q.id] = idx >= 0 ? idx : 0;
    }
    const r = scoreQuiz(answers);
    expect(r.breakdown[0].philosophy).toBe('charlotte_mason');
    expect(r.breakdown.reduce((a, b) => a + b.percent, 0)).toBe(100);
    expect(r.breakdown.length).toBeLessThanOrEqual(3);
  });
  it('returns an empty breakdown with no answers', () => {
    expect(scoreQuiz({}).breakdown).toEqual([]);
  });
});

describe('state law directory', () => {
  it('covers 50 states + DC', () => {
    expect(STATE_LAWS).toHaveLength(51);
    expect(new Set(STATE_LAWS.map((s) => s.code)).size).toBe(51);
  });
  it('maps ZIPs to states', () => {
    expect(stateFromZip('80202')).toBe('CO');
    expect(stateFromZip('10001')).toBe('NY');
    expect(stateFromZip('73301')).toBe('TX');
    expect(stateFromZip('abc')).toBeUndefined();
  });
  it('flags high-regulation states', () => {
    expect(getStateLaw('pa')?.tier).toBe('high');
    expect(getStateLaw('TX')?.noticeRequired).toBe(false);
  });
});

describe('parent availability balancing', () => {
  it('detects two 1-on-1s at the same time', () => {
    const tasks = [
      task({ id: 'a', childId: 'leo', start: '09:00', mode: 'parent' }),
      task({ id: 'b', childId: 'maya', start: '09:15', mode: 'parent' }),
      task({ id: 'c', childId: 'noah', start: '09:00', mode: 'solo' }),
    ];
    const conflicts = findParentConflicts(tasks);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapMin).toBe(15);
  });

  it('does not flag copies of the same group block against each other', () => {
    const tasks = ['leo', 'maya', 'noah'].map((c) => task({ id: `g-${c}`, childId: c, start: '10:30', mode: 'group', groupKey: 'unit|d' }));
    expect(findParentConflicts(tasks)).toHaveLength(0);
  });

  it('auto-staggers overlapping 1-on-1s and pushes the child\'s solo work', () => {
    const tasks = [
      task({ id: 'leo-phonics', childId: 'leo', start: '09:00', mode: 'parent' }),
      task({ id: 'maya-math', childId: 'maya', start: '09:00', mode: 'parent' }),
      task({ id: 'maya-read', childId: 'maya', start: '09:30', mode: 'solo' }),
    ];
    const { tasks: out, moves } = autoStagger(tasks);
    expect(findParentConflicts(out)).toHaveLength(0);
    const mayaMath = out.find((t) => t.id === 'maya-math')!;
    const mayaRead = out.find((t) => t.id === 'maya-read')!;
    expect(mayaMath.start).toBe('09:30');
    expect(mayaRead.start).toBe('10:00');
    expect(moves.length).toBe(2);
  });
});

describe('rhythm materialization + gentle bump', () => {
  const blocks: RhythmBlock[] = [
    { id: 'b1', title: 'Phonics', subject: 'phonics', childIds: ['leo'], mode: 'parent', start: '09:00', durationMin: 30, days: [1, 2, 3, 4, 5], icon: '🔤', steps: ['Flashcards'] },
    { id: 'b2', title: 'Egypt', subject: 'history', childIds: ['leo', 'maya'], mode: 'group', start: '10:30', durationMin: 45, days: [1], icon: '🏛️', steps: [] },
  ];

  it('creates tasks once per block/child/date', () => {
    const first = tasksForDate(blocks, '2026-10-19', []);
    expect(first).toHaveLength(3);
    expect(first.filter((t) => t.groupKey).every((t) => t.groupKey === first.find((x) => x.groupKey)!.groupKey)).toBe(true);
    expect(tasksForDate(blocks, '2026-10-19', first)).toHaveLength(0);
  });

  it('bumps unfinished tasks to the target and does not regenerate them', () => {
    const today = '2026-10-19';
    const created = tasksForDate(blocks, today, []);
    created[0].status = 'done';
    const target = addDays(today, 1);
    const { tasks: bumped, moved } = gentleBump(created, today, target);
    expect(moved).toBe(2);
    expect(bumped.filter((t) => t.date === target).every((t) => t.bumpedFrom === today)).toBe(true);
    // Regenerating today must not resurrect bumped tasks.
    expect(tasksForDate(blocks, today, bumped)).toHaveLength(0);
    // Group copies keep a shared start on the new day.
    const g = bumped.filter((t) => t.groupKey && t.date === target);
    expect(new Set(g.map((t) => t.start)).size).toBe(1);
  });

  it('offers next school day and flex day targets', () => {
    // Monday → Tuesday next school day, Friday flex
    const targets = bumpTargets('2026-10-19', [1, 2, 3, 4, 5], 5);
    expect(targets.map((t) => t.date)).toEqual(['2026-10-20', '2026-10-23']);
  });
});

describe('pacing', () => {
  const base: Curriculum = { id: 'c', name: 'Saxon 5/4', subject: 'math', childIds: ['maya'], totalLessons: 120, lessonsDone: 0, startDate: '2026-09-01', targetEndDate: '2027-05-28', schoolDays: [1, 2, 3, 4, 5], model: 'turnkey' };

  it('respreads remaining lessons when behind instead of creating backlog', () => {
    const behind = pacing({ ...base, lessonsDone: 5 }, '2026-11-02');
    expect(behind.state).toBe('behind');
    expect(behind.lessonsPerDay).toBeGreaterThan(120 / behind.totalSchoolDays);
  });
  it('reports done', () => {
    expect(pacing({ ...base, lessonsDone: 120 }, '2026-11-02').state).toBe('done');
  });
});

describe('hours', () => {
  it('splits core and non-core and counts attendance days', () => {
    const tasks = [
      task({ id: 'a', childId: 'leo', start: '09:00', mode: 'solo', status: 'done', subject: 'math', minutesSpent: 40 }),
      task({ id: 'b', childId: 'leo', start: '10:00', mode: 'solo', status: 'done', subject: 'art', date: '2026-10-20' }),
      task({ id: 'c', childId: 'leo', start: '11:00', mode: 'solo', status: 'todo', subject: 'science' }),
    ];
    const s = summarizeHours(tasks, [{ id: 'l', childId: 'leo', date: '2026-10-21', subject: 'pe', minutes: 60 }], { childId: 'leo' });
    expect(s.coreMin).toBe(40);
    expect(s.nonCoreMin).toBe(90);
    expect(s.daysAttended).toBe(3);
  });
});

describe('documents', () => {
  const family: FamilyProfile = { familyName: 'The Miller Crew', parentName: 'Dana Miller', parentPin: '1234', stateCode: 'PA', zip: '19103', values: [], interests: [], schoolYearStart: '2026-08-24', schoolYearEnd: '2027-06-04', schoolDays: [1, 2, 3, 4, 5], createdAt: '' };
  it('escapes user content', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });
  it('renders an NOI with children and state requirements', () => {
    const html = noiHtml(family, getStateLaw('PA')!, [child('Leo', '2021-03-01')], { schoolYear: '2026–2027', parentName: 'Dana Miller', address: '1 Main St', district: 'Philly SD', superintendent: 'Dr. Smith', signature: 'Dana Miller', checklist: {} });
    expect(html).toContain('Notice of Intent');
    expect(html).toContain('Leo');
    expect(html).toContain('Pennsylvania');
  });
  it('renders an evaluator packet', () => {
    const html = evaluatorPacketHtml({ family, children: [child('Leo', '2021-03-01')], tasks: [], logs: [], evidence: [], curricula: [], from: '2026-08-01', to: '2027-06-30' });
    expect(html).toContain('Home Education Portfolio');
  });
});

describe('community + unit study', () => {
  it('only exposes distance bands', () => {
    expect(distanceBand(1.2)).toBe('within 2 mi');
    expect(distanceBand(70)).toBe('50+ mi');
    const [lat] = fuzzCoord(39.7392, -104.9903);
    expect(Math.abs(lat - 39.74)).toBeLessThan(0.011);
  });
  it('filters by kid ages within radius', () => {
    const r = matchFamilies(SAMPLE_FAMILIES, { maxMiles: 10, ageMin: 8, ageMax: 10 });
    expect(r.every((f) => f.kidAges.some((a) => a >= 8 && a <= 10))).toBe(true);
    expect(r.every((f) => f.distanceMiles <= 10)).toBe(true);
  });
  it('generates tiered unit study days per child', () => {
    const plan = generateUnitStudy('Ancient Egypt', [child('leo', '2021-03-01'), child('noah', '2013-01-01')]);
    expect(plan.days).toHaveLength(10);
    expect(plan.days[0].perChild.map((p) => p.tier)).toEqual(['early', 'upper']);
    expect(plan.days[0].perChild[0].activity).toContain('Ancient Egypt');
  });
});
