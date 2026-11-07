import { describe, expect, it } from 'vitest';

import { doneFor, forChild, lessonLabel, lessonNumber, normalizeUrl, overallDone, setDoneFor } from '../curriculum';
import { addDays, todayKey } from '../dates';
import { mergeWorkspace } from '../sync';
import type { Curriculum, Task } from '../types';

const cur: Curriculum = { id: 'c1', name: 'Story Time', subject: 'history', childIds: ['a', 'b'], totalLessons: 40, lessonsDone: 5, startDate: '2026-08-17', targetEndDate: '2027-05-28', schoolDays: [1, 2, 3, 4, 5], model: 'custom' };
const task = (p: Partial<Task> = {}): Task => ({
  id: 't1', childId: 'a', date: todayKey(), title: 'Read', subject: 'history', mode: 'solo', start: '09:00', durationMin: 30, icon: '📜', steps: [], status: 'todo', curriculumId: 'c1', ...p,
});

describe('per-student progress', () => {
  it('falls back to the shared starting point, then tracks each student separately', () => {
    expect(doneFor(cur, 'a')).toBe(5);
    const next = setDoneFor(cur, 'a', 6);
    expect(doneFor(next, 'a')).toBe(6);
    expect(doneFor(next, 'b')).toBe(5);
    expect(overallDone(next)).toBe(5);
    expect(forChild(next, 'a').lessonsDone).toBe(6);
  });

  it('clamps to the lesson count and never goes negative', () => {
    expect(doneFor(setDoneFor(cur, 'a', 99), 'a')).toBe(40);
    expect(doneFor(setDoneFor(cur, 'a', -3), 'a')).toBe(0);
  });

  it('merges two devices finishing lessons for different students', () => {
    const base = { curricula: [setDoneFor(cur, 'a', 5)] };
    const local = { curricula: [setDoneFor(base.curricula[0], 'a', 6)] };
    const remote = { curricula: [setDoneFor(base.curricula[0], 'b', 6)] };
    const merged = mergeWorkspace(base, local, remote).curricula[0];
    expect(doneFor(merged, 'a')).toBe(6);
    expect(doneFor(merged, 'b')).toBe(6);
  });
});

describe('lesson numbers', () => {
  it('counts forward past the student’s earlier open lessons', () => {
    const today = task({ id: 't1' });
    const tomorrow = task({ id: 't2', date: addDays(todayKey(), 1) });
    const sibling = task({ id: 't3', childId: 'b', date: addDays(todayKey(), 1) });
    const all = [today, tomorrow, sibling];
    expect(lessonNumber(today, cur, all)).toBe(6);
    expect(lessonNumber(tomorrow, cur, all)).toBe(7);
    expect(lessonNumber(sibling, cur, all)).toBe(6);
  });

  it('keeps the number recorded when a lesson was finished', () => {
    expect(lessonNumber(task({ status: 'done', lessonNo: 3 }), cur)).toBe(3);
    expect(lessonLabel(task(), [cur])).toBe('Story Time · Lesson 6 of 40');
    expect(lessonLabel(task({ curriculumId: undefined }), [cur])).toBeUndefined();
  });
});

describe('lesson links', () => {
  it('accepts bare domains and rejects non-web addresses', () => {
    expect(normalizeUrl('example.com/lessons')).toBe('https://example.com/lessons');
    expect(normalizeUrl(' https://videos.example.org/math ')).toBe('https://videos.example.org/math');
    expect(normalizeUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeUrl('not a link')).toBeUndefined();
    expect(normalizeUrl('lesson7')).toBeUndefined();
  });
});
