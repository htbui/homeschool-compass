import { todayKey, toMinutes } from './dates';
import { uid } from './id';
import { lessonAt, type FlatLesson, type PackageLesson } from './package';
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

/** "Saxon Algebra ½ · Lesson 37 of 123: Ratios" for curriculum-linked tasks. */
export function lessonLabel(task: Task, curricula: Curriculum[], tasks?: Task[]): string | undefined {
  const cur = task.curriculumId ? curricula.find((c) => c.id === task.curriculumId) : undefined;
  if (!cur) return undefined;
  const n = lessonNumber(task, cur, tasks);
  const lesson = lessonAt(cur.outline, n);
  return `${cur.name} · Lesson ${n} of ${cur.totalLessons}${lesson ? `: ${lesson.title}` : ''}`;
}

/** The outline lesson a task covers (curricula with a lesson-by-lesson plan). */
export function lessonFor(task: Task, curricula: Curriculum[], tasks?: Task[]): FlatLesson | undefined {
  const cur = task.curriculumId ? curricula.find((c) => c.id === task.curriculumId) : undefined;
  if (!cur?.outline) return undefined;
  return lessonAt(cur.outline, lessonNumber(task, cur, tasks));
}

/** A lesson's checklist: its own steps, or ones made from its pages, links, and questions. */
export function stepsForLesson(l: PackageLesson): string[] {
  if (l.steps.length) return l.steps;
  return [
    l.pages && `Read pages ${l.pages}`,
    l.links.length && (l.links.length === 1 ? `Open “${l.links[0].label}”` : 'Open the lesson links'),
    l.questions.length && `Answer the ${l.questions.length === 1 ? 'question' : `${l.questions.length} questions`}`,
  ].filter((x): x is string => !!x);
}

/**
 * Fill not-yet-started tasks on `date` with their lesson's steps. Re-run as
 * progress changes so each task always shows the lesson that's actually next.
 * Returns the same array when nothing changed.
 */
export function withLessons(tasks: Task[], curricula: Curriculum[], date: string): Task[] {
  let changed = false;
  const out = tasks.map((t) => {
    if (t.date !== date || t.status !== 'todo' || t.steps.some((s) => s.done) || !t.curriculumId) return t;
    const lesson = lessonFor(t, curricula, tasks);
    if (!lesson || lesson.id === t.lessonId) return t;
    const steps = stepsForLesson(lesson);
    changed = true;
    return {
      ...t,
      lessonId: lesson.id,
      steps: steps.length ? steps.map((label) => ({ id: uid('s'), label, done: false })) : t.steps,
      durationMin: lesson.minutes ?? t.durationMin,
    };
  });
  return changed ? out : tasks;
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
