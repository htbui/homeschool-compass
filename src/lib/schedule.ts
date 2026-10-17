import { fromMinutes, nextDayIn, toMinutes, weekdayOf } from './dates';
import { uid } from './id';
import type { DateKey, ID, RhythmBlock, Task, Weekday } from './types';

/**
 * Parent Availability Balancing.
 *
 * A task "needs the parent" when its mode is `parent` (1-on-1) or `group`
 * (family time, parent leading). Two parent-needing tasks for *different*
 * activities that overlap in time are a contention: the parent can't be in
 * two places. Copies of the same group block (same groupKey) never conflict
 * with each other — that's the whole family learning together.
 */

export interface Interval {
  start: number; // minutes since midnight
  end: number;
}

export const taskInterval = (t: Pick<Task, 'start' | 'durationMin'>): Interval => {
  const start = toMinutes(t.start);
  return { start, end: start + t.durationMin };
};

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export const needsParent = (t: Pick<Task, 'mode'>) => t.mode === 'parent' || t.mode === 'group';

/** Activity identity: all children in one group session share it. */
const activityKey = (t: Task) => t.groupKey ?? t.id;

export interface Conflict {
  a: Task;
  b: Task;
  overlapMin: number;
}

export function findParentConflicts(tasks: Task[]): Conflict[] {
  const active = tasks.filter((t) => needsParent(t) && t.status !== 'skipped');
  // Collapse group copies into one representative per activity.
  const byActivity = new Map<string, Task>();
  for (const t of active) if (!byActivity.has(activityKey(t))) byActivity.set(activityKey(t), t);
  const list = [...byActivity.values()].sort((x, y) => toMinutes(x.start) - toMinutes(y.start));

  const out: Conflict[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = taskInterval(list[i]);
      const b = taskInterval(list[j]);
      if (b.start >= a.end) break;
      if (overlaps(a, b)) out.push({ a: list[i], b: list[j], overlapMin: Math.min(a.end, b.end) - Math.max(a.start, b.start) });
    }
  }
  return out;
}

/** Same check for a weekly rhythm (for the schedule builder), per weekday. */
export function findRhythmConflicts(blocks: RhythmBlock[]): { day: Weekday; a: RhythmBlock; b: RhythmBlock }[] {
  const out: { day: Weekday; a: RhythmBlock; b: RhythmBlock }[] = [];
  for (let day = 0 as Weekday; day <= 6; day = (day + 1) as Weekday) {
    const list = blocks
      .filter((b) => b.days.includes(day) && (b.mode === 'parent' || b.mode === 'group'))
      .sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlaps(taskInterval(list[i]), taskInterval(list[j]))) out.push({ day, a: list[i], b: list[j] });
      }
    }
  }
  return out;
}

export interface StaggerMove {
  taskIds: ID[];
  from: string;
  to: string;
}

/**
 * Greedy stagger: walk parent-needing activities in start order, and whenever
 * one collides with the parent's committed time, slide it to the earliest slot
 * where the parent is free *and* every involved child is free. Solo tasks of the
 * involved children that would then collide are pushed later too, so a child's
 * own timeline never overlaps. Returns the rescheduled task list and the moves.
 */
export function autoStagger(tasks: Task[], dayEnd = '17:00'): { tasks: Task[]; moves: StaggerMove[] } {
  const result = tasks.map((t) => ({ ...t }));
  const endLimit = toMinutes(dayEnd);
  const parentBusy: Interval[] = [];
  const moves: StaggerMove[] = [];

  const groups = new Map<string, Task[]>();
  for (const t of result.filter((x) => needsParent(x) && x.status !== 'done' && x.status !== 'skipped')) {
    const k = activityKey(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  // Already-finished parent work still occupied the parent.
  for (const t of result.filter((x) => needsParent(x) && x.status === 'done')) parentBusy.push(taskInterval(t));

  const activities = [...groups.values()].sort((a, b) => toMinutes(a[0].start) - toMinutes(b[0].start));

  const childBusy = (childId: ID, exclude: Set<ID>) =>
    result.filter((t) => t.childId === childId && !exclude.has(t.id) && t.status !== 'skipped').map(taskInterval);

  for (const activity of activities) {
    const ids = new Set(activity.map((t) => t.id));
    const dur = activity[0].durationMin;
    const children = activity.map((t) => t.childId);
    let start = toMinutes(activity[0].start);

    // Earliest start where the parent is free. Children's solo work is flexible
    // and gets pushed below, so it doesn't block here.
    for (let guard = 0; guard < 200; guard++) {
      const slot = { start, end: start + dur };
      const clash = parentBusy.find((b) => overlaps(b, slot));
      if (!clash) break;
      start = clash.end;
    }
    if (start + dur > endLimit) start = toMinutes(activity[0].start); // can't fit today — leave it and let the conflict show

    const original = activity[0].start;
    const newStart = fromMinutes(start);
    if (newStart !== original) {
      for (const t of activity) t.start = newStart;
      moves.push({ taskIds: [...ids], from: original, to: newStart });
    }
    parentBusy.push({ start, end: start + dur });

    // Push each child's overlapping solo tasks after this activity.
    for (const childId of children) {
      const pinned = { start, end: start + dur };
      const solos = result
        .filter((t) => t.childId === childId && !ids.has(t.id) && t.mode === 'solo' && t.status !== 'done' && t.status !== 'skipped')
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
      for (const solo of solos) {
        const iv = taskInterval(solo);
        if (!overlaps(iv, pinned)) continue;
        let s = pinned.end;
        const busy = childBusy(childId, new Set([solo.id]));
        for (let guard = 0; guard < 200; guard++) {
          const slot = { start: s, end: s + solo.durationMin };
          const clash = busy.find((b) => overlaps(b, slot));
          if (!clash) break;
          s = clash.end;
        }
        const from = solo.start;
        solo.start = fromMinutes(s);
        moves.push({ taskIds: [solo.id], from, to: solo.start });
      }
    }
  }
  return { tasks: result, moves };
}

/** Materialize a weekly rhythm into concrete tasks for one date. Idempotent via `existing`. */
export function tasksForDate(blocks: RhythmBlock[], date: DateKey, existing: Task[]): Task[] {
  const day = weekdayOf(date);
  const have = new Set(existing.filter((t) => t.blockId).map((t) => `${t.blockId}|${t.childId}|${t.bumpedFrom ?? t.date}`));
  const out: Task[] = [];
  for (const b of blocks) {
    if (!b.days.includes(day)) continue;
    const groupKey = b.mode === 'group' ? `${b.id}|${date}` : undefined;
    for (const childId of b.childIds) {
      if (have.has(`${b.id}|${childId}|${date}`)) continue;
      out.push({
        id: uid('t'),
        blockId: b.id,
        groupKey,
        childId,
        date,
        title: b.title,
        subject: b.subject,
        mode: b.mode,
        start: b.start,
        durationMin: b.durationMin,
        icon: b.icon,
        steps: b.steps.map((label) => ({ id: uid('s'), label, done: false })),
        status: 'todo',
        curriculumId: b.curriculumId,
      });
    }
  }
  return out;
}

/**
 * "Gentle Bump": move unfinished tasks from `date` (optionally only those
 * starting at/after `fromTime`) to `target`. They're appended after the
 * target day's last task per child so nothing already there gets displaced.
 */
export function gentleBump(
  tasks: Task[],
  date: DateKey,
  target: DateKey,
  opts: { fromTime?: string; childId?: ID } = {},
): { tasks: Task[]; moved: number } {
  const from = opts.fromTime ? toMinutes(opts.fromTime) : -1;

  const toMove = tasks.filter(
    (t) =>
      t.date === date &&
      (t.status === 'todo' || t.status === 'in_progress') &&
      toMinutes(t.start) >= from &&
      (!opts.childId || t.childId === opts.childId),
  );
  if (toMove.length === 0) return { tasks, moved: 0 };

  const moving = new Set(toMove.map((t) => t.id));
  const nextEnd = new Map<ID, number>();
  for (const t of tasks) {
    if (t.date !== target) continue;
    nextEnd.set(t.childId, Math.max(nextEnd.get(t.childId) ?? 0, taskInterval(t).end));
  }

  // Group copies move together and keep a shared start time.
  const sorted = [...toMove].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const groupStart = new Map<string, number>();
  const newStart = new Map<ID, number>();
  for (const t of sorted) {
    if (t.groupKey && groupStart.has(t.groupKey)) {
      newStart.set(t.id, groupStart.get(t.groupKey)!);
      continue;
    }
    const peers = t.groupKey ? sorted.filter((x) => x.groupKey === t.groupKey) : [t];
    const earliest = Math.max(toMinutes(t.start), ...peers.map((p) => nextEnd.get(p.childId) ?? 0));
    for (const p of peers) nextEnd.set(p.childId, earliest + t.durationMin);
    if (t.groupKey) groupStart.set(t.groupKey, earliest);
    newStart.set(t.id, earliest);
  }

  const updated = tasks.map((t) => {
    if (!moving.has(t.id)) return t;
    return {
      ...t,
      date: target,
      start: fromMinutes(newStart.get(t.id)!),
      status: 'todo' as const,
      bumpedFrom: t.bumpedFrom ?? t.date,
      groupKey: t.groupKey ? `${t.groupKey}>${target}` : undefined,
    };
  });
  return { tasks: updated, moved: toMove.length };
}

/** Bump destinations offered to the parent: next school day, and the flex day if set. */
export function bumpTargets(date: DateKey, schoolDays: Weekday[], flexDay?: Weekday): { label: string; date: DateKey }[] {
  const out: { label: string; date: DateKey }[] = [];
  const next = nextDayIn(date, schoolDays);
  if (next) out.push({ label: 'Next school day', date: next });
  if (flexDay !== undefined) {
    const flex = nextDayIn(date, [flexDay]);
    if (flex && flex !== next) out.push({ label: 'Flex / catch-up day', date: flex });
    else if (flex && out[0]) out[0].label = 'Flex / catch-up day';
  }
  return out;
}

/** Rows for the Family Flight Deck timeline (one per child, sorted). */
export function timelineByChild(tasks: Task[], childIds: ID[]): Record<ID, Task[]> {
  const out: Record<ID, Task[]> = {};
  for (const id of childIds) out[id] = tasks.filter((t) => t.childId === id).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return out;
}

/** Suggest a solo filler while a child waits for help. */
export function suggestWhileWaiting(tasks: Task[], childId: ID, excludeTaskId?: ID): Task | undefined {
  return tasks
    .filter((t) => t.childId === childId && t.mode === 'solo' && t.status === 'todo' && t.id !== excludeTaskId)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0];
}
