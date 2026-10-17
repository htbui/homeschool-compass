import type { ClockTime, DateKey, Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function weekdayOf(key: DateKey): Weekday {
  return fromDateKey(key).getDay() as Weekday;
}

/** Inclusive count of days between two keys (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function toMinutes(t: ClockTime): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): ClockTime {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function formatClock(t: ClockTime): string {
  const min = toMinutes(t);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function formatDate(key: DateKey, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  return fromDateKey(key).toLocaleDateString('en-US', opts);
}

export function ageOn(birthdate: DateKey, on: DateKey = todayKey()): number {
  const b = fromDateKey(birthdate);
  const d = fromDateKey(on);
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}

/** Next date strictly after `from` whose weekday is in `days`. */
export function nextDayIn(from: DateKey, days: Weekday[], maxLookahead = 14): DateKey | undefined {
  for (let i = 1; i <= maxLookahead; i++) {
    const candidate = addDays(from, i);
    if (days.includes(weekdayOf(candidate))) return candidate;
  }
  return undefined;
}

/** All dates in [start, end] whose weekday is in `days`, skipping `exclude`. */
export function schoolDatesBetween(start: DateKey, end: DateKey, days: Weekday[], exclude: Set<DateKey> = new Set()): DateKey[] {
  const out: DateKey[] = [];
  for (let k = start; diffDays(k, end) >= 0; k = addDays(k, 1)) {
    if (days.includes(weekdayOf(k)) && !exclude.has(k)) out.push(k);
  }
  return out;
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** School year label for a date, e.g. "2026–2027" (year flips in July). */
export function schoolYearLabel(key: DateKey = todayKey()): string {
  const d = fromDateKey(key);
  const startYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${startYear}–${startYear + 1}`;
}
