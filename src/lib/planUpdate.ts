import { doneFor } from './curriculum';
import type { PackageContent } from './market';
import { allLessons, lessonTotal, type FlatLesson, type PackageUnit } from './package';
import type { Curriculum, ID, Task } from './types';

/**
 * Updating a scheduled lesson-by-lesson plan to a newer version (a creator's
 * new release, or a family's own Studio edits) without losing anyone's place.
 * Lessons are matched by id, so a kid who finished "Frog life cycle" is still
 * past it after lessons are added, moved, or removed around it.
 */

export interface PlanDiff {
  added: FlatLesson[];
  removed: FlatLesson[];
  changed: FlatLesson[];
  /** Lessons now in a different position (not counting ones shifted by adds/removes). */
  moved: number;
  before: number;
  after: number;
}

/** Where one student lands in the new version. */
export interface ProgressMove {
  childId: ID;
  before: number;
  after: number;
  /** The last lesson they finished, in the new version. */
  lastDone?: FlatLesson;
  /** New lessons placed before their spot, counted as done. */
  skippedNew: FlatLesson[];
}

/** A lesson's own content, without its id or where it sits. */
const content = ({ id: _id, n: _n, unit: _unit, ...rest }: FlatLesson) => JSON.stringify(rest);

export function sameOutline(a: PackageUnit[] = [], b: PackageUnit[] = []): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffOutline(prev: PackageUnit[] = [], next: PackageUnit[] = []): PlanDiff {
  const old = allLessons(prev);
  const neu = allLessons(next);
  const oldById = new Map(old.map((l) => [l.id, l]));
  const newIds = new Set(neu.map((l) => l.id));
  const kept = neu.filter((l) => oldById.has(l.id));
  const keptOld = old.filter((l) => newIds.has(l.id));
  return {
    added: neu.filter((l) => !oldById.has(l.id)),
    removed: old.filter((l) => !newIds.has(l.id)),
    changed: kept.filter((l) => content(l) !== content(oldById.get(l.id)!) || l.unit !== oldById.get(l.id)!.unit),
    moved: kept.filter((l, i) => keptOld[i]?.id !== l.id).length,
    before: old.length,
    after: neu.length,
  };
}

/** Lessons done in the new version, for someone who had finished `done` lessons of the old one. */
export function remapDone(prev: PackageUnit[] = [], next: PackageUnit[] = [], done: number): { done: number; skippedNew: FlatLesson[] } {
  const old = allLessons(prev);
  const neu = allLessons(next);
  if (done <= 0) return { done: 0, skippedNew: [] };
  const at = new Map(neu.map((l, i) => [l.id, i]));
  let mapped = -1;
  for (let i = Math.min(done, old.length) - 1; i >= 0 && mapped < 0; i--) mapped = at.get(old[i].id) ?? -1;
  // Nothing they finished is left (or the plan was rebuilt): keep the count.
  const n = mapped < 0 ? Math.min(done, neu.length) : mapped + 1;
  const oldIds = new Set(old.map((l) => l.id));
  return { done: n, skippedNew: mapped < 0 ? [] : neu.slice(0, n).filter((l) => !oldIds.has(l.id)) };
}

export function progressMoves(c: Curriculum, next: PackageUnit[]): ProgressMove[] {
  return c.childIds.map((childId) => {
    const before = doneFor(c, childId);
    const r = remapDone(c.outline, next, before);
    return { childId, before, after: r.done, lastDone: r.done ? allLessons(next)[r.done - 1] : undefined, skippedNew: r.skippedNew };
  });
}

/**
 * The curriculum and its tasks on the new version. Finished tasks keep
 * pointing at the lesson they covered; not-started ones are refilled with
 * whatever lesson is next.
 */
export function applyPlanUpdate(c: Curriculum, tasks: Task[], next: PackageContent): { curriculum: Curriculum; tasks: Task[] } {
  const total = lessonTotal(next.units);
  const at = new Map(allLessons(next.units).map((l) => [l.id, l.n]));
  const curriculum: Curriculum = {
    ...c,
    outline: next.units,
    totalLessons: Math.max(1, total),
    lessonsDone: remapDone(c.outline, next.units, c.lessonsDone).done,
    progress: Object.fromEntries(progressMoves(c, next.units).map((m) => [m.childId, m.after])),
    packageVersion: next.version,
    license: next.license ?? c.license,
    attribution: next.attribution ?? c.attribution,
    skippedUpdate: undefined,
  };
  const out = tasks.map((t) => {
    if (t.curriculumId !== c.id) return t;
    if (t.status === 'done' || t.status === 'skipped') {
      const n = t.lessonId ? at.get(t.lessonId) : undefined;
      return n && n !== t.lessonNo ? { ...t, lessonNo: n } : t;
    }
    // Not started yet: let the scheduler fill in the right lesson again.
    return t.lessonId && !t.steps.some((s) => s.done) ? { ...t, lessonId: undefined } : t;
  });
  return { curriculum, tasks: out };
}
