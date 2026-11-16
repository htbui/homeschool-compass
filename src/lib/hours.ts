import { isCore, SUBJECTS } from './subjects';
import type { DateKey, HoursLog, ID, Subject, Task } from './types';

export interface HoursSummary {
  coreMin: number;
  nonCoreMin: number;
  totalMin: number;
  bySubject: Partial<Record<Subject, number>>;
  /** Distinct dates with any completed work or logged time. */
  daysAttended: number;
  attendedDates: DateKey[];
}

/**
 * Attendance & Subject Hours Counter. Completed tasks log their timer minutes
 * (or planned duration) automatically; manual logs cover off-app learning.
 */
export function summarizeHours(
  tasks: Task[],
  logs: HoursLog[],
  opts: { childId?: ID; from?: DateKey; to?: DateKey } = {},
): HoursSummary {
  const inRange = (d: DateKey) => (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to);
  const forChild = (id: ID) => !opts.childId || id === opts.childId;

  const bySubject: Partial<Record<Subject, number>> = {};
  const dates = new Set<DateKey>();
  let coreMin = 0;
  let nonCoreMin = 0;

  const add = (subject: Subject, min: number, date: DateKey) => {
    if (min <= 0) return;
    bySubject[subject] = (bySubject[subject] ?? 0) + min;
    if (isCore(subject)) coreMin += min;
    else nonCoreMin += min;
    dates.add(date);
  };

  for (const t of tasks) {
    if (t.status !== 'done' || t.hoursExcluded || !forChild(t.childId) || !inRange(t.date)) continue;
    add(t.subject, t.minutesSpent && t.minutesSpent > 0 ? t.minutesSpent : t.durationMin, t.date);
  }
  for (const l of logs) {
    if (!forChild(l.childId) || !inRange(l.date)) continue;
    add(l.subject, l.minutes, l.date);
  }

  const attendedDates = [...dates].sort();
  return { coreMin, nonCoreMin, totalMin: coreMin + nonCoreMin, bySubject, daysAttended: attendedDates.length, attendedDates };
}

export const toHours = (min: number) => Math.round((min / 60) * 10) / 10;

/** "🏃 PE 5 h (non-core)": spelled out, no abbreviations. */
export function subjectHoursLabel(subject: Subject, minutes: number): string {
  const s = SUBJECTS[subject];
  return `${s.icon} ${s.label} ${toHours(minutes)} h${s.core ? '' : ' (non-core)'}`;
}

/** "22.5 of 688 hrs" (or "22.5 hrs" when the state sets no goal). */
export const hoursOfGoal = (minutes: number, goal?: number) => `${toHours(minutes)}${goal ? ` of ${goal}` : ''} hrs`;
