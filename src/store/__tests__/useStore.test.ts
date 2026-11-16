import { beforeEach, describe, expect, it, vi } from 'vitest';

import { doneFor } from '@/lib/curriculum';
import { addDays, nextDayIn, todayKey, weekdayOf } from '@/lib/dates';
import { findParentConflicts } from '@/lib/schedule';
import type { Child, Curriculum, FamilyProfile, RhythmBlock, Task, Weekday } from '@/lib/types';
import { selectOpenHelp, useStore } from '@/store/useStore';

// The store persists to AsyncStorage; an in-memory stand-in keeps these tests in plain Node
// (vitest hoists this above the imports).
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const today = todayKey();

const family = (p: Partial<FamilyProfile> = {}): FamilyProfile => ({
  familyName: 'Test Crew', parentName: 'Pat Test', parentPin: '4321', stateCode: 'CO', zip: '80202', values: [], interests: [],
  schoolYearStart: addDays(today, -60), schoolYearEnd: addDays(today, 200), schoolDays: [1, 2, 3, 4, 5], createdAt: `${addDays(today, -30)}T09:00:00.000Z`, ...p,
});
const kid = (id: string, p: Partial<Child> = {}): Child => ({
  id, name: id, birthdate: '2016-04-01', grade: '4th', avatar: '🦊', color: '#000', learningDifferences: [], passions: [], soloToleranceMin: 20, sparks: 0, ...p,
});
const block = (p: Partial<RhythmBlock> & Pick<RhythmBlock, 'id'>): RhythmBlock => ({
  title: p.id, subject: 'math', childIds: ['a'], mode: 'solo', start: '09:00', durationMin: 30, days: ALL_DAYS, icon: '⭐', steps: ['one', 'two'], ...p,
});
const cur = (p: Partial<Curriculum> = {}): Curriculum => ({
  id: 'c1', name: 'Math', subject: 'math', childIds: ['a', 'b'], totalLessons: 10, lessonsDone: 2, startDate: addDays(today, -60), targetEndDate: addDays(today, 200), schoolDays: [1, 2, 3, 4, 5], model: 'turnkey', ...p,
});

const S = () => useStore.getState();
const tasksOn = (date: string, childId?: string) => S().tasks.filter((t) => t.date === date && (!childId || t.childId === childId));
const setup = (p: { blocks?: RhythmBlock[]; curricula?: Curriculum[]; tasks?: Task[]; family?: Partial<FamilyProfile> } = {}) =>
  S().completeOnboarding({ family: family(p.family), children: [kid('a'), kid('b', { pin: '1111' })], blocks: p.blocks ?? [], curricula: p.curricula ?? [], tasks: p.tasks ?? [] });

beforeEach(() => {
  S().resetAll();
});

describe('onboarding + rhythm materialization', () => {
  it('completeOnboarding stores the family, starts in parent mode, and pre-fills the NOI', () => {
    setup();
    expect(S().family?.familyName).toBe('Test Crew');
    expect(S().mode).toEqual({ kind: 'parent' });
    expect(S().noi.parentName).toBe('Pat Test');
    expect(S().noi.signature).toBe('');
  });

  it('ensureTasks fills a day once from the rhythm, and is idempotent', () => {
    setup({ blocks: [block({ id: 'b1' }), block({ id: 'g', mode: 'group', childIds: ['a', 'b'], start: '10:00' })] });
    S().ensureTasks(today);
    expect(tasksOn(today)).toHaveLength(3);
    S().ensureTasks(today);
    expect(tasksOn(today)).toHaveLength(3);
    const group = tasksOn(today).filter((t) => t.blockId === 'g');
    expect(new Set(group.map((t) => t.groupKey)).size).toBe(1);
  });

  it('editing a block re-plans today and later, but keeps started, finished, past and bumped work', () => {
    setup({ blocks: [block({ id: 'b1' })] });
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    S().ensureTasks(yesterday);
    S().ensureTasks(today);
    S().ensureTasks(tomorrow);
    const todays = tasksOn(today, 'a')[0];
    S().startTask(todays.id);
    S().upsertBlock(block({ id: 'b1', title: 'Renamed', start: '11:00' }));
    expect(tasksOn(yesterday, 'a')[0].title).toBe('b1'); // the past is history
    expect(tasksOn(today, 'a')[0]).toMatchObject({ id: todays.id, title: 'b1' }); // in progress: kept
    expect(tasksOn(tomorrow, 'a')).toHaveLength(0); // untouched: re-planned on demand
    S().ensureTasks(tomorrow);
    expect(tasksOn(tomorrow, 'a')[0]).toMatchObject({ title: 'Renamed', start: '11:00' });
  });

  it('removing a block drops its unstarted future tasks only', () => {
    setup({ blocks: [block({ id: 'b1', childIds: ['a', 'b'] })] });
    S().ensureTasks(addDays(today, -1));
    S().ensureTasks(today);
    const done = tasksOn(today, 'b')[0];
    S().completeTask(done.id);
    S().removeBlock('b1');
    expect(S().blocks).toEqual([]);
    expect(tasksOn(today).map((t) => t.id)).toEqual([done.id]);
    expect(tasksOn(addDays(today, -1))).toHaveLength(2);
  });

  it('addTask creates a one-off todo task with fresh steps', () => {
    setup();
    S().addTask({ childId: 'a', date: today, title: 'Dentist worksheet', subject: 'health', mode: 'solo', start: '13:00', durationMin: 15, icon: '🦷', steps: ['Read', 'Draw'] });
    const t = tasksOn(today, 'a')[0];
    expect(t).toMatchObject({ status: 'todo', title: 'Dentist worksheet' });
    expect(t.steps.map((s) => [s.label, s.done])).toEqual([['Read', false], ['Draw', false]]);
  });
});

describe('kid missions: steps, completion, sparks and lessons', () => {
  const withMath = () => setup({ blocks: [block({ id: 'b1', curriculumId: 'c1' })], curricula: [cur()] });

  it('ticking a step starts the task; startTask never un-finishes one', () => {
    withMath();
    S().ensureTasks(today);
    const t = tasksOn(today, 'a')[0];
    S().toggleStep(t.id, t.steps[0].id);
    expect(tasksOn(today, 'a')[0]).toMatchObject({ status: 'in_progress' });
    expect(tasksOn(today, 'a')[0].steps[0].done).toBe(true);
    S().toggleStep(t.id, t.steps[0].id);
    expect(tasksOn(today, 'a')[0].steps[0].done).toBe(false);
    S().completeTask(t.id);
    S().startTask(t.id);
    expect(tasksOn(today, 'a')[0].status).toBe('done');
  });

  it('completing awards sparks (+5 for a reflection), records the lesson, and moves only that kid forward', () => {
    withMath();
    S().ensureTasks(today);
    const [a] = tasksOn(today, 'a');
    S().completeTask(a.id, { minutesSpent: 42, selfAssessment: 1, reflection: 'Carrying is tricky' });
    const done = tasksOn(today, 'a')[0];
    expect(done).toMatchObject({ status: 'done', minutesSpent: 42, selfAssessment: 1, reflection: 'Carrying is tricky', lessonNo: 3 });
    expect(done.completedAt).toBeTruthy();
    expect(done.steps.every((s) => s.done)).toBe(true);
    expect(S().children.find((k) => k.id === 'a')!.sparks).toBe(15);
    expect(S().children.find((k) => k.id === 'b')!.sparks).toBe(0);
    const c = S().curricula[0];
    expect([doneFor(c, 'a'), doneFor(c, 'b')]).toEqual([3, 2]);
  });

  it('completing twice is a no-op (no double sparks or lessons)', () => {
    withMath();
    S().ensureTasks(today);
    const [a] = tasksOn(today, 'a');
    S().completeTask(a.id);
    S().completeTask(a.id);
    expect(S().children.find((k) => k.id === 'a')!.sparks).toBe(10);
    expect(doneFor(S().curricula[0], 'a')).toBe(3);
  });

  it('never counts past the last lesson', () => {
    setup({ blocks: [block({ id: 'b1', curriculumId: 'c1' })], curricula: [cur({ totalLessons: 3, progress: { a: 3 } })] });
    S().ensureTasks(today);
    S().completeTask(tasksOn(today, 'a')[0].id);
    expect(doneFor(S().curricula[0], 'a')).toBe(3);
    expect(tasksOn(today, 'a')[0].lessonNo).toBe(3);
  });

  it('reopening takes the base sparks and the lesson back', () => {
    withMath();
    S().ensureTasks(today);
    const [a] = tasksOn(today, 'a');
    S().completeTask(a.id);
    S().reopenTask(a.id);
    expect(tasksOn(today, 'a')[0]).toMatchObject({ status: 'in_progress', completedAt: undefined, lessonNo: undefined });
    expect(S().children.find((k) => k.id === 'a')!.sparks).toBe(0);
    expect(doneFor(S().curricula[0], 'a')).toBe(2);
    S().reopenTask(a.id); // not done any more: nothing happens
    expect(doneFor(S().curricula[0], 'a')).toBe(2);
  });

  it('sparks never go negative when reopening', () => {
    withMath();
    S().ensureTasks(today);
    const [a] = tasksOn(today, 'a');
    S().completeTask(a.id);
    S().upsertChild({ ...S().children.find((k) => k.id === 'a')!, sparks: 3 });
    S().reopenTask(a.id);
    expect(S().children.find((k) => k.id === 'a')!.sparks).toBe(0);
  });

  it('a mood check-in is one per kid per day', () => {
    setup();
    S().setMood({ childId: 'a', date: today, mood: 2 });
    S().setMood({ childId: 'a', date: today, mood: 5 });
    S().setMood({ childId: 'b', date: today, mood: 3 });
    expect(S().moods).toHaveLength(2);
    expect(S().moods.find((m) => m.childId === 'a')!.mood).toBe(5);
  });
});

describe('help queue', () => {
  it('keeps one open request per kid, oldest first, and resolves it', () => {
    setup({ blocks: [block({ id: 'b1' })] });
    S().ensureTasks(today);
    const [a] = tasksOn(today, 'a');
    S().requestHelp('a', a.id, 'Stuck on #4');
    S().requestHelp('a', undefined, 'again!');
    S().requestHelp('b');
    const open = selectOpenHelp(S());
    expect(open.map((h) => h.childId)).toEqual(['a', 'b']);
    expect(open[0].note).toBe('Stuck on #4');
    S().resolveHelp(open[1].id);
    expect(selectOpenHelp(S()).map((h) => h.childId)).toEqual(['a']);
    // Once resolved, the kid can ask again.
    S().requestHelp('b', undefined, 'new question');
    expect(selectOpenHelp(S())).toHaveLength(2);
  });

  it('finishing the task a kid asked about closes their request', () => {
    setup({ blocks: [block({ id: 'b1' }), block({ id: 'b2', start: '10:00' })] });
    S().ensureTasks(today);
    const [first, second] = tasksOn(today, 'a').sort((x, y) => x.start.localeCompare(y.start));
    S().requestHelp('a', first.id);
    S().completeTask(second.id);
    expect(selectOpenHelp(S())).toHaveLength(1);
    S().completeTask(first.id);
    expect(selectOpenHelp(S())).toHaveLength(0);
  });
});

describe('working ahead (start early)', () => {
  it('moves an upcoming mission to today, keeps the planned day, and the rhythm does not recreate it', () => {
    setup({ blocks: [block({ id: 'b1', childIds: ['a', 'b'] })] });
    const later = addDays(today, 2);
    S().ensureTasks(later);
    const t = tasksOn(later, 'a')[0];
    S().startEarly(t.id);
    const moved = S().tasks.find((x) => x.id === t.id)!;
    expect(moved).toMatchObject({ date: today, status: 'in_progress', bumpedFrom: later });
    expect(moved.start).toMatch(/^\d{2}:\d[05]$/); // rounded to 5 minutes
    S().ensureTasks(later);
    expect(tasksOn(later, 'a')).toHaveLength(0);
    expect(tasksOn(later, 'b')).toHaveLength(1);
    // Finishing it today counts today's hours.
    S().completeTask(t.id);
    expect(S().tasks.find((x) => x.id === t.id)!.date).toBe(today);
  });

  it('C-12: family sessions and 1-on-1s stay on their day (only solo missions start early)', () => {
    setup({ blocks: [block({ id: 'g', mode: 'group', childIds: ['a', 'b'] }), block({ id: 'p', mode: 'parent', childIds: ['b'], start: '11:00' })] });
    const later = addDays(today, 3);
    S().ensureTasks(later);
    const before = JSON.stringify(S().tasks);
    for (const t of tasksOn(later)) S().startEarly(t.id);
    expect(JSON.stringify(S().tasks)).toBe(before);
    expect(findParentConflicts(tasksOn(later))).toEqual([]);
  });

  it('C-12: the parent can turn starting early off, and an early start is recorded for their notification', () => {
    setup({ blocks: [block({ id: 'b1' })], family: { kidsStartEarly: false } });
    const later = addDays(today, 1);
    S().ensureTasks(later);
    const t = tasksOn(later, 'a')[0];
    S().startEarly(t.id);
    expect(S().tasks.find((x) => x.id === t.id)!.date).toBe(later);
    S().updateFamily({ kidsStartEarly: true });
    S().startEarly(t.id);
    const moved = S().tasks.find((x) => x.id === t.id)!;
    expect(moved.date).toBe(today);
    expect(Date.parse(moved.startedEarlyAt!)).toBeGreaterThan(Date.now() - 5000);
  });

  it('refuses to "start early" today or past tasks', () => {
    setup({ blocks: [block({ id: 'b1' })] });
    S().ensureTasks(today);
    S().ensureTasks(addDays(today, -1));
    const before = JSON.stringify(S().tasks);
    S().startEarly(tasksOn(today, 'a')[0].id);
    S().startEarly(tasksOn(addDays(today, -1), 'a')[0].id);
    S().startEarly('nope');
    expect(JSON.stringify(S().tasks)).toBe(before);
  });
});

describe('Flight Deck: stagger and bump through the store', () => {
  it('staggerDay clears parent conflicts on that day only', () => {
    const blocks = [block({ id: 'p1', mode: 'parent', childIds: ['a'] }), block({ id: 'p2', mode: 'parent', childIds: ['b'] })];
    setup({ blocks });
    const tomorrow = addDays(today, 1);
    S().ensureTasks(today);
    S().ensureTasks(tomorrow);
    expect(findParentConflicts(tasksOn(today))).toHaveLength(1);
    expect(S().staggerDay(today)).toBe(1);
    expect(findParentConflicts(tasksOn(today))).toEqual([]);
    expect(findParentConflicts(tasksOn(tomorrow))).toHaveLength(1);
    expect(S().staggerDay(today)).toBe(0);
  });

  it('bumpDay plans the target day first, so bumped work lands after it and is not duplicated', () => {
    setup({ blocks: [block({ id: 'b1', childIds: ['a'] })] });
    const target = addDays(today, 1);
    S().ensureTasks(today);
    expect(S().bumpDay(today, target)).toBe(1);
    const there = tasksOn(target, 'a').sort((x, y) => x.start.localeCompare(y.start));
    expect(there).toHaveLength(2);
    expect(there[0].bumpedFrom).toBeUndefined();
    expect(there[1]).toMatchObject({ bumpedFrom: today, start: '09:30', status: 'todo' });
    // Today's rhythm doesn't come back.
    S().ensureTasks(today);
    expect(tasksOn(today)).toHaveLength(0);
    expect(S().bumpDay(today, target)).toBe(0);
  });

  it('bumps only one child when asked', () => {
    setup({ blocks: [block({ id: 'b1', childIds: ['a', 'b'] })] });
    S().ensureTasks(today);
    expect(S().bumpDay(today, addDays(today, 1), { childId: 'b' })).toBe(1);
    expect(tasksOn(today).map((t) => t.childId)).toEqual(['a']);
  });
});

describe('curriculum progress actions', () => {
  it('adjustLessons nudges one student or everyone, clamped', () => {
    setup({ curricula: [cur()] });
    S().adjustLessons('c1', 1, 'a');
    expect([doneFor(S().curricula[0], 'a'), doneFor(S().curricula[0], 'b')]).toEqual([3, 2]);
    S().adjustLessons('c1', -5);
    expect([doneFor(S().curricula[0], 'a'), doneFor(S().curricula[0], 'b')]).toEqual([0, 0]);
    S().adjustLessons('c1', 99, 'b');
    expect(doneFor(S().curricula[0], 'b')).toBe(10);
  });

  it('updatePlan ignores empty outlines and unknown plans; skipPlanUpdate remembers the version', () => {
    setup({ curricula: [cur({ outline: [{ id: 'u', title: 'U', lessons: [{ id: 'l1', title: 'One', steps: [], links: [], questions: [] }] }] })] });
    const before = S().curricula[0];
    S().updatePlan('c1', { units: [], version: 2 } as never);
    S().updatePlan('missing', { units: before.outline!, version: 2 } as never);
    expect(S().curricula[0]).toBe(before);
    S().skipPlanUpdate('c1', '2');
    expect(S().curricula[0].skippedUpdate).toBe('2');
    S().updatePlan('c1', { units: [{ id: 'u', title: 'U', lessons: [{ id: 'l1', title: 'One', steps: [], links: [], questions: [] }, { id: 'l2', title: 'Two', steps: [], links: [], questions: [] }] }], version: 3 } as never);
    expect(S().curricula[0]).toMatchObject({ totalLessons: 2, packageVersion: 3, skippedUpdate: undefined });
  });

  it('lesson materials can be added, renamed and removed', () => {
    setup({ curricula: [cur()] });
    S().addMaterial('c1', { id: 'm1', label: 'Videos', url: 'https://example.com' });
    S().updateMaterial('c1', 'm1', { label: 'Lesson videos' });
    expect(S().curricula[0].materials).toEqual([{ id: 'm1', label: 'Lesson videos', url: 'https://example.com' }]);
    S().removeMaterial('c1', 'm1');
    expect(S().curricula[0].materials).toEqual([]);
  });
});

describe('records', () => {
  it('evidence and hours logs are newest-first and removable', () => {
    setup();
    S().addHoursLog({ childId: 'a', date: today, subject: 'pe', minutes: 30 });
    S().addHoursLog({ childId: 'a', date: today, subject: 'music', minutes: 45 });
    expect(S().hoursLogs.map((l) => l.subject)).toEqual(['music', 'pe']);
    S().removeHoursLog(S().hoursLogs[0].id);
    expect(S().hoursLogs.map((l) => l.subject)).toEqual(['pe']);
    S().addEvidence({ childId: 'a', date: today, subject: 'art', uri: 'file://x.png', note: 'Painting' });
    expect(S().evidence[0]).toMatchObject({ note: 'Painting' });
    S().removeEvidence(S().evidence[0].id);
    expect(S().evidence).toEqual([]);
  });

  it('expenses upsert in place, and paid purchases land in the tracker', () => {
    setup();
    const e = { id: 'x1', date: today, vendor: 'Rainbow', description: 'Books', amount: 25, category: 'curriculum' as const, fundingSource: 'esa' as const, approvedVendor: true };
    S().upsertExpense(e);
    S().upsertExpense({ ...e, amount: 30 });
    expect(S().expenses).toHaveLength(1);
    expect(S().expenses[0].amount).toBe(30);
    S().recordPurchase({ id: 'p1', listingId: 'l1', title: 'Pond Life', seller: 'Creator', price: 12, fundingSource: 'tax', esaEligible: false, purchasedAt: `${today}T10:00:00Z` } as never);
    S().recordPurchase({ id: 'p2', listingId: 'l2', title: 'Free thing', seller: 'Library', price: 0, fundingSource: 'out_of_pocket', esaEligible: false, purchasedAt: `${today}T10:00:00Z` } as never);
    expect(S().expenses.map((x) => [x.description, x.amount, x.fundingSource])).toEqual([['Pond Life', 12, 'tax'], ['Books', 30, 'esa']]);
    S().removeExpense('x1');
    expect(S().expenses).toHaveLength(1);
    S().setEsaAward(7000);
    expect(S().esaAnnualAward).toBe(7000);
  });

  it('the NOI draft merges edits', () => {
    setup();
    S().updateNoi({ district: 'Denver PS' });
    S().updateNoi({ checklist: { signed: true } });
    expect(S().noi).toMatchObject({ district: 'Denver PS', parentName: 'Pat Test', checklist: { signed: true } });
  });
});

describe('settings: children', () => {
  it('upsertChild edits in place or adds', () => {
    setup();
    S().upsertChild({ ...S().children[0], name: 'Ada' });
    S().upsertChild(kid('c'));
    expect(S().children.map((k) => k.name)).toEqual(['Ada', 'b', 'c']);
  });

  it('removing a child cleans up their tasks, blocks, help requests and curriculum seats but keeps records', () => {
    setup({ blocks: [block({ id: 'solo-a', childIds: ['a'] }), block({ id: 'g', mode: 'group', childIds: ['a', 'b'] })], curricula: [cur({ progress: { a: 4, b: 2 } }), cur({ id: 'c2', childIds: ['a'] })] });
    S().ensureTasks(today);
    S().requestHelp('a', undefined, 'help');
    S().setMood({ childId: 'a', date: today, mood: 4 });
    S().addHoursLog({ childId: 'a', date: today, subject: 'pe', minutes: 30 });
    S().addEvidence({ childId: 'a', date: today, subject: 'art', uri: 'x', note: 'n' });
    S().removeChild('a');
    expect(S().children.map((k) => k.id)).toEqual(['b']);
    expect(S().tasks.every((t) => t.childId === 'b')).toBe(true);
    expect(S().blocks.map((b) => [b.id, b.childIds])).toEqual([['g', ['b']]]);
    // Regression: an open help request from a removed child stayed in the parent's queue forever.
    expect(selectOpenHelp(S())).toEqual([]);
    expect(S().moods).toEqual([]);
    expect(S().curricula.map((c) => [c.id, c.childIds, c.progress ?? {}])).toEqual([['c1', ['b'], { b: 2 }], ['c2', [], {}]]);
    // Records the state may ask for are kept.
    expect(S().hoursLogs).toHaveLength(1);
    expect(S().evidence).toHaveLength(1);
  });
});

describe('backups', () => {
  it('exports everything but the hydration flag and imports it back into parent mode', () => {
    setup({ blocks: [block({ id: 'b1', childIds: ['a', 'b'] })] });
    S().ensureTasks(today);
    S().setMode({ kind: 'kid', childId: 'a' });
    const json = S().exportData();
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({ app: 'freerange', version: 1 });
    expect(parsed.data.hydrated).toBeUndefined();
    expect(parsed.data.completeTask).toBeUndefined();
    S().resetAll();
    expect(S().family).toBeUndefined();
    S().importData(json);
    expect(S().family?.familyName).toBe('Test Crew');
    expect(S().tasks).toHaveLength(2);
    expect(S().mode).toEqual({ kind: 'parent' });
  });

  it('fills in fields an older backup did not have', () => {
    S().importData(JSON.stringify({ app: 'freerange', version: 1, data: { family: family(), children: [kid('a')] } }));
    expect(S().family?.familyName).toBe('Test Crew');
    expect(S().tasks).toEqual([]);
    expect(S().followedCreators).toEqual([]);
    expect(S().noi.checklist).toEqual({});
  });

  it('rejects files that are not Freerange backups and leaves the data alone', () => {
    setup();
    for (const bad of ['not json at all', '{}', '{"app":"other","data":{}}', '{"app":"freerange"}', '{"app":"freerange","data":{"tasks":"oops"}}', '{"app":"freerange","data":{"children":{}}}', '{"app":"freerange","data":{"family":"x"}}']) {
      expect(() => S().importData(bad), bad).toThrow(/Freerange backup/);
    }
    expect(S().family?.familyName).toBe('Test Crew');
  });

  it('resetAll returns to an empty device', () => {
    setup({ blocks: [block({ id: 'b1' })] });
    S().resetAll();
    expect(S().family).toBeUndefined();
    expect(S().blocks).toEqual([]);
    expect(S().coops.length).toBeGreaterThan(0); // the sample community is back
  });
});

describe('school days', () => {
  it('next school day from a Friday is the following Monday for a weekday family', () => {
    const friday = nextDayIn(today, [5])!;
    expect(weekdayOf(nextDayIn(friday, [1, 2, 3, 4, 5])!)).toBe(1);
  });
});

describe('C-03: the mission timer lives on the task', () => {
  it('keeps counting while the kid is elsewhere, pauses, and logs its real minutes', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(`${today}T10:00:00`));
      setup({ blocks: [block({ id: 'b1', durationMin: 30 })] });
      S().ensureTasks(today);
      const t = tasksOn(today, 'a')[0];
      S().startTaskTimer(t.id);
      expect(S().tasks.find((x) => x.id === t.id)!.status).toBe('in_progress');
      // 12 minutes later (the screen was closed the whole time), pause.
      vi.setSystemTime(new Date(`${today}T10:12:00`));
      S().pauseTaskTimer(t.id);
      expect(S().tasks.find((x) => x.id === t.id)!.timer).toEqual({ mode: 'stopwatch', pausedMs: 12 * 60000 });
      // Paused time doesn't count; resume for 3 more minutes, then finish.
      vi.setSystemTime(new Date(`${today}T10:40:00`));
      S().startTaskTimer(t.id);
      vi.setSystemTime(new Date(`${today}T10:43:00`));
      S().completeTask(t.id);
      const done = S().tasks.find((x) => x.id === t.id)!;
      expect(done.minutesSpent).toBe(15);
      expect(done.timer?.startedAt).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('switching to a Pomodoro starts over, and a task that never timed falls back to its plan', () => {
    setup({ blocks: [block({ id: 'b1', durationMin: 30 })] });
    S().ensureTasks(today);
    const [t] = tasksOn(today, 'a');
    S().startTaskTimer(t.id);
    S().setTimerMode(t.id, 'pomodoro');
    expect(S().tasks.find((x) => x.id === t.id)!.timer).toEqual({ mode: 'pomodoro', pausedMs: 0 });
    S().completeTask(t.id);
    expect(S().tasks.find((x) => x.id === t.id)!.minutesSpent).toBeUndefined();
  });
});

describe('C-13: "I figured it out"', () => {
  it('withdraws the open request, so the queue has nothing stale', () => {
    setup();
    S().requestHelp('a');
    expect(selectOpenHelp(S())).toHaveLength(1);
    S().withdrawHelp('a');
    expect(selectOpenHelp(S())).toHaveLength(0);
    expect(S().help[0]).toMatchObject({ withdrawn: true });
    // They can ask again later.
    S().requestHelp('a');
    expect(selectOpenHelp(S())).toHaveLength(1);
  });
});
