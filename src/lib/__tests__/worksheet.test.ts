import { describe, expect, it } from 'vitest';

import { isDateKey, relativeDayLabel, stepDay, weekdayOf } from '../dates';
import type { Child, Curriculum, Task } from '../types';
import { lessonLabel } from '../curriculum';
import { answerKeyHtml, hasAnswerKey, workAreaFor, worksheetHtml } from '../worksheet';

const kid: Child = { id: 'k1', name: 'Maya <3', birthdate: '2017-05-21', grade: '4th Grade', avatar: '🦊', color: '#f00', learningDifferences: [], passions: [], soloToleranceMin: 20, sparks: 0 };
const cur: Curriculum = { id: 'c1', name: 'Fraction Forest', subject: 'math', childIds: ['k1'], totalLessons: 120, lessonsDone: 36, startDate: '2026-08-17', targetEndDate: '2027-05-28', schoolDays: [1, 2, 3, 4, 5], model: 'turnkey' };
const task = (p: Partial<Task> = {}): Task => ({
  id: 't1', childId: 'k1', date: '2026-11-09', title: 'Math lesson', subject: 'math', mode: 'solo', start: '09:00', durationMin: 30, icon: '🧮',
  steps: [{ id: 's1', label: 'Warm-up facts', done: false }], status: 'todo', curriculumId: 'c1', ...p,
});
const ctx = { children: [kid], curricula: [cur], parentName: 'Dana Miller' };

describe('worksheets', () => {
  it('labels the next lesson for curriculum-linked tasks', () => {
    expect(lessonLabel(task(), [cur])).toBe('Fraction Forest · Lesson 37 of 120');
    expect(lessonLabel(task({ status: 'done', lessonNo: 36 }), [cur])).toBe('Fraction Forest · Lesson 36 of 120');
    expect(lessonLabel(task({ curriculumId: undefined }), [cur])).toBeUndefined();
  });

  it('picks a work area for the subject and age', () => {
    expect(workAreaFor('math', 9)).toBe('grid');
    expect(workAreaFor('writing', 6)).toBe('primary');
    expect(workAreaFor('writing', 10)).toBe('lines');
    expect(workAreaFor('art', 10)).toBe('draw');
  });

  it('renders one escaped page per task, with a cover for a packet', () => {
    const one = worksheetHtml([task()], ctx);
    expect(one).toContain('Maya &lt;3');
    expect(one).toContain('Warm-up facts');
    expect(one).toContain('Lesson 37 of 120');
    expect(one.match(/class="sheet/g)).toHaveLength(1);
    const packet = worksheetHtml([task(), task({ id: 't2', title: 'Read aloud', subject: 'reading', start: '10:00', curriculumId: undefined })], ctx, 'Monday packet');
    expect(packet.match(/class="sheet/g)).toHaveLength(3);
    expect(packet).toContain('<title>Monday packet</title>');
  });

  it('prints answers and parent notes only on the separate answer key', () => {
    const planned: Curriculum = {
      ...cur,
      lessonsDone: 0,
      totalLessons: 1,
      outline: [{ id: 'u', title: 'Halves', lessons: [{ id: 'l1', title: 'Fold it', steps: [], links: [], questions: ['Half of 12?', 'Half of 7?'], answers: ['6'], notes: 'Use counters <b>' }] }],
    };
    const c2 = { ...ctx, curricula: [planned] };
    const sheet = worksheetHtml([task()], c2);
    expect(sheet).toContain('Half of 12?');
    expect(sheet).not.toContain('Use counters');
    expect(hasAnswerKey(task(), c2)).toBe(true);
    expect(hasAnswerKey(task({ curriculumId: undefined }), c2)).toBe(false);
    const key = answerKeyHtml([task(), task({ id: 't2', curriculumId: undefined })], c2);
    expect(key).toContain('<td class="ans">6</td>');
    expect(key).toContain('<span class="none">—</span>');
    expect(key).toContain('Use counters &lt;b&gt;');
    expect(key.match(/class="lesson"/g)).toHaveLength(1);
  });
});

describe('day stepping', () => {
  const school = (d: string) => [1, 2, 3, 4, 5].includes(weekdayOf(d));
  it('skips weekends in both directions', () => {
    expect(stepDay('2026-11-06', 1, school)).toBe('2026-11-09'); // Fri → Mon
    expect(stepDay('2026-11-09', -1, school)).toBe('2026-11-06'); // Mon → Fri
    expect(stepDay('2026-11-06', 1, () => false)).toBeUndefined();
  });
  it('validates date keys and labels nearby days', () => {
    expect(isDateKey('2026-11-06')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
    expect(relativeDayLabel('2026-11-05', '2026-11-06')).toBe('Yesterday');
    expect(relativeDayLabel('2026-11-07', '2026-11-06')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-11-09', '2026-11-06')).toBe('Monday, Nov 9');
  });
});
