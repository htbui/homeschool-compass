import { describe, expect, it } from 'vitest';

import { lessonFor, setVersionPick, withLessons } from '../curriculum';
import { lessonVersion, newLesson, newPackage, newUnit, packageToListing, planLevels, planThemes, versionLabel, type PackageUnit } from '../package';
import { applyPlanUpdate } from '../planUpdate';
import type { Child, Curriculum, Task } from '../types';
import { answerKeyHtml, worksheetHtml } from '../worksheet';

const fossils = {
  ...newLesson('Fossils', { steps: ['Read page 4', 'Draw a fossil'], questions: ['What is a fossil?'], answers: ['Old remains in rock'] }),
  id: 'l1',
  versions: {
    easier: { steps: ['Look at the fossil picture', 'Trace it'], questions: [] },
    harder: { steps: [], questions: ['How do fossils form?', 'Name two kinds'], answers: ['Layers of mud harden', ''] },
  },
  themes: [{ theme: 'Dinosaurs', steps: ['Dig up a toy dinosaur', 'Draw its bones'], questions: [] }],
};
const units: PackageUnit[] = [{ ...newUnit('Rocks', [fossils, { ...newLesson('Crystals'), id: 'l2' }]), id: 'u1' }];

const kid: Child = { id: 'k1', name: 'Maya', birthdate: '2017-05-21', grade: '4th Grade', avatar: '🦊', color: '#f00', learningDifferences: [], passions: [], soloToleranceMin: 20, sparks: 0 };
const cur = (p: Partial<Curriculum> = {}): Curriculum => ({
  id: 'c1', name: 'Rock Detectives', subject: 'science', childIds: ['k1', 'k2'], totalLessons: 2, lessonsDone: 0, progress: { k1: 0, k2: 0 },
  startDate: '2026-08-17', targetEndDate: '2027-05-28', schoolDays: [1, 2, 3, 4, 5], model: 'modular', outline: units, listingId: 'lst', ...p,
});
const task = (p: Partial<Task> = {}): Task => ({
  id: 't1', childId: 'k1', date: '2026-11-09', title: 'Rocks', subject: 'science', mode: 'solo', start: '09:00', durationMin: 30, icon: '🪨',
  steps: [], status: 'todo', curriculumId: 'c1', ...p,
});

describe('lesson versions', () => {
  it('uses theme, then level, then the main lesson, field by field', () => {
    expect(lessonVersion(fossils)).toBe(fossils);
    expect(lessonVersion(fossils, { level: 'easier' }).steps).toEqual(['Look at the fossil picture', 'Trace it']);
    // Easier has no questions of its own: the main ones (and their answers) stay.
    expect(lessonVersion(fossils, { level: 'easier' }).questions).toEqual(['What is a fossil?']);
    const hard = lessonVersion(fossils, { level: 'harder' });
    expect([hard.steps, hard.questions, hard.answers]).toEqual([fossils.steps, ['How do fossils form?', 'Name two kinds'], ['Layers of mud harden', '']]);
    const dinoHard = lessonVersion(fossils, { level: 'harder', theme: 'dinosaurs' });
    expect(dinoHard.steps).toEqual(['Dig up a toy dinosaur', 'Draw its bones']);
    expect(dinoHard.questions[0]).toBe('How do fossils form?');
    expect(dinoHard.applied).toEqual({ level: 'harder', theme: 'Dinosaurs' });
    // A theme this lesson doesn't have: the main lesson, nothing claimed.
    expect(lessonVersion(units[0].lessons[1], { theme: 'Space' }).applied).toBeUndefined();
    expect(versionLabel(dinoHard.applied)).toBe('🎨 Dinosaurs · 🚀 Harder version');
  });

  it('lists the levels and themes a plan offers', () => {
    expect(planLevels(units)).toEqual(['easier', 'harder']);
    expect(planThemes(units)).toEqual(['Dinosaurs']);
    expect(planThemes([{ ...units[0], lessons: [{ ...fossils, themes: [{ theme: ' dinosaurs ', steps: ['x'], questions: [] }, { theme: 'Space', steps: ['y'], questions: [] }] }, fossils] }])).toEqual(['dinosaurs', 'Space']);
  });

  it('shows each child their own version in kid mode and on worksheets', () => {
    const c = cur({ versionPicks: { k1: { theme: 'Dinosaurs' }, k2: { level: 'harder' } } });
    expect(lessonFor(task(), [c])?.steps[0]).toBe('Dig up a toy dinosaur');
    expect(lessonFor(task({ childId: 'k2' }), [c])?.questions).toHaveLength(2);
    const filled = withLessons([task(), task({ id: 't2', childId: 'k2' })], [c], '2026-11-09');
    expect(filled[0].steps.map((s) => s.label)).toEqual(['Dig up a toy dinosaur', 'Draw its bones']);
    expect(filled[1].steps.map((s) => s.label)).toEqual(['Read page 4', 'Draw a fossil']);
    const ctx = { children: [kid, { ...kid, id: 'k2', name: 'Theo' }], curricula: [c] };
    const sheet = worksheetHtml([filled[1]], ctx);
    expect(sheet).toContain('How do fossils form?');
    expect(sheet).toContain('Harder version');
    expect(sheet).not.toContain('Layers of mud');
    expect(answerKeyHtml([filled[1]], ctx)).toContain('Layers of mud harden');
  });

  it('refills a child’s not-started lessons when their version changes', () => {
    const c = cur();
    const tasks = withLessons([task(), task({ id: 't2', childId: 'k2' }), task({ id: 't3', status: 'done', lessonId: 'l1' })], [c], '2026-11-09');
    const { curriculum, tasks: out } = setVersionPick(c, tasks, 'k1', { level: 'easier', theme: undefined });
    expect(curriculum.versionPicks).toEqual({ k1: { level: 'easier' } });
    expect(out[0].lessonId).toBeUndefined();
    expect(out[1].lessonId).toBe('l1'); // the other child is untouched
    expect(out[2].lessonId).toBe('l1'); // finished work keeps its lesson
    expect(withLessons(out, [curriculum], '2026-11-09')[0].steps[0].label).toBe('Look at the fossil picture');
  });

  it('keeps picks through a plan update and falls back when a theme goes away', () => {
    const c = cur({ versionPicks: { k1: { theme: 'Dinosaurs' } } });
    const next = [{ ...units[0], lessons: [{ ...fossils, themes: undefined }, units[0].lessons[1]] }];
    const { curriculum } = applyPlanUpdate(c, [], { units: next, version: 2 });
    expect(curriculum.versionPicks).toEqual({ k1: { theme: 'Dinosaurs' } });
    expect(lessonFor(task(), [curriculum])?.steps).toEqual(fossils.steps);
  });

  it('tells families about versions on the listing, and keeps them in the package', () => {
    const pkg = newPackage({ title: 'Rock Detectives', units });
    const l = packageToListing(pkg, 'Maple');
    expect(l.includes).toContain('Easier and Harder versions of lessons');
    expect(l.includes).toContain('Themed versions: Dinosaurs');
    // Published content is the units as-is, so versions travel with it.
    expect(JSON.parse(JSON.stringify(pkg.units))[0].lessons[0].themes[0].theme).toBe('Dinosaurs');
  });
});
