import { describe, expect, it } from 'vitest';

import { lessonNumber, setVersionPick, stepsForLesson, withLessons } from '../curriculum';
import { addDays, ageOn, todayKey, toMinutes } from '../dates';
import { arrangeNotices, eventNotices, EVENT_LEAD_DAYS, helpNotices, planNotices, pruneRead, timeAgo } from '../notifications';
import { newLesson } from '../package';
import { applyPlanUpdate, remapDone } from '../planUpdate';
import { DIMENSION_POLES, describeResult, PHILOSOPHY_INFO, QUIZ, scoreQuiz } from '../quiz';
import { CURRICULUM_SUGGESTIONS, lessonMinutes, recommendRhythm } from '../recommend';
import { findRhythmConflicts } from '../schedule';
import { hasLocalChanges, mergeWorkspace } from '../sync';
import type { Child, Curriculum, HelpRequest, Philosophy, Task } from '../types';

const today = todayKey();
const yearsAgo = (n: number) => addDays(today, -Math.round(n * 365.25) - 10);
const kid = (id: string, age: number, p: Partial<Child> = {}): Child => ({
  id, name: id, birthdate: yearsAgo(age), grade: '', avatar: '🦊', color: '#000', learningDifferences: [], passions: [], soloToleranceMin: 20, sparks: 0, ...p,
});

describe('style quiz', () => {
  it('every question has scorable options with dimensions in range', () => {
    expect(new Set(QUIZ.map((q) => q.id)).size).toBe(15);
    for (const q of QUIZ) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      for (const o of q.options) {
        for (const v of Object.values(o.dims)) expect(Math.abs(v!), q.id).toBeLessThanOrEqual(2);
        for (const p of Object.keys(o.weights)) expect(PHILOSOPHY_INFO[p as Philosophy], `${q.id} ${p}`).toBeTruthy();
      }
    }
    expect(Object.keys(DIMENSION_POLES)).toEqual(['structure', 'experiential', 'faith', 'screenFree', 'collective']);
  });

  it('always sums to 100 with at most three styles, for every “always pick option k” answer sheet', () => {
    const maxOptions = Math.max(...QUIZ.map((q) => q.options.length));
    for (let k = 0; k < maxOptions; k++) {
      const answers = Object.fromEntries(QUIZ.map((q) => [q.id, Math.min(k, q.options.length - 1)]));
      const r = scoreQuiz(answers, 'T');
      expect(r.breakdown.reduce((a, b) => a + b.percent, 0), `k=${k}`).toBe(100);
      expect(r.breakdown.length).toBeLessThanOrEqual(3);
      expect(r.breakdown.map((b) => b.percent)).toEqual([...r.breakdown.map((b) => b.percent)].sort((a, b) => b - a));
      for (const v of Object.values(r.dimensions)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(r.takenAt).toBe('T');
    }
  });

  it('ignores unanswered questions and out-of-range options', () => {
    const one = scoreQuiz({ q1: 2 });
    expect(one.breakdown).toEqual([{ philosophy: 'unschooling', percent: 100 }]);
    expect(one.dimensions.structure).toBe(-1);
    expect(scoreQuiz({ q1: 99, nope: 0 }).breakdown).toEqual([]);
  });

  it('describes a result, or "Eclectic" when there is none', () => {
    expect(describeResult(scoreQuiz({ q1: 2 }))).toBe('100% Unschooling');
    expect(describeResult(scoreQuiz({}))).toBe('Eclectic');
  });
});

describe('recommended rhythm', () => {
  const families: [string, Child[]][] = [
    ['one 5-year-old', [kid('a', 5)]],
    ['one teen', [kid('t', 14)]],
    ['twins', [kid('a', 6), kid('b', 6)]],
    ['three littles', [kid('a', 4), kid('b', 6), kid('c', 7)]],
    ['wide spread', [kid('a', 5), kid('b', 8), kid('c', 11), kid('d', 15)]],
  ];

  it.each(families)('never double-books the parent or a child (%s)', (_name, kids) => {
    for (const style of Object.keys(PHILOSOPHY_INFO) as Philosophy[]) {
      const blocks = recommendRhythm(kids, style);
      expect(findRhythmConflicts(blocks), style).toEqual([]);
      for (const k of kids) {
        const mine = blocks.filter((b) => b.childIds.includes(k.id)).map((b) => [toMinutes(b.start), toMinutes(b.start) + b.durationMin]).sort((x, y) => x[0] - y[0]);
        for (let i = 1; i < mine.length; i++) expect(mine[i][0], `${style} ${k.id}`).toBeGreaterThanOrEqual(mine[i - 1][1]);
      }
    }
  });

  it('gives little ones 1-on-1 skill time and short lessons, teens independent work', () => {
    const blocks = recommendRhythm([kid('leo', 5), kid('noah', 13)], 'classical');
    const leo = blocks.filter((b) => b.childIds.length === 1 && b.childIds[0] === 'leo' && b.mode === 'parent');
    expect(leo.map((b) => b.durationMin)).toEqual([20, 20]);
    expect(blocks.filter((b) => b.childIds[0] === 'noah' && b.childIds.length === 1 && b.mode === 'parent')).toEqual([]);
    expect(blocks.find((b) => b.mode === 'group')).toMatchObject({ title: 'Memory Work & History Cycle', childIds: ['leo', 'noah'] });
    expect([4, 6, 7, 9, 12, 13].map(lessonMinutes)).toEqual([20, 20, 30, 30, 40, 50]);
  });

  it('turns a passion into an afternoon project and defaults to a unit study', () => {
    const blocks = recommendRhythm([kid('a', 9, { passions: ['robots'] }), kid('b', 9)], undefined);
    expect(blocks.filter((b) => b.start === '13:00').map((b) => b.title).sort()).toEqual(['Outdoor Time', 'Passion Project: robots']);
    expect(blocks.find((b) => b.mode === 'group')?.title).toBe('Family Unit Study');
    expect(recommendRhythm([], 'classical')).toEqual([]);
    expect(blocks.every((b) => b.days.join() === '1,2,3,4,5')).toBe(true);
  });

  it('has curriculum suggestions for every style', () => {
    for (const p of Object.keys(PHILOSOPHY_INFO) as Philosophy[]) expect(CURRICULUM_SUGGESTIONS[p].length, p).toBeGreaterThan(0);
  });

  it('computes ages for the kids it plans around', () => {
    expect(ageOn(kid('x', 9).birthdate)).toBe(9);
  });
});

describe('notifications from this device', () => {
  const kids = [kid('a', 9, { name: 'Maya', avatar: '🦉' })];
  it('help: open only, with a fallback for an unknown kid and a general request', () => {
    const help: HelpRequest[] = [
      { id: 'h1', childId: 'gone', createdAt: '2026-11-14T10:00:00Z' },
      { id: 'h2', childId: 'a', createdAt: '2026-11-14T11:00:00Z', resolvedAt: '2026-11-14T11:05:00Z' },
      { id: 'h3', childId: 'a', taskId: 'missing-task', createdAt: '2026-11-14T12:00:00Z' },
    ];
    const out = helpNotices(help, kids, []);
    expect(out.map((n) => [n.id, n.title, n.body])).toEqual([
      ['help:h1', 'A student needs help', 'General help'],
      ['help:h3', '🦉 Maya needs help', 'General help'],
    ]);
  });

  it('events: today through the lead window, inclusive', () => {
    const ev = (id: string, d: number, location = '') => ({ id, title: id, date: addDays(today, d), location });
    const out = eventNotices([ev('yesterday', -1), ev('today', 0), ev('edge', EVENT_LEAD_DAYS), ev('beyond', EVENT_LEAD_DAYS + 1)], today);
    expect(out.map((n) => n.title)).toEqual(['Coming up: today', 'Coming up: edge']);
    expect(out[0].body).toBe('Today');
    expect(eventNotices([ev('x', 1)], today, 0)).toEqual([]);
  });

  it('plan updates: a new key makes a new notification', () => {
    const curricula = [{ id: 'c1', name: 'Pond Life' }] as Curriculum[];
    const v3 = planNotices({ c1: { key: '3', source: 'release', version: 3 } }, curricula)[0];
    const v4 = planNotices({ c1: { key: '4', source: 'release', version: 4 } }, curricula)[0];
    expect(v3.id).not.toBe(v4.id);
    expect(v4.body).toContain('Version 4');
    expect(planNotices({ c1: { key: 'not-a-date', source: 'studio' } }, curricula)[0].at).toBeUndefined();
  });

  it('reading marks: unknown ids are unread, and old marks are pruned at the cutoff', () => {
    const n = { id: 'x', kind: 'help' as const, icon: '', title: 'x', link: { to: 'today' as const } };
    expect(arrangeNotices([n], {}).unread).toBe(1);
    expect(arrangeNotices([n], { x: '2026-11-14T00:00:00Z' }).unread).toBe(0);
    const now = Date.parse('2026-11-14T00:00:00Z');
    expect(Object.keys(pruneRead({ edge: new Date(now - 90 * 864e5).toISOString(), old: new Date(now - 91 * 864e5).toISOString() }, now))).toEqual(['edge']);
    expect(timeAgo('2026-11-12', Date.parse('2026-11-14T00:00:00'))).toBe('2 days ago');
  });
});

describe('multi-device merge (family workspace)', () => {
  const t = (id: string, p: Partial<Task> = {}) => ({ id, childId: 'a', date: today, title: id, status: 'todo', start: '09:00', ...p }) as Task;

  it('a kid finishing on the tablet and a parent bumping on the phone both survive', () => {
    const base = { tasks: [t('x'), t('y')] };
    const tablet = { tasks: [t('x', { status: 'done', minutesSpent: 25 }), t('y')] };
    const phone = { tasks: [t('x'), t('y', { date: addDays(today, 1), bumpedFrom: today })] };
    expect(mergeWorkspace(base, phone, tablet).tasks).toEqual([t('x', { status: 'done', minutesSpent: 25 }), t('y', { date: addDays(today, 1), bumpedFrom: today })]);
  });

  it('work finished on one device while another bumped it stays on the day it was done (regression)', () => {
    const tomorrow = addDays(today, 1);
    const base = { tasks: [t('m', { groupKey: 'g' })] };
    const tablet = { tasks: [t('m', { groupKey: 'g', status: 'done', minutesSpent: 20 })] }; // kid finished it, offline
    const phone = { tasks: [t('m', { groupKey: `g>${tomorrow}`, date: tomorrow, start: '13:00', bumpedFrom: today })] }; // parent bumped it
    for (const merged of [mergeWorkspace(base, phone, tablet).tasks, mergeWorkspace(base, tablet, phone).tasks]) {
      expect(merged).toEqual([t('m', { groupKey: 'g', status: 'done', minutesSpent: 20 })]);
    }
    // Unfinished work still takes the bump, and other fields still merge.
    const renamed = { tasks: [t('m', { groupKey: 'g', title: 'Renamed' })] };
    expect(mergeWorkspace(base, phone, renamed).tasks[0]).toMatchObject({ date: tomorrow, title: 'Renamed', bumpedFrom: today });
  });

  it('help requests made and resolved on different devices merge per record', () => {
    const h = (id: string, p: Partial<HelpRequest> = {}): HelpRequest => ({ id, childId: 'a', createdAt: '2026-11-14T10:00:00Z', ...p });
    const base = { help: [h('h1')] };
    const parent = { help: [h('h1', { resolvedAt: '2026-11-14T10:05:00Z' })] };
    const kidDevice = { help: [h('h1'), h('h2', { childId: 'b' })] };
    const merged = mergeWorkspace(base, parent, kidDevice).help;
    expect(merged.map((x) => [x.id, !!x.resolvedAt]).sort()).toEqual([['h1', true], ['h2', false]]);
  });

  it('school days (a plain list) take the side that changed, this device on a tie', () => {
    const base = { family: { schoolDays: [1, 2, 3, 4, 5], flexDay: 5 } };
    expect(mergeWorkspace(base, base, { family: { schoolDays: [1, 2, 3, 4], flexDay: 5 } }).family.schoolDays).toEqual([1, 2, 3, 4]);
    expect(mergeWorkspace(base, { family: { schoolDays: [1, 3, 5], flexDay: 5 } }, { family: { schoolDays: [2, 4], flexDay: 3 } }).family).toEqual({ schoolDays: [1, 3, 5], flexDay: 3 });
  });

  it('removing a field on one device (flex day "None") survives the merge', () => {
    const base = { family: { familyName: 'A', flexDay: 5 } };
    const local = { family: { familyName: 'A' } };
    const remote = { family: { familyName: 'B', flexDay: 5 } };
    expect(mergeWorkspace(base, local, remote).family).toEqual({ familyName: 'B' });
  });

  it('a curriculum edited on both devices merges per student', () => {
    const c = { id: 'c1', name: 'Math', progress: { a: 3, b: 3 } };
    const merged = mergeWorkspace({ curricula: [c] }, { curricula: [{ ...c, progress: { a: 4, b: 3 } }] }, { curricula: [{ ...c, name: 'Math 4', progress: { a: 3, b: 5 } }] });
    expect(merged.curricula).toEqual([{ id: 'c1', name: 'Math 4', progress: { a: 4, b: 5 } }]);
  });

  it('the same new record from both devices (first sync) merges into one', () => {
    const merged = mergeWorkspace({}, { children: [{ id: 'k', name: 'Leo', sparks: 10 }] }, { children: [{ id: 'k', name: 'Leo', sparks: 20 }] });
    expect(merged.children).toEqual([{ id: 'k', name: 'Leo', sparks: 10 }]);
  });

  it('knows when there is something to push', () => {
    expect(hasLocalChanges({ a: [1] }, { a: [1] })).toBe(false);
    expect(hasLocalChanges({ a: [1] }, { a: [1, 2] })).toBe(true);
  });
});

describe('lesson-by-lesson plans on the schedule', () => {
  const outline = [{ id: 'u', title: 'Pond', lessons: [{ ...newLesson('Frogs', { pages: '4–6', questions: ['Q1', 'Q2'] }), id: 'l1' }, { ...newLesson('Toads', { steps: ['Look', 'Draw'], minutes: 40 }), id: 'l2' }, { ...newLesson('Newts'), id: 'l3' }] }];
  const cur: Curriculum = { id: 'c1', name: 'Pond Life', subject: 'science', childIds: ['a', 'b'], totalLessons: 3, lessonsDone: 0, progress: { a: 0, b: 1 }, startDate: addDays(today, -10), targetEndDate: addDays(today, 100), schoolDays: [1, 2, 3, 4, 5], model: 'modular', outline };
  const task = (p: Partial<Task>): Task => ({ id: 't', childId: 'a', date: today, title: 'Pond Life', subject: 'science', mode: 'solo', start: '09:00', durationMin: 30, icon: '🐸', steps: [], status: 'todo', curriculumId: 'c1', ...p });

  it('fills each kid’s task with their next lesson, and leaves started tasks alone', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b', childId: 'b' }), task({ id: 'started', childId: 'a', date: today, start: '10:00', steps: [{ id: 's', label: 'Mine', done: true }] })];
    const out = withLessons(tasks, [cur], today);
    expect(out[0]).toMatchObject({ lessonId: 'l1' });
    expect(out[0].steps.map((s) => s.label)).toEqual(['Read pages 4–6', 'Answer the 2 questions']);
    expect(out[1]).toMatchObject({ lessonId: 'l2', durationMin: 40 });
    expect(out[2]).toBe(tasks[2]);
    expect(withLessons(out, [cur], today)).toBe(out); // nothing more to do
  });

  it('only fills the given date, and later open lessons count forward', () => {
    const tomorrow = task({ id: 'tmr', date: addDays(today, 1) });
    const out = withLessons([task({ id: 'a' }), tomorrow], [cur], addDays(today, 1));
    expect(out[0].lessonId).toBeUndefined();
    expect(out[1].lessonId).toBe('l2');
    // A past, unfinished lesson doesn't push today's number forward.
    expect(lessonNumber(task({ id: 'now' }), cur, [task({ id: 'old', date: addDays(today, -1) })])).toBe(1);
  });

  it('builds a checklist from links and pages when a lesson has no steps', () => {
    expect(stepsForLesson({ ...newLesson('x'), links: [{ label: 'Video', url: 'https://e.x' }] })).toEqual(['Open “Video”']);
    expect(stepsForLesson({ ...newLesson('x'), links: [{ label: 'A', url: 'https://a' }, { label: 'B', url: 'https://b' }], questions: ['q'] })).toEqual(['Open the lesson links', 'Answer the question']);
    expect(stepsForLesson(newLesson('x'))).toEqual([]);
  });

  it('switching a kid’s version refills only their unstarted lessons', () => {
    const tasks = [task({ id: 'a', lessonId: 'l1' }), task({ id: 'b', childId: 'b', lessonId: 'l2' }), task({ id: 'a-done', status: 'done', lessonId: 'l1' })];
    const r = setVersionPick(cur, tasks, 'a', { level: 'harder', theme: '' });
    expect(r.curriculum.versionPicks).toEqual({ a: { level: 'harder' } });
    expect(r.tasks.map((x) => x.lessonId)).toEqual([undefined, 'l2', 'l1']);
  });

  it('an update that removes every lesson someone finished keeps their count (capped)', () => {
    const next = [{ id: 'u2', title: 'New', lessons: [{ ...newLesson('Only'), id: 'n1' }] }];
    expect(remapDone(outline, next, 2)).toEqual({ done: 1, skippedNew: [] });
    const r = applyPlanUpdate(cur, [task({ id: 'sk', status: 'skipped', lessonId: 'l1', lessonNo: 1 })], { units: [], version: 9 } as never);
    expect(r.curriculum.totalLessons).toBe(1); // never zero lessons
    expect(r.tasks[0]).toMatchObject({ lessonNo: 1 });
  });
});
