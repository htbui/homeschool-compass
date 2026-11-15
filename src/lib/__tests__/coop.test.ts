import { describe, expect, it } from 'vitest';

import { classToListing, familyProgress, furthest, normalizeClassCode, rosterSummary, studentLabel, type ClassMember, type CoopClass } from '../coop';
import { formatGiftCode, isEmail, normalizeGiftCode, randomCode } from '../gifts';
import { planFromListing } from '../market';
import type { Curriculum } from '../types';

const cls: CoopClass = {
  id: 'cc1', code: 'ABCD2345', title: 'Pond Life Co-op', teacherName: 'Ms T', packageId: 'pk1', description: 'Frogs', subjects: ['science'], gradeMin: 1, gradeMax: 3,
  lessonsPerWeek: 2, minutesPerLesson: 40, parentInvolvement: 'high', familyStyle: true, cover: '🐸', color: '#000', maxFamilies: 30, status: 'open', version: 3, families: 4, lessons: 12,
};
const units = [{ id: 'u1', title: 'Frogs', lessons: [1, 2, 3].map((n) => ({ id: `l${n}`, title: `Lesson ${n}`, steps: [], links: [], questions: [] })) }];
const cur = (p: Partial<Curriculum> = {}): Curriculum => ({
  id: 'c1', name: 'Pond', subject: 'science', childIds: ['k1', 'k2'], totalLessons: 3, lessonsDone: 0, progress: { k1: 2, k2: 1 }, startDate: '2026-11-16', targetEndDate: '2027-01-01',
  schoolDays: [1, 3], model: 'modular', ...p,
});

describe('co-op classes', () => {
  it('plan like a listing, with the class’s lessons', () => {
    const l = classToListing(cls, { units, version: 3 });
    expect(l).toMatchObject({ id: 'coop:cc1', seller: 'Ms T', price: 0, lessons: 3, packageId: 'pk1', packageVersion: 3, familyStyle: true });
    expect(classToListing(cls).lessons).toBe(12);
    const { curriculum, blocks } = planFromListing(l, { childIds: ['k1', 'k2'], startDate: '2026-11-16', days: [1, 3], startTime: '09:00', children: [] }, { units, version: 3 });
    expect(curriculum).toMatchObject({ totalLessons: 3, packageVersion: 3, outline: units });
    expect(blocks).toHaveLength(1);
  });

  it('report lessons done per student, names only when shared', () => {
    const kids = [{ id: 'k1', name: 'Ava Rivera' }, { id: 'k2', name: 'Ben' }];
    expect(familyProgress(cur(), kids, false)).toEqual([{ done: 2 }, { done: 1 }]);
    expect(familyProgress(cur(), kids, true)).toEqual([{ done: 2, name: 'Ava' }, { done: 1, name: 'Ben' }]);
    expect(furthest([{ done: 2 }, { done: 5 }])).toBe(5);
    expect(studentLabel({ done: 1 }, 1)).toBe('Student 2');
    expect(normalizeClassCode(' abcd-2345 ')).toBe('ABCD2345');
  });

  it('summarize the roster', () => {
    const m = (progress: ClassMember['progress']): ClassMember => ({ familyId: 'f', label: 'F', shareNames: false, progress, joinedAt: '', updatedAt: '' });
    expect(rosterSummary([m([{ done: 10 }, { done: 5 }]), m([{ done: 0 }])], 10)).toEqual({ families: 2, students: 3, average: 0.5, finished: 1, notStarted: 1 });
    expect(rosterSummary([], 10)).toEqual({ families: 0, students: 0, average: 0, finished: 0, notStarted: 0 });
  });
});

describe('gift codes', () => {
  it('are easy to type and read', () => {
    const code = randomCode(10);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(formatGiftCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(normalizeGiftCode('abcde-fghjk ')).toBe('ABCDEFGHJK');
    expect(isEmail('grandma@example.com')).toBe(true);
    expect(isEmail('grandma@example')).toBe(false);
  });
});
