import { describe, expect, it } from 'vitest';

import { doneFor } from '../curriculum';
import { newLesson, newUnit, type PackageUnit } from '../package';
import { applyPlanUpdate, diffOutline, progressMoves, remapDone, sameOutline } from '../planUpdate';
import type { Curriculum, Task } from '../types';

const L = (id: string, title = id, extra = {}) => ({ ...newLesson(title, extra), id });
const U = (id: string, lessons: ReturnType<typeof L>[]) => ({ ...newUnit(id, lessons), id });

const v1: PackageUnit[] = [U('u1', [L('a'), L('b'), L('c')]), U('u2', [L('d'), L('e')])];

const cur = (progress: Record<string, number>): Curriculum => ({
  id: 'c1',
  name: 'Pond Life',
  subject: 'science',
  childIds: Object.keys(progress),
  totalLessons: 5,
  lessonsDone: 0,
  progress,
  startDate: '2026-09-01',
  targetEndDate: '2027-05-01',
  schoolDays: [1, 2, 3, 4, 5],
  model: 'modular',
  outline: v1,
  packageId: 'pk1',
  packageVersion: 1,
  listingId: 'l1',
});

const task = (p: Partial<Task>): Task => ({
  id: 't',
  blockId: 'b',
  childId: 'kid1',
  title: 'Pond Life',
  subject: 'science',
  date: '2026-10-01',
  start: '09:00',
  durationMin: 30,
  mode: 'solo',
  steps: [],
  status: 'todo',
  curriculumId: 'c1',
  ...p,
} as Task);

describe('plan updates', () => {
  it('lists added, removed, changed, and reordered lessons', () => {
    const v2 = [U('u1', [L('a'), L('new1', 'Tadpoles'), L('c', 'c (revised)')]), U('u2', [L('e'), L('d')])];
    const d = diffOutline(v1, v2);
    expect(d.added.map((l) => l.id)).toEqual(['new1']);
    expect(d.removed.map((l) => l.id)).toEqual(['b']);
    expect(d.changed.map((l) => l.id)).toEqual(['c']);
    expect(d.moved).toBe(2);
    expect([d.before, d.after]).toEqual([5, 5]);
    expect(sameOutline(v1, JSON.parse(JSON.stringify(v1)))).toBe(true);
  });

  it('keeps each kid on the lesson they reached when lessons move around them', () => {
    // Two lessons added at the start, one removed later: finishing "c" still means "c" is done.
    const v2 = [U('u0', [L('x'), L('y')]), U('u1', [L('a'), L('b'), L('c')]), U('u2', [L('e')])];
    expect(remapDone(v1, v2, 3)).toMatchObject({ done: 5 });
    expect(remapDone(v1, v2, 3).skippedNew.map((l) => l.id)).toEqual(['x', 'y']);
    expect(remapDone(v1, v2, 0)).toEqual({ done: 0, skippedNew: [] });
    // The last finished lesson was removed: fall back to the one before it.
    const v3 = [U('u1', [L('a'), L('b'), L('n')]), U('u2', [L('d'), L('e')])];
    expect(remapDone(v1, v3, 3).done).toBe(2);
    // Rebuilt from scratch (no shared lessons): keep the count.
    expect(remapDone(v1, [U('z', [L('p'), L('q'), L('r'), L('s')])], 3)).toEqual({ done: 3, skippedNew: [] });
  });

  it('updates each sibling separately and re-points finished tasks', () => {
    const v2 = [U('u1', [L('a'), L('b2'), L('b'), L('c')]), U('u2', [L('d'), L('e'), L('f')])];
    const c = cur({ kid1: 2, kid2: 4 });
    expect(progressMoves(c, v2).map((m) => [m.childId, m.before, m.after])).toEqual([['kid1', 2, 3], ['kid2', 4, 5]]);
    const tasks = [
      task({ id: 'done', status: 'done', lessonNo: 2, lessonId: 'b' }),
      task({ id: 'open', status: 'todo', lessonId: 'c', date: '2026-10-02' }),
      task({ id: 'started', status: 'in_progress', lessonId: 'c', steps: [{ id: 's', label: 'Read', done: true }] }),
      task({ id: 'other', curriculumId: 'c2', status: 'done', lessonNo: 2, lessonId: 'b' }),
    ];
    const r = applyPlanUpdate(c, tasks, { units: v2, version: 2, note: 'More lessons' });
    expect(r.curriculum.totalLessons).toBe(7);
    expect(r.curriculum.packageVersion).toBe(2);
    expect([doneFor(r.curriculum, 'kid1'), doneFor(r.curriculum, 'kid2')]).toEqual([3, 5]);
    const byId = Object.fromEntries(r.tasks.map((t) => [t.id, t]));
    expect(byId.done.lessonNo).toBe(3);
    expect(byId.open.lessonId).toBeUndefined();
    expect(byId.started.lessonId).toBe('c');
    expect(byId.other).toBe(tasks[3]);
  });
});
