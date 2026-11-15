import { allLessons, lessonAt, type PackageUnit } from './package';
import type { Curriculum, ID, Task } from './types';

/**
 * Studio Insights: how a published plan's lessons go in real families,
 * without saying anything about who those families or kids are.
 *
 * Each family's device sends one small row per lesson of a Marketplace plan
 * it used: finished or skipped, minutes taken vs. planned, and whether a kid
 * marked it tricky. Nothing about the children (no names, ids, ages, or how
 * many kids), only the family's combined result. The server keeps rows per
 * family so re-sends replace rather than add up, and creators only ever see
 * totals for lessons at least MIN_FAMILIES families have reported.
 */

export const MIN_FAMILIES = 5;
/** A family with no new progress for this long counts as having stopped. */
export const STALLED_DAYS = 30;

/** What one family reports about one lesson. */
export interface LessonReport {
  listingId: ID;
  lessonId: ID;
  /** Position in the family's version of the plan. */
  lessonNo: number;
  done: boolean;
  skipped: boolean;
  /** Average actual minutes (timer) across the family's kids who finished it. */
  minutes?: number;
  /** Planned minutes. */
  planned?: number;
  tricky: boolean;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined);
const clampMin = (n?: number) => (n && n >= 1 ? Math.min(600, Math.round(n)) : undefined);

/** This family's reports for every Marketplace plan it has used. */
export function lessonReports(curricula: Curriculum[], tasks: Task[]): LessonReport[] {
  const out: LessonReport[] = [];
  for (const c of curricula) {
    if (!c.listingId || !c.outline?.length) continue;
    const byLesson = new Map<ID, Task[]>();
    for (const t of tasks) {
      if (t.curriculumId !== c.id || (t.status !== 'done' && t.status !== 'skipped')) continue;
      const id = t.lessonId ?? (t.lessonNo ? lessonAt(c.outline, t.lessonNo)?.id : undefined);
      if (!id) continue;
      byLesson.set(id, [...(byLesson.get(id) ?? []), t]);
    }
    const pos = new Map(allLessons(c.outline).map((l) => [l.id, l]));
    for (const [lessonId, ts] of byLesson) {
      const lesson = pos.get(lessonId);
      if (!lesson) continue; // no longer in the plan
      const done = ts.filter((t) => t.status === 'done');
      out.push({
        listingId: c.listingId,
        lessonId,
        lessonNo: lesson.n,
        done: done.length > 0,
        skipped: done.length === 0,
        minutes: clampMin(avg(done.map((t) => t.minutesSpent ?? 0).filter((m) => m > 0))),
        planned: clampMin(lesson.minutes ?? avg(ts.map((t) => t.durationMin))),
        tricky: done.some((t) => t.selfAssessment === 1),
      });
    }
  }
  return out.sort((a, b) => a.listingId.localeCompare(b.listingId) || a.lessonNo - b.lessonNo);
}

/** Totals for one lesson, as the server returns them (only for MIN_FAMILIES+ families). */
export interface LessonStat {
  lessonId: ID;
  families: number;
  done: number;
  skipped: number;
  tricky: number;
  /** Only when MIN_FAMILIES+ families timed it. */
  avgMinutes?: number;
  avgPlanned?: number;
  /** Families whose furthest finished lesson is this one and who haven't moved on in a month. */
  stoppedHere: number;
  /** Families using the plan at all. */
  totalFamilies: number;
}

export interface StoredReport extends LessonReport {
  family: string;
  updatedAt: string;
}

/** The same totals the server computes (lesson_insights), for this device and for tests. */
export function aggregateReports(rows: StoredReport[], now = new Date(), min = MIN_FAMILIES): LessonStat[] {
  const families = new Map<string, { last: string; furthest: number }>();
  for (const r of rows) {
    const f = families.get(r.family) ?? { last: '', furthest: 0 };
    families.set(r.family, { last: r.updatedAt > f.last ? r.updatedAt : f.last, furthest: r.done ? Math.max(f.furthest, r.lessonNo) : f.furthest });
  }
  const cutoff = new Date(now.getTime() - STALLED_DAYS * 86_400_000).toISOString();
  const byLesson = new Map<ID, StoredReport[]>();
  for (const r of rows) byLesson.set(r.lessonId, [...(byLesson.get(r.lessonId) ?? []), r]);
  const stats: LessonStat[] = [];
  for (const [lessonId, rs] of byLesson) {
    if (rs.length < min) continue;
    const timed = rs.filter((r) => r.minutes);
    stats.push({
      lessonId,
      families: rs.length,
      done: rs.filter((r) => r.done).length,
      skipped: rs.filter((r) => r.skipped && !r.done).length,
      tricky: rs.filter((r) => r.tricky).length,
      avgMinutes: timed.length >= min ? Math.round((timed.reduce((a, r) => a + r.minutes!, 0) / timed.length) * 10) / 10 : undefined,
      avgPlanned: timed.length >= min ? Math.round((timed.reduce((a, r) => a + (r.planned ?? 0), 0) / timed.length) * 10) / 10 : undefined,
      stoppedHere: rs.filter((r) => {
        const f = families.get(r.family)!;
        return r.done && r.lessonNo === f.furthest && f.last < cutoff;
      }).length,
      totalFamilies: families.size,
    });
  }
  return stats;
}

// ───────────────────────────── Friendly sentences

export interface Insight {
  lessonId?: ID;
  n?: number;
  kind: 'time' | 'tricky' | 'skipped' | 'dropoff' | 'quick' | 'good';
  text: string;
}

const pct = (a: number, b: number) => Math.round((a / b) * 100);

function timeWords(ratio: number): string | undefined {
  if (ratio >= 2.6) return `about ${Math.round(ratio)} times as long as planned`;
  if (ratio >= 1.8) return 'about twice as long as planned';
  if (ratio >= 1.4) return 'about half again as long as planned';
  if (ratio <= 0.55) return 'about half the planned time';
  return undefined;
}

/** Plain sentences for the creator, most useful first. Lessons no longer in the plan are left out. */
export function insightSentences(units: PackageUnit[], stats: LessonStat[]): Insight[] {
  const lessons = new Map(allLessons(units).map((l) => [l.id, l]));
  const out: Insight[] = [];
  const name = (n: number, title: string) => `Lesson ${n} (“${title}”)`;
  const known = stats.filter((s) => lessons.has(s.lessonId)).sort((a, b) => lessons.get(a.lessonId)!.n - lessons.get(b.lessonId)!.n);

  // Where families stop: the lesson the most stalled families got to last.
  const stop = [...known].sort((a, b) => b.stoppedHere - a.stoppedHere)[0];
  if (stop && stop.stoppedHere >= 3 && stop.stoppedHere / stop.families >= 0.2) {
    const l = lessons.get(stop.lessonId)!;
    out.push({ lessonId: l.id, n: l.n, kind: 'dropoff', text: `${name(l.n, l.title)} is where families most often stop: ${stop.stoppedHere} of ${stop.families} who finished it haven’t gone further in a month.` });
  }
  for (const s of known) {
    const l = lessons.get(s.lessonId)!;
    if (s.avgMinutes && s.avgPlanned) {
      const words = timeWords(s.avgMinutes / s.avgPlanned);
      if (words) out.push({ lessonId: l.id, n: l.n, kind: s.avgMinutes > s.avgPlanned ? 'time' : 'quick', text: `${name(l.n, l.title)} takes ${words} (about ${Math.round(s.avgMinutes)} min vs. ${Math.round(s.avgPlanned)} planned).` });
    }
    if (s.done >= 3 && s.tricky / s.done >= 0.4) out.push({ lessonId: l.id, n: l.n, kind: 'tricky', text: `Kids often mark ${name(l.n, l.title)} as tricky (${pct(s.tricky, s.done)}% of families who finished it).` });
    if (s.skipped / s.families >= 0.3) out.push({ lessonId: l.id, n: l.n, kind: 'skipped', text: `Many families skip ${name(l.n, l.title)}: only ${pct(s.done, s.families)}% of those who got to it finished it.` });
  }
  const rank: Record<Insight['kind'], number> = { dropoff: 0, time: 1, tricky: 2, skipped: 3, quick: 4, good: 5 };
  out.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.n ?? 0) - (b.n ?? 0));
  if (!out.length && known.length) out.push({ kind: 'good', text: `The ${known.length} lesson${known.length === 1 ? '' : 's'} with enough families so far are going about as planned: finished, on time, and rarely marked tricky.` });
  return out;
}
