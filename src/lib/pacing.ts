import { diffDays, formatDate, schoolDatesBetween, todayKey } from './dates';
import type { Curriculum, DateKey } from './types';

export interface PacingStatus {
  totalSchoolDays: number;
  remainingSchoolDays: number;
  remainingLessons: number;
  /** Lessons/day needed from today to finish on the target date. */
  lessonsPerDay: number;
  lessonsPerWeek: number;
  /** Where the plan says you'd be today if you'd kept the original pace. */
  expectedDone: number;
  /** Positive = ahead, negative = behind (in lessons). */
  delta: number;
  projectedFinish?: DateKey;
  state: 'ahead' | 'on_track' | 'behind' | 'done' | 'not_started';
}

/**
 * Curriculum Pacing Engine. Rather than piling missed lessons up as "backlog",
 * the remaining lessons are re-spread across the remaining school days — the
 * parent just sees a slightly higher daily rate, not guilt.
 */
export function pacing(c: Curriculum, today: DateKey = todayKey(), breaks: Set<DateKey> = new Set()): PacingStatus {
  const all = schoolDatesBetween(c.startDate, c.targetEndDate, c.schoolDays, breaks);
  const remainingLessons = Math.max(0, c.totalLessons - c.lessonsDone);
  const startFrom = diffDays(c.startDate, today) > 0 ? today : c.startDate;
  const remaining = schoolDatesBetween(startFrom, c.targetEndDate, c.schoolDays, breaks);
  const elapsed = all.filter((d) => d < today).length;

  const basePerDay = all.length ? c.totalLessons / all.length : 0;
  const expectedDone = Math.min(c.totalLessons, Math.round(basePerDay * elapsed));
  const lessonsPerDay = remaining.length ? remainingLessons / remaining.length : remainingLessons;
  const daysPerWeek = c.schoolDays.length || 5;

  let projectedFinish: DateKey | undefined;
  if (remainingLessons === 0) projectedFinish = undefined;
  else if (basePerDay > 0) {
    const daysNeeded = Math.ceil(remainingLessons / basePerDay);
    // Walk forward through school days at the original pace (may run past the target).
    const horizon = schoolDatesBetween(startFrom, addYears(c.targetEndDate, 1), c.schoolDays, breaks);
    projectedFinish = horizon[Math.min(daysNeeded, horizon.length) - 1];
  }

  const delta = c.lessonsDone - expectedDone;
  let state: PacingStatus['state'];
  if (remainingLessons === 0) state = 'done';
  else if (diffDays(today, c.startDate) > 0) state = 'not_started';
  else if (delta >= Math.max(1, basePerDay * 2)) state = 'ahead';
  else if (delta <= -Math.max(1, basePerDay * 3)) state = 'behind';
  else state = 'on_track';

  return {
    totalSchoolDays: all.length,
    remainingSchoolDays: remaining.length,
    remainingLessons,
    lessonsPerDay: round1(lessonsPerDay),
    lessonsPerWeek: round1(lessonsPerDay * daysPerWeek),
    expectedDone,
    delta,
    projectedFinish,
    state,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const shortDate = (d: DateKey) => formatDate(d, { month: 'short', day: 'numeric' });

/** "about 2 lessons a week", "about 1 lesson every 3 weeks" — words, not decimals. */
export function rateWords(lessonsPerWeek: number): string {
  if (lessonsPerWeek <= 0) return 'no lessons left';
  if (lessonsPerWeek >= 0.75) {
    const n = Math.max(1, Math.round(lessonsPerWeek));
    return `about ${n} lesson${n === 1 ? '' : 's'} a week`;
  }
  return `about 1 lesson every ${Math.round(1 / lessonsPerWeek)} weeks`;
}

/**
 * One plain line for a curriculum's pace ("On track to finish Jun 4 · about 2 lessons a week"),
 * plus the details for "Why re-paced?" / "Details".
 */
export function paceSummary(c: Pick<Curriculum, 'targetEndDate' | 'startDate'>, p: PacingStatus): { lead: string; details: string[]; why: string } {
  if (p.state === 'done') return { lead: 'Finished 🎓', details: [], why: 'Details' };
  if (p.state === 'not_started') return { lead: `Starts ${shortDate(c.startDate)} · ${rateWords(p.lessonsPerWeek)}`, details: [`${p.remainingLessons} lessons over ${p.remainingSchoolDays} school days.`], why: 'Details' };
  const details = [`${p.remainingLessons} lesson${p.remainingLessons === 1 ? '' : 's'} left over ${p.remainingSchoolDays} school day${p.remainingSchoolDays === 1 ? '' : 's'}: ${p.lessonsPerWeek} a week (${p.lessonsPerDay} a day).`];
  if (p.delta < 0) details.push(`${-p.delta} lesson${p.delta === -1 ? '' : 's'} behind the original plan, so the rest are spread out a little more — no backlog to catch up on.`);
  if (p.delta > 0) details.push(`${p.delta} lesson${p.delta === 1 ? '' : 's'} ahead of the original plan.`);
  if (p.delta < 0 && p.projectedFinish) details.push(`At the original pace you'd finish ${shortDate(p.projectedFinish)} instead.`);
  return { lead: `On track to finish ${shortDate(c.targetEndDate)} · ${rateWords(p.lessonsPerWeek)}`, details, why: p.state === 'behind' ? 'Why re-paced?' : 'Details' };
}

function addYears(key: DateKey, years: number): DateKey {
  const [y, m, d] = key.split('-');
  return `${Number(y) + years}-${m}-${d}`;
}

/** Popular curricula with approximate lesson counts, for quick import. */
export const CURRICULUM_PRESETS: { name: string; subject: Curriculum['subject']; lessons: number; note: string }[] = [
  { name: 'Saxon Math (grade level)', subject: 'math', lessons: 120, note: '120 lessons + tests' },
  { name: 'Beast Academy (level)', subject: 'math', lessons: 144, note: '4 books × ~36 sections' },
  { name: 'Math-U-See (level)', subject: 'math', lessons: 30, note: '30 lessons, ~1/week' },
  { name: 'Singapore Primary Mathematics (level)', subject: 'math', lessons: 160, note: 'Textbook + workbook A/B' },
  { name: 'All About Reading (level)', subject: 'phonics', lessons: 60, note: '~60 lessons' },
  { name: 'The Good and the Beautiful Language Arts', subject: 'reading', lessons: 120, note: '120 lessons' },
  { name: 'Story of the World (volume)', subject: 'history', lessons: 42, note: '42 chapters' },
  { name: 'Blossom & Root (year)', subject: 'science', lessons: 36, note: '36 weeks' },
  { name: 'Torchlight (level)', subject: 'history', lessons: 36, note: '36 weeks' },
  { name: 'Apologia Science (book)', subject: 'science', lessons: 14, note: '14 modules' },
  { name: 'Duolingo / language app', subject: 'foreign_language', lessons: 180, note: 'One unit per day' },
];
