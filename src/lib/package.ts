import { uid } from './id';
import { LICENSE_INFO, licenseName, licenseUrl, type License } from './license';
import type { Involvement, Listing, ListingFormat } from './market';
import type { ID, Philosophy, Subject } from './types';

/**
 * Freerange curriculum packages: a lesson-by-lesson plan made in Studio.
 *
 * Studio writes packages (from scratch, from a book's table of contents, a
 * spreadsheet, or a free course online); Compass schedules them so each day
 * shows that day's lesson — title, pages, links, steps, and worksheet
 * questions — instead of a generic block.
 */

export interface LessonLink {
  label: string;
  url: string;
}

export interface PackageLesson {
  id: ID;
  title: string;
  /** Overrides the curriculum's usual lesson length. */
  minutes?: number;
  /** What the kid does, in order. */
  steps: string[];
  /** "88–92" — pages in the book this lesson covers. */
  pages?: string;
  links: LessonLink[];
  /** Printed on the worksheet. */
  questions: string[];
  /** For the parent. */
  notes?: string;
}

export interface PackageUnit {
  id: ID;
  title: string;
  lessons: PackageLesson[];
}

/** Where a package came from — decides its license and whether it can be published. */
export type Origin =
  | { kind: 'original' }
  | { kind: 'owned_book'; title: string; publisher?: string }
  | { kind: 'open_web'; url: string; title: string; author?: string; retrievedAt: string; licenseDetected: boolean };

export interface CurriculumPackage {
  id: ID;
  title: string;
  description: string;
  subjects: Subject[];
  gradeMin: number;
  gradeMax: number;
  philosophies: Philosophy[];
  parentInvolvement: Involvement;
  familyStyle: boolean;
  minutesPerLesson: number;
  lessonsPerWeek: number;
  format: ListingFormat;
  cover: string;
  color: string;
  price: number;
  units: PackageUnit[];
  origin: Origin;
  license: License;
  /** The creator confirmed the source's license (online sources). */
  licenseConfirmed?: boolean;
  /** Credit line, set when published. */
  attribution?: string;
  status: 'draft' | 'published';
  /** Bumped every time it's published. */
  version: number;
  listingId?: ID;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export const ORIGIN_LABEL: Record<Origin['kind'], string> = {
  original: '✏️ Original',
  owned_book: '📕 My copy of a book',
  open_web: '🌐 Free online curriculum',
};

export function newLesson(title = '', p: Partial<PackageLesson> = {}): PackageLesson {
  return { id: uid('pl'), title, steps: [], links: [], questions: [], ...p };
}

export function newUnit(title = '', lessons: PackageLesson[] = []): PackageUnit {
  return { id: uid('pu'), title, lessons };
}

export function newPackage(p: Partial<CurriculumPackage> = {}): CurriculumPackage {
  const now = new Date().toISOString();
  return {
    id: uid('pk'),
    title: '',
    description: '',
    subjects: [],
    gradeMin: 1,
    gradeMax: 3,
    philosophies: [],
    parentInvolvement: 'medium',
    familyStyle: false,
    minutesPerLesson: 30,
    lessonsPerWeek: 3,
    format: 'digital',
    cover: '📘',
    color: '#2F6B5E',
    price: 0,
    units: [],
    origin: { kind: 'original' },
    license: { kind: 'all_rights_reserved' },
    status: 'draft',
    version: 0,
    createdAt: now,
    updatedAt: now,
    ...p,
  };
}

// ───────────────────────────── Lessons

export interface FlatLesson extends PackageLesson {
  unit: string;
  /** 1-based position in the whole curriculum. */
  n: number;
}

export function allLessons(units: PackageUnit[] = []): FlatLesson[] {
  let n = 0;
  return units.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u.title, n: ++n })));
}

export const lessonTotal = (units: PackageUnit[] = []) => units.reduce((a, u) => a + u.lessons.length, 0);

/** Lesson `n` (1-based), or undefined past the end. */
export function lessonAt(units: PackageUnit[] | undefined, n: number): FlatLesson | undefined {
  if (!units || n < 1) return undefined;
  let left = n;
  for (const u of units) {
    if (left <= u.lessons.length) return { ...u.lessons[left - 1], unit: u.title, n };
    left -= u.lessons.length;
  }
  return undefined;
}

/** Titles only — what anyone can see on the listing before buying. */
export function outlinePreview(units: PackageUnit[]): { title: string; lessons: string[] }[] {
  return units.map((u) => ({ title: u.title, lessons: u.lessons.map((l) => l.title) }));
}

// ───────────────────────────── Licensing

export interface PublishRules {
  canPublish: boolean;
  /** Non-commercial sources can only be shared for free. */
  mustBeFree: boolean;
  /** The license comes from the source and can't be changed. */
  licenseLocked: boolean;
  /** Why it can't be published, or what applies. */
  note: string;
}

export function publishRules(pkg: Pick<CurriculumPackage, 'origin' | 'license' | 'licenseConfirmed'>): PublishRules {
  const info = LICENSE_INFO[pkg.license.kind];
  switch (pkg.origin.kind) {
    case 'original':
      return { canPublish: true, mustBeFree: false, licenseLocked: false, note: 'Your own work: you choose the license and the price.' };
    case 'owned_book':
      return {
        canPublish: false,
        mustBeFree: false,
        licenseLocked: true,
        note: 'Made from a book you own, so it stays private to your family — the publisher holds the rights. Use it in your plan as much as you like.',
      };
    case 'open_web': {
      const locked = pkg.origin.licenseDetected;
      if (pkg.license.kind === 'unknown')
        return { canPublish: false, mustBeFree: false, licenseLocked: false, note: 'We couldn’t find a license on the source page. Check the source and choose its license to publish; until then it’s for your family only.' };
      if (pkg.license.kind === 'all_rights_reserved')
        return { canPublish: false, mustBeFree: false, licenseLocked: locked, note: 'The source is all rights reserved, so this adaptation stays private to your family.' };
      if (!info.adapt)
        return { canPublish: false, mustBeFree: false, licenseLocked: locked, note: `${licenseName(pkg.license)} doesn’t allow adapted versions to be shared. Use it in your own plan only.` };
      if (!pkg.licenseConfirmed)
        return { canPublish: false, mustBeFree: !info.commercial, licenseLocked: locked, note: 'Confirm the source’s license before publishing.' };
      return {
        canPublish: true,
        mustBeFree: !info.commercial,
        licenseLocked: locked,
        note: `Shared under the source’s license, ${licenseName(pkg.license)}${!info.commercial ? ' — non-commercial, so it must be free' : ''}${info.shareAlike ? '; anyone may adapt it again under the same license' : ''}.`,
      };
    }
  }
}

/** The credit line shown on the listing, the curriculum, and printed worksheets. */
export function attributionFor(pkg: Pick<CurriculumPackage, 'origin' | 'license' | 'title'>, creator?: string): string | undefined {
  const lic = licenseName(pkg.license);
  const url = licenseUrl(pkg.license);
  if (pkg.origin.kind === 'open_web') {
    const o = pkg.origin;
    const by = o.author ? ` by ${o.author}` : '';
    const under = pkg.license.kind === 'unknown' ? '' : `, ${pkg.license.kind === 'public_domain' ? 'in the public domain' : `licensed under ${lic}${url ? ` (${url})` : ''}`}`;
    return `Adapted from “${o.title}”${by} (${o.url})${under}.${creator ? ` Organized into lessons by ${creator}.` : ''}`;
  }
  if (pkg.origin.kind === 'owned_book') return `Lesson plan for “${pkg.origin.title}”${pkg.origin.publisher ? ` (${pkg.origin.publisher})` : ''}. For personal family use.`;
  if (pkg.license.kind === 'all_rights_reserved') return creator ? `© ${creator}` : undefined;
  return `“${pkg.title}”${creator ? ` by ${creator}` : ''}, ${pkg.license.kind === 'cc0' ? 'dedicated to the public domain (CC0)' : `licensed under ${lic}${url ? ` (${url})` : ''}`}.`;
}

// ───────────────────────────── Publishing

/** What's still missing before a package can go on the Marketplace. */
export function publishIssues(pkg: CurriculumPackage): string[] {
  const rules = publishRules(pkg);
  const lessons = allLessons(pkg.units);
  return [
    !rules.canPublish && rules.note,
    !pkg.title.trim() && 'a title',
    pkg.description.trim().length < 20 && 'a description (20+ characters)',
    !pkg.subjects.length && 'a subject',
    !lessons.length && 'at least one lesson',
    lessons.some((l) => !l.title.trim()) && 'a title for every lesson',
    pkg.units.some((u) => !u.title.trim()) && 'a name for every unit',
    pkg.gradeMin > pkg.gradeMax && 'a grade range that runs low to high',
    rules.mustBeFree && pkg.price > 0 && 'a price of $0 (the source is non-commercial)',
    !(pkg.price >= 0 && pkg.price <= 10000) && 'a price between $0 and $10,000',
  ].filter((x): x is string => !!x);
}

/** The Marketplace listing for a package (its full lessons are delivered on purchase). */
export function packageToListing(pkg: CurriculumPackage, seller: string, existing?: Listing): Listing {
  const lessons = lessonTotal(pkg.units);
  const firstSteps = allLessons(pkg.units).find((l) => l.steps.length)?.steps ?? [];
  return {
    id: pkg.listingId ?? existing?.id ?? uid('l'),
    title: pkg.title.trim(),
    seller,
    sellerKind: 'creator',
    sellerVerified: false,
    subjects: pkg.subjects,
    gradeMin: pkg.gradeMin,
    gradeMax: pkg.gradeMax,
    philosophies: pkg.philosophies,
    format: pkg.format,
    price: publishRules(pkg).mustBeFree ? 0 : pkg.price,
    description: pkg.description.trim(),
    includes: [`${lessons} lessons in ${pkg.units.length} unit${pkg.units.length === 1 ? '' : 's'}`, 'Lesson-by-lesson plan that schedules into Freerange', ...(allLessons(pkg.units).some((l) => l.questions.length) ? ['Printable worksheet questions'] : [])],
    lessons,
    lessonsPerWeek: pkg.lessonsPerWeek,
    minutesPerLesson: pkg.minutesPerLesson,
    parentInvolvement: pkg.parentInvolvement,
    familyStyle: pkg.familyStyle,
    lessonSteps: firstSteps,
    cover: pkg.cover,
    color: pkg.color,
    esaEligible: false,
    ratingAvg: existing?.ratingAvg ?? 0,
    ratingCount: existing?.ratingCount ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    packageId: pkg.id,
    license: pkg.license,
    attribution: attributionFor(pkg, seller),
    outline: outlinePreview(pkg.units),
    mine: true,
  };
}
