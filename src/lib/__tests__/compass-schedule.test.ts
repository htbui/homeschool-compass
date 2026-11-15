import { describe, expect, it } from 'vitest';

import {
  addDays,
  ageOn,
  diffDays,
  formatClock,
  fromDateKey,
  fromMinutes,
  isDateKey,
  nextDayIn,
  relativeDayLabel,
  schoolDatesBetween,
  schoolYearLabel,
  stepDay,
  toDateKey,
  todayKey,
  toMinutes,
  weekdayOf,
} from '../dates';
import { pacing } from '../pacing';
import {
  autoStagger,
  bumpTargets,
  findParentConflicts,
  findRhythmConflicts,
  gentleBump,
  needsParent,
  suggestWhileWaiting,
  tasksForDate,
  timelineByChild,
} from '../schedule';
import type { Curriculum, RhythmBlock, Task, Weekday } from '../types';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const today = todayKey();
/** The next date (after today) on this weekday — tests never depend on what day it is today. */
const next = (wd: Weekday, from = today) => nextDayIn(from, [wd])!;
const monday = next(1);
const tuesday = addDays(monday, 1);
const friday = addDays(monday, 4);

const task = (p: Partial<Task> & Pick<Task, 'id'>): Task => ({
  childId: 'a', date: monday, title: p.id, subject: 'math', mode: 'solo', start: '09:00', durationMin: 30, icon: '⭐', steps: [], status: 'todo', ...p,
});
const block = (p: Partial<RhythmBlock> & Pick<RhythmBlock, 'id'>): RhythmBlock => ({
  title: p.id, subject: 'math', childIds: ['a'], mode: 'solo', start: '09:00', durationMin: 30, days: WEEKDAYS, icon: '⭐', steps: [], ...p,
});
/** No child is ever in two places at once. */
const childOverlaps = (tasks: Task[]) => {
  const out: string[] = [];
  for (const kid of new Set(tasks.map((t) => t.childId))) {
    const mine = tasks.filter((t) => t.childId === kid && t.status !== 'skipped').sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
    for (let i = 1; i < mine.length; i++) if (toMinutes(mine[i].start) < toMinutes(mine[i - 1].start) + mine[i - 1].durationMin) out.push(`${mine[i - 1].id}/${mine[i].id}`);
  }
  return out;
};

describe('dates', () => {
  it('round-trips date keys, including leap days and month ends', () => {
    for (const k of ['2028-02-29', '2026-12-31', '2027-01-01', '2026-03-08', '2026-11-01']) expect(toDateKey(fromDateKey(k))).toBe(k);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('counts days exactly across daylight-saving changes', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(diffDays('2026-11-02', '2026-10-31')).toBe(-2);
  });

  it('converts and clamps clock times', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(fromMinutes(570)).toBe('09:30');
    expect(fromMinutes(-20)).toBe('00:00');
    expect(fromMinutes(24 * 60 + 30)).toBe('23:59');
    expect(fromMinutes(569.6)).toBe('09:30');
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
    expect(formatClock('13:45')).toBe('1:45 PM');
  });

  it('computes age on birthdays and leap days', () => {
    expect(ageOn('2016-05-21', '2026-05-20')).toBe(9);
    expect(ageOn('2016-05-21', '2026-05-21')).toBe(10);
    expect(ageOn('2016-02-29', '2026-02-28')).toBe(9);
    expect(ageOn('2016-02-29', '2026-03-01')).toBe(10);
  });

  it('labels the school year from July', () => {
    expect(schoolYearLabel('2026-06-30')).toBe('2025–2026');
    expect(schoolYearLabel('2026-07-01')).toBe('2026–2027');
    expect(schoolYearLabel('2027-01-15')).toBe('2026–2027');
  });

  it('finds school days and handles empty or impossible inputs', () => {
    expect(weekdayOf(next(3))).toBe(3);
    expect(nextDayIn(friday, WEEKDAYS)).toBe(addDays(friday, 3));
    expect(nextDayIn(monday, [])).toBeUndefined();
    expect(schoolDatesBetween(monday, addDays(monday, 13), WEEKDAYS)).toHaveLength(10);
    expect(schoolDatesBetween(monday, addDays(monday, 6), WEEKDAYS, new Set([tuesday]))).toHaveLength(4);
    expect(schoolDatesBetween(friday, monday, WEEKDAYS)).toEqual([]);
    expect(stepDay(monday, 1, () => false, 3)).toBeUndefined();
  });

  it('only accepts real dates as keys', () => {
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-1-01')).toBe(false);
    expect(isDateKey('2026-11-15T00:00')).toBe(false);
    expect(isDateKey(20261115)).toBe(false);
    expect(relativeDayLabel(today, today)).toBe('Today');
  });
});

describe('parent conflicts', () => {
  it('ignores solo work, back-to-back blocks and skipped tasks', () => {
    const tasks = [
      task({ id: 'p1', mode: 'parent', start: '09:00' }),
      task({ id: 'p2', childId: 'b', mode: 'parent', start: '09:30' }),
      task({ id: 's', childId: 'c', mode: 'solo', start: '09:00' }),
      task({ id: 'skip', childId: 'c', mode: 'parent', start: '09:10', status: 'skipped' }),
    ];
    expect(findParentConflicts(tasks)).toEqual([]);
  });

  it('flags every overlapping pair, a group block against a 1-on-1, and done work too', () => {
    const tasks = [
      task({ id: 'p1', mode: 'parent', start: '09:00', durationMin: 60 }),
      task({ id: 'p2', childId: 'b', mode: 'parent', start: '09:15', status: 'done' }),
      task({ id: 'g-a', childId: 'a', mode: 'group', start: '09:40', groupKey: 'g' }),
      task({ id: 'g-b', childId: 'b', mode: 'group', start: '09:40', groupKey: 'g' }),
    ];
    const pairs = findParentConflicts(tasks).map((c) => [c.a.id, c.b.id, c.overlapMin]);
    expect(pairs).toEqual([['p1', 'p2', 30], ['p1', 'g-a', 20], ['p2', 'g-a', 5]]);
    expect(needsParent({ mode: 'group' })).toBe(true);
    expect(needsParent({ mode: 'solo' })).toBe(false);
  });

  it('checks the weekly rhythm per weekday', () => {
    const blocks = [
      block({ id: 'mwf', mode: 'parent', days: [1, 3, 5] }),
      block({ id: 'tth', mode: 'parent', childIds: ['b'], days: [2, 4] }),
      block({ id: 'fri', mode: 'group', childIds: ['a', 'b'], days: [5], start: '09:15' }),
      block({ id: 'solo', mode: 'solo', childIds: ['b'], days: [1] }),
    ];
    expect(findRhythmConflicts(blocks).map((c) => [c.day, c.a.id, c.b.id])).toEqual([[5, 'mwf', 'fri']]);
  });
});

describe('auto-stagger', () => {
  it('slides a 1-on-1 past finished parent work and never moves done tasks', () => {
    const tasks = [
      task({ id: 'done', mode: 'parent', start: '09:00', status: 'done' }),
      task({ id: 'next', childId: 'b', mode: 'parent', start: '09:10' }),
    ];
    const { tasks: out, moves } = autoStagger(tasks);
    expect(out.find((t) => t.id === 'done')!.start).toBe('09:00');
    expect(out.find((t) => t.id === 'next')!.start).toBe('09:30');
    expect(moves).toEqual([{ taskIds: ['next'], from: '09:10', to: '09:30' }]);
  });

  it('moves every copy of a group session together', () => {
    const tasks = [
      task({ id: 'p', mode: 'parent', start: '10:00', durationMin: 45 }),
      task({ id: 'g-a', childId: 'b', mode: 'group', start: '10:15', groupKey: 'g' }),
      task({ id: 'g-c', childId: 'c', mode: 'group', start: '10:15', groupKey: 'g' }),
    ];
    const { tasks: out, moves } = autoStagger(tasks);
    expect(out.filter((t) => t.groupKey === 'g').map((t) => t.start)).toEqual(['10:45', '10:45']);
    expect(moves[0].taskIds.sort()).toEqual(['g-a', 'g-c']);
    expect(findParentConflicts(out)).toEqual([]);
  });

  it('leaves an activity in place (and the conflict visible) when it cannot fit before the end of the day', () => {
    const tasks = [
      task({ id: 'long', mode: 'parent', start: '15:00', durationMin: 120 }),
      task({ id: 'late', childId: 'b', mode: 'parent', start: '15:30', durationMin: 60 }),
    ];
    const { tasks: out, moves } = autoStagger(tasks, '17:00');
    expect(moves).toEqual([]);
    expect(findParentConflicts(out)).toHaveLength(1);
    // With a later end of day it fits.
    expect(findParentConflicts(autoStagger(tasks, '19:00').tasks)).toEqual([]);
  });

  it('pushes the child’s own solo work out of the way, without overlapping their other tasks', () => {
    const tasks = [
      task({ id: 'p-a', mode: 'parent', start: '09:00' }),
      task({ id: 'p-b', childId: 'b', mode: 'parent', start: '09:00' }),
      task({ id: 'b-read', childId: 'b', mode: 'solo', start: '09:30' }),
      task({ id: 'b-art', childId: 'b', mode: 'solo', start: '10:00' }),
      task({ id: 'b-skip', childId: 'b', mode: 'solo', start: '09:30', status: 'skipped' }),
    ];
    const { tasks: out } = autoStagger(tasks);
    expect(findParentConflicts(out)).toEqual([]);
    expect(childOverlaps(out)).toEqual([]);
    expect(out.find((t) => t.id === 'b-skip')!.start).toBe('09:30');
  });

  it('does not mutate its input', () => {
    const tasks = [task({ id: 'x', mode: 'parent' }), task({ id: 'y', childId: 'b', mode: 'parent' })];
    const copy = JSON.parse(JSON.stringify(tasks));
    autoStagger(tasks);
    expect(tasks).toEqual(copy);
  });

  it('untangles a busy morning for three kids', () => {
    const tasks = [
      task({ id: 'leo-ph', childId: 'leo', mode: 'parent', start: '09:00' }),
      task({ id: 'leo-play', childId: 'leo', mode: 'solo', start: '09:30' }),
      task({ id: 'maya-m', childId: 'maya', mode: 'parent', start: '09:00' }),
      task({ id: 'maya-r', childId: 'maya', mode: 'solo', start: '09:30' }),
      task({ id: 'noah-lab', childId: 'noah', mode: 'parent', start: '09:15' }),
      ...['leo', 'maya', 'noah'].map((k) => task({ id: `unit-${k}`, childId: k, mode: 'group', start: '10:30', durationMin: 45, groupKey: 'unit' })),
    ];
    const { tasks: out } = autoStagger(tasks);
    expect(findParentConflicts(out)).toEqual([]);
    expect(childOverlaps(out)).toEqual([]);
  });
});

describe('rhythm → tasks', () => {
  it('only makes tasks on the block’s days, one per child, with fresh steps', () => {
    const blocks = [block({ id: 'mwf', days: [1, 3, 5], childIds: ['a', 'b'], steps: ['Warm up'], curriculumId: 'c1' })];
    expect(tasksForDate(blocks, tuesday, [])).toEqual([]);
    const made = tasksForDate(blocks, monday, []);
    expect(made.map((t) => t.childId)).toEqual(['a', 'b']);
    expect(made.every((t) => !t.groupKey && t.curriculumId === 'c1' && t.status === 'todo' && t.date === monday)).toBe(true);
    expect(made[0].steps[0].id).not.toBe(made[1].steps[0].id);
  });

  it('gives a group block one session key per date', () => {
    const blocks = [block({ id: 'g', mode: 'group', childIds: ['a', 'b'] })];
    const mon = tasksForDate(blocks, monday, []);
    const tue = tasksForDate(blocks, tuesday, []);
    expect(new Set(mon.map((t) => t.groupKey)).size).toBe(1);
    expect(mon[0].groupKey).not.toBe(tue[0].groupKey);
  });

  it('does not recreate a task that was bumped or started early from that date', () => {
    const blocks = [block({ id: 'b1', childIds: ['a', 'b'] })];
    const [a, b] = tasksForDate(blocks, monday, []);
    const moved = { ...a, date: tuesday, bumpedFrom: monday };
    expect(tasksForDate(blocks, monday, [moved, b])).toEqual([]);
    // One-off tasks (no block) never block the rhythm.
    expect(tasksForDate(blocks, monday, [task({ id: 'one-off' })])).toHaveLength(2);
  });
});

describe('gentle bump', () => {
  const day = [
    task({ id: 'done', start: '08:00', status: 'done' }),
    task({ id: 'skip', start: '08:30', status: 'skipped' }),
    task({ id: 'started', start: '09:00', status: 'in_progress' }),
    task({ id: 'later', start: '13:00' }),
    task({ id: 'b-later', childId: 'b', start: '14:00' }),
  ];

  it('moves only unfinished work, resets it to todo and remembers where it came from', () => {
    const { tasks, moved } = gentleBump(day, monday, tuesday);
    expect(moved).toBe(3);
    const by = Object.fromEntries(tasks.map((t) => [t.id, t]));
    expect(by.done.date).toBe(monday);
    expect(by.skip.date).toBe(monday);
    expect(by.started).toMatchObject({ date: tuesday, status: 'todo', bumpedFrom: monday });
    expect(childOverlaps(tasks.filter((t) => t.date === tuesday))).toEqual([]);
  });

  it('can bump only what is left from a time, or one child', () => {
    expect(gentleBump(day, monday, tuesday, { fromTime: '12:00' }).moved).toBe(2);
    expect(gentleBump(day, monday, tuesday, { childId: 'b' }).moved).toBe(1);
    expect(gentleBump(day, monday, tuesday, { fromTime: '12:00', childId: 'a' }).moved).toBe(1);
  });

  it('returns the same list when nothing needs to move', () => {
    const doneDay = [task({ id: 'x', status: 'done' })];
    const r = gentleBump(doneDay, monday, tuesday);
    expect(r.moved).toBe(0);
    expect(r.tasks).toBe(doneDay);
  });

  it('keeps the original day through a second bump, and the target day’s own work stays put', () => {
    const first = gentleBump([task({ id: 'x', start: '09:00' })], monday, tuesday).tasks;
    const withTue = [...first, task({ id: 'tue', date: tuesday, start: '09:00' })];
    const second = gentleBump(withTue, tuesday, addDays(tuesday, 1)).tasks;
    expect(second.find((t) => t.id === 'x')!.bumpedFrom).toBe(monday);
    expect(second.find((t) => t.id === 'tue')!.bumpedFrom).toBe(tuesday);
  });

  it('lands after the child’s last task on the target day, and group copies share a start', () => {
    const tasks = [
      task({ id: 'tue-a', date: tuesday, start: '09:00', durationMin: 60 }),
      task({ id: 'tue-b', childId: 'b', date: tuesday, start: '11:00', durationMin: 30 }),
      task({ id: 'g-a', mode: 'group', start: '10:00', groupKey: 'g|mon' }),
      task({ id: 'g-b', childId: 'b', mode: 'group', start: '10:00', groupKey: 'g|mon' }),
    ];
    const out = gentleBump(tasks, monday, tuesday).tasks.filter((t) => t.groupKey?.startsWith('g|mon'));
    expect(out.map((t) => t.start)).toEqual(['11:30', '11:30']);
    expect(out.every((t) => t.groupKey === `g|mon>${tuesday}`)).toBe(true);
  });
});

describe('bump targets', () => {
  it('offers the next school day and the next flex day', () => {
    expect(bumpTargets(monday, WEEKDAYS, 5)).toEqual([
      { label: 'Next school day', date: tuesday },
      { label: 'Flex / catch-up day', date: friday },
    ]);
  });

  it('uses one button when the flex day is the next school day', () => {
    expect(bumpTargets(addDays(monday, 3), WEEKDAYS, 5)).toEqual([{ label: 'Flex / catch-up day', date: friday }]);
  });

  it('a Friday bumps to Monday; a Saturday flex day is offered separately', () => {
    expect(bumpTargets(friday, WEEKDAYS, 6).map((t) => t.date)).toEqual([addDays(friday, 3), addDays(friday, 1)]);
  });

  it('with no school days there is nothing to offer unless a flex day is set', () => {
    expect(bumpTargets(monday, [])).toEqual([]);
    expect(bumpTargets(monday, [], 3)).toEqual([{ label: 'Flex / catch-up day', date: addDays(monday, 2) }]);
  });
});

describe('timeline + help queue filler', () => {
  const tasks = [
    task({ id: 'late', start: '13:00' }),
    task({ id: 'early', start: '08:00' }),
    task({ id: 'b1', childId: 'b', start: '10:00' }),
    task({ id: 'p', start: '07:00', mode: 'parent' }),
    task({ id: 'd', start: '07:30', status: 'done' }),
  ];
  it('sorts each child’s lane and includes children with nothing planned', () => {
    const lanes = timelineByChild(tasks, ['a', 'b', 'c']);
    expect(lanes.a.map((t) => t.id)).toEqual(['p', 'd', 'early', 'late']);
    expect(lanes.c).toEqual([]);
  });
  it('suggests the earliest solo todo, never the task they are stuck on', () => {
    expect(suggestWhileWaiting(tasks, 'a')?.id).toBe('early');
    expect(suggestWhileWaiting(tasks, 'a', 'early')?.id).toBe('late');
    expect(suggestWhileWaiting(tasks, 'c')).toBeUndefined();
  });
});

describe('pacing', () => {
  const base: Curriculum = { id: 'c', name: 'Saxon', subject: 'math', childIds: ['a'], totalLessons: 100, lessonsDone: 0, startDate: monday, targetEndDate: addDays(monday, 7 * 20 - 3), schoolDays: WEEKDAYS, model: 'turnkey' };
  const at = (weeks: number) => addDays(monday, weeks * 7);

  it('has 100 school days over 20 weeks (one lesson a day)', () => {
    const p = pacing(base, monday);
    expect(p.totalSchoolDays).toBe(100);
    expect(p.lessonsPerDay).toBe(1);
    expect(p.lessonsPerWeek).toBe(5);
    expect(p.state).toBe('on_track');
  });

  it('is "not started" before the start date', () => {
    expect(pacing(base, addDays(monday, -7)).state).toBe('not_started');
  });

  it('reads ahead, on track and behind from the lessons done', () => {
    expect(pacing({ ...base, lessonsDone: 10 }, at(2)).state).toBe('on_track');
    expect(pacing({ ...base, lessonsDone: 13 }, at(2)).state).toBe('ahead');
    expect(pacing({ ...base, lessonsDone: 6 }, at(2)).state).toBe('behind');
    expect(pacing({ ...base, lessonsDone: 6 }, at(2)).delta).toBe(-4);
    // Missed lessons are re-spread over the days left, not piled up as backlog.
    const behind = pacing({ ...base, lessonsDone: 0 }, at(4));
    expect(behind).toMatchObject({ delta: -20, remainingSchoolDays: 80, lessonsPerDay: 1.3, lessonsPerWeek: 6.3 });
    expect(behind.projectedFinish! > base.targetEndDate).toBe(true);
  });

  it('counts breaks as days off', () => {
    const breaks = new Set(schoolDatesBetween(at(4), addDays(at(4), 4), WEEKDAYS));
    const p = pacing(base, monday, breaks);
    expect(p.totalSchoolDays).toBe(95);
    expect(p.lessonsPerDay).toBe(1.1);
  });

  it('is done when every lesson is done, with no projected finish', () => {
    const p = pacing({ ...base, lessonsDone: 100 }, at(3));
    expect(p).toMatchObject({ state: 'done', remainingLessons: 0, projectedFinish: undefined });
  });

  it('never divides by zero with no school days', () => {
    const p = pacing({ ...base, schoolDays: [] }, at(1));
    expect(p.totalSchoolDays).toBe(0);
    expect(Number.isFinite(p.lessonsPerDay)).toBe(true);
    expect(p.projectedFinish).toBeUndefined();
  });
});
