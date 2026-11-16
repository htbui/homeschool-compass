import { addDays, formatClock, fromMinutes, toMinutes, weekdayOf } from './dates';
import type { DateKey, RhythmBlock, Task } from './types';

/**
 * The Today screen as a list: what everyone is doing, slot by slot, and what's
 * happening now and next. Phones show this instead of the timeline chart.
 */

export interface AgendaSlot {
  start: string;
  /** Tasks starting at this time; the ones that need the parent come first. */
  tasks: Task[];
  /** Someone needs the parent in this slot. */
  parentTime: boolean;
}

const MODE_ORDER: Record<Task['mode'], number> = { parent: 0, group: 1, solo: 2 };

/** Group a day's tasks by start time, earliest first, parent-time items first in each slot. */
export function agendaSlots(tasks: Task[], childOrder: string[] = []): AgendaSlot[] {
  const rank = (id: string) => {
    const i = childOrder.indexOf(id);
    return i < 0 ? childOrder.length : i;
  };
  const bySlot = new Map<string, Task[]>();
  for (const t of tasks) bySlot.set(t.start, [...(bySlot.get(t.start) ?? []), t]);
  return [...bySlot.entries()]
    .sort(([a], [b]) => toMinutes(a) - toMinutes(b))
    .map(([start, list]) => {
      const sorted = [...list].sort((a, b) => MODE_ORDER[a.mode] - MODE_ORDER[b.mode] || rank(a.childId) - rank(b.childId) || a.title.localeCompare(b.title));
      return { start, tasks: sorted, parentTime: sorted.some((t) => t.mode === 'parent' && t.status !== 'skipped') };
    });
}

const open = (t: Task) => t.status === 'todo' || t.status === 'in_progress';
const endOf = (t: Task) => toMinutes(t.start) + t.durationMin;

/**
 * "Now / Next" for today. `now` holds unfinished tasks whose time window includes this minute
 * (or that a kid has started); `next` is the earliest group of unfinished tasks still to come.
 */
export function nowAndNext(tasks: Task[], nowMin: number): { now: Task[]; next: Task[]; nextStart?: string } {
  const live = tasks.filter(open);
  const now = live.filter((t) => t.status === 'in_progress' || (toMinutes(t.start) <= nowMin && nowMin < endOf(t)));
  const later = live.filter((t) => !now.includes(t) && toMinutes(t.start) > nowMin).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const nextStart = later[0]?.start;
  return { now, next: nextStart ? later.filter((t) => t.start === nextStart) : [], nextStart };
}

/**
 * The next day after `from` with anything planned: a rhythm block on that weekday,
 * or tasks already on it (bumped or one-off work). Looks two weeks ahead.
 */
export function nextPlannedDay(from: DateKey, blocks: RhythmBlock[], tasks: Task[], maxLookahead = 14): DateKey | undefined {
  const taskDays = new Set(tasks.filter((t) => t.status !== 'skipped').map((t) => t.date));
  for (let i = 1; i <= maxLookahead; i++) {
    const d = addDays(from, i);
    if (taskDays.has(d) || blocks.some((b) => b.childIds.length && b.days.includes(weekdayOf(d)))) return d;
  }
  return undefined;
}

/** True when the rhythm (or a bumped / one-off task) puts work on this day. */
export function isPlannedDay(date: DateKey, blocks: RhythmBlock[], tasks: Task[]): boolean {
  return tasks.some((t) => t.date === date && t.status !== 'skipped') || blocks.some((b) => b.childIds.length && b.days.includes(weekdayOf(date)));
}

/** The span a timeline covers: whole half hours around the tasks, never past midnight. */
export function timelineSpan(tasks: Pick<Task, 'start' | 'durationMin'>[]): { start: number; end: number } {
  if (!tasks.length) return { start: 8 * 60, end: 15 * 60 };
  const start = Math.floor(Math.min(...tasks.map((t) => toMinutes(t.start))) / 30) * 30;
  const end = Math.min(24 * 60, Math.ceil(Math.max(...tasks.map((t) => toMinutes(t.start) + t.durationMin)) / 30) * 30);
  return { start: Math.min(start, end - 30), end };
}

/** Half-hour axis labels for a span, each a distinct time ("9 AM", "9:30 AM" … "12 AM" at midnight). */
export function timelineTicks(span: { start: number; end: number }): { min: number; label: string }[] {
  const out: { min: number; label: string }[] = [];
  for (let m = span.start; m <= span.end; m += 30) {
    out.push({ min: m, label: m >= 24 * 60 ? '12 AM' : formatClock(fromMinutes(m)).replace(':00', '') });
  }
  return out;
}

/** Pixels per minute so the whole day fits the room available, within readable limits. */
export function fitScale(span: { start: number; end: number }, room: number, min = 1.2, max = 4): number {
  const minutes = Math.max(30, span.end - span.start);
  return Math.max(min, Math.min(max, room / minutes));
}
