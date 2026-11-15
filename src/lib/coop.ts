import { doneFor } from './curriculum';
import type { Involvement, Listing, PackageContent } from './market';
import { lessonTotal } from './package';
import type { Child, Curriculum, ID, Subject } from './types';

/**
 * Co-op classes: a teacher shares one Studio plan with a group of families
 * (up to 30). Each family schedules it at its own pace; the teacher sends new
 * versions, which reach families as plan updates, and sees how far each
 * family has got. Kids' names reach the teacher only if the family says so.
 */

export const MAX_FAMILIES = 30;

export interface CoopClass {
  id: ID;
  /** Invite code (the teacher sees it; families joined with it). */
  code?: string;
  title: string;
  teacherName: string;
  /** The teacher's Studio curriculum. */
  packageId?: ID;
  description: string;
  subjects: Subject[];
  gradeMin: number;
  gradeMax: number;
  lessonsPerWeek: number;
  minutesPerLesson: number;
  parentInvolvement: Involvement;
  familyStyle: boolean;
  cover: string;
  color: string;
  maxFamilies: number;
  status: 'open' | 'closed';
  /** Latest version sent to the class. */
  version: number;
  families: number;
  lessons?: number;
  /** This family is in it. */
  joined?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** One student, as the teacher sees them. */
export interface StudentProgress {
  /** Lessons finished. */
  done: number;
  /** Only when the family shares names. */
  name?: string;
}

export interface ClassMember {
  familyId: ID;
  label: string;
  shareNames: boolean;
  progress: StudentProgress[];
  totalLessons?: number;
  onVersion?: number;
  joinedAt: string;
  updatedAt: string;
}

export const coopKey = (classId: ID) => `coop:${classId}`;

export const normalizeClassCode = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** A class as a Marketplace-style listing, so it plans like any curriculum. */
export function classToListing(cls: CoopClass, content?: PackageContent): Listing {
  return {
    id: coopKey(cls.id),
    title: cls.title,
    seller: cls.teacherName,
    sellerKind: 'creator',
    sellerVerified: false,
    subjects: cls.subjects.length ? cls.subjects : ['other'],
    gradeMin: cls.gradeMin,
    gradeMax: cls.gradeMax,
    philosophies: [],
    format: 'digital',
    price: 0,
    description: cls.description,
    includes: [],
    lessons: (content ? lessonTotal(content.units) : 0) || cls.lessons || 1,
    lessonsPerWeek: cls.lessonsPerWeek,
    minutesPerLesson: cls.minutesPerLesson,
    parentInvolvement: cls.parentInvolvement,
    familyStyle: cls.familyStyle,
    lessonSteps: [],
    cover: cls.cover,
    color: cls.color,
    esaEligible: false,
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: cls.createdAt ?? new Date().toISOString(),
    packageId: cls.packageId,
    packageVersion: content?.version ?? cls.version,
    license: content?.license,
    attribution: content?.attribution,
  };
}

/** What this family reports for one class: lessons done per student, names only if shared. */
export function familyProgress(c: Curriculum, kids: Pick<Child, 'id' | 'name'>[], shareNames: boolean): StudentProgress[] {
  return c.childIds.map((id) => {
    const name = shareNames ? kids.find((k) => k.id === id)?.name?.split(' ')[0] : undefined;
    return name ? { done: doneFor(c, id), name } : { done: doneFor(c, id) };
  });
}

/** The furthest any student in the family has got. */
export const furthest = (p: StudentProgress[]) => p.reduce((a, s) => Math.max(a, s.done), 0);

/** "Student 2" when the family keeps names private. */
export const studentLabel = (s: StudentProgress, i: number) => s.name ?? `Student ${i + 1}`;

export interface RosterSummary {
  families: number;
  students: number;
  /** Average share of the plan finished, 0..1. */
  average: number;
  finished: number;
  /** Families that haven't reported any progress yet. */
  notStarted: number;
}

export function rosterSummary(members: ClassMember[], total: number): RosterSummary {
  const students = members.flatMap((m) => m.progress);
  const t = Math.max(1, total);
  return {
    families: members.length,
    students: students.length,
    average: students.length ? students.reduce((a, s) => a + Math.min(s.done, t) / t, 0) / students.length : 0,
    finished: students.filter((s) => s.done >= t).length,
    notStarted: members.filter((m) => furthest(m.progress) === 0).length,
  };
}
