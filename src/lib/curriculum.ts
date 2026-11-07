import { todayKey, toMinutes } from './dates';
import type { Curriculum, ID, Task } from './types';

/**
 * Per-student progress through a curriculum. Siblings sharing one curriculum
 * each keep their own count, so one child's finished lesson never moves the
 * other forward.
 */

export const doneFor = (c: Curriculum, childId: ID): number => Math.min(c.totalLessons, c.progress?.[childId] ?? c.lessonsDone);

/** The curriculum as seen by one student (for pacing). */
export const forChild = (c: Curriculum, childId: ID): Curriculum => ({ ...c, lessonsDone: doneFor(c, childId) });

/** Only the changed student's entry is written, so edits on two devices merge cleanly. */
export function setDoneFor(c: Curriculum, childId: ID, n: number): Curriculum {
  return { ...c, progress: { ...c.progress, [childId]: Math.max(0, Math.min(c.totalLessons, Math.round(n))) } };
}

/** "8 / 60" for one student; the slowest student's count for the whole family. */
export const overallDone = (c: Curriculum): number => (c.childIds.length ? Math.min(...c.childIds.map((id) => doneFor(c, id))) : c.lessonsDone);

/**
 * The lesson number a task covers. Finished tasks keep the number recorded
 * when they were done; open ones count forward from the student's progress,
 * past any of their earlier open lessons from today on.
 */
export function lessonNumber(task: Task, c: Curriculum, tasks: Task[] = []): number {
  if (task.lessonNo) return task.lessonNo;
  const today = todayKey();
  const before = (t: Task) => t.date < task.date || (t.date === task.date && toMinutes(t.start) < toMinutes(task.start));
  const ahead = tasks.filter(
    (t) => t.id !== task.id && t.childId === task.childId && t.curriculumId === c.id && (t.status === 'todo' || t.status === 'in_progress') && t.date >= today && before(t),
  ).length;
  return Math.min(c.totalLessons, doneFor(c, task.childId) + 1 + (task.status === 'done' ? -1 : ahead));
}

/** "Saxon Algebra ½ · Lesson 37 of 123" for curriculum-linked tasks. */
export function lessonLabel(task: Task, curricula: Curriculum[], tasks?: Task[]): string | undefined {
  const cur = task.curriculumId ? curricula.find((c) => c.id === task.curriculumId) : undefined;
  if (!cur) return undefined;
  return `${cur.name} · Lesson ${lessonNumber(task, cur, tasks)} of ${cur.totalLessons}`;
}

/** Accepts "khanacademy.org/…" as well as full URLs; undefined when it isn't a web link. */
export function normalizeUrl(input: string): string | undefined {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}
