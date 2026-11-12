import type { License } from '../license';
import type { Involvement, Listing, PackageContent } from '../market';
import { lessonTotal, outlinePreview, type PackageUnit } from '../package';
import type { Philosophy, Subject } from '../types';

/**
 * The Freerange Library: free curricula converted into lesson-by-lesson
 * plans. Only works anyone may adapt and share, even commercially (public
 * domain, CC0, CC BY, CC BY-SA), each credited to its source. It's the
 * catalog in local-only mode and is loaded into the live Marketplace too.
 */

export interface LibraryLesson {
  title: string;
  steps: string[];
  links: { label: string; url: string }[];
  pages?: string;
  questions: string[];
  answers?: string[];
  notes?: string;
}

export interface LibraryEntry {
  key: string;
  /** Bump after changing the lessons, so families who have it get an update. */
  version?: number;
  title: string;
  sourceTitle: string;
  author: string;
  year: number;
  /** The work's home page (Project Gutenberg, the publisher's site). */
  sourceUrl: string;
  license: License;
  /** Where the license was checked (kept with the data, not shown). */
  licenseEvidence?: string;
  /** The full text on one page, when there is one. */
  readUrl?: string;
  /** Credit line the source asks for; built from the fields above when missing. */
  attribution?: string;
  subjects: Subject[];
  gradeMin: number;
  gradeMax: number;
  philosophies: Philosophy[];
  lessonsPerWeek: number;
  minutesPerLesson: number;
  parentInvolvement: Involvement;
  familyStyle: boolean;
  cover: string;
  color: string;
  description: string;
  includes: string[];
  units: { title: string; lessons: LibraryLesson[] }[];
}

export const LIBRARY_SELLER = 'Freerange Library';
/** Library listings keep a fixed date so the seed and the app agree. */
const LISTED_AT = '2026-11-11T12:00:00.000Z';

export const libraryId = (key: string) => `l-lib-${key}`;

/** Lessons get ids from their position, so a re-conversion keeps everyone's place. */
export function libraryUnits(e: LibraryEntry): PackageUnit[] {
  return e.units.map((u, ui) => ({
    id: `${e.key}-u${ui + 1}`,
    title: u.title,
    lessons: u.lessons.map((l, li) => ({ id: `${e.key}-${ui + 1}-${li + 1}`, ...l, links: l.links ?? [], questions: l.questions ?? [], steps: l.steps ?? [] })),
  }));
}

export function libraryAttribution(e: Omit<LibraryEntry, 'units'>): string {
  if (e.attribution) return e.attribution;
  const source = `“${e.sourceTitle}” by ${e.author} (${e.year})`;
  return e.license.kind === 'public_domain'
    ? `Lesson plan by ${LIBRARY_SELLER} for ${source}, in the public domain. Free full text: ${e.sourceUrl}`
    : `Adapted from ${source}, ${e.sourceUrl}. Organized into lessons by ${LIBRARY_SELLER}.`;
}

/** What the app bundles for each entry: everything but the lessons themselves. */
export type CatalogEntry = Omit<LibraryEntry, 'units'> & { lessons: number; outline: NonNullable<Listing['outline']> };

export function catalogEntry(e: LibraryEntry): CatalogEntry {
  const { units: _units, ...meta } = e;
  const units = libraryUnits(e);
  return { ...meta, lessons: lessonTotal(units), outline: outlinePreview(units) };
}

export function libraryListing(e: CatalogEntry): Listing {
  return {
    id: libraryId(e.key),
    title: e.title,
    seller: LIBRARY_SELLER,
    sellerKind: 'publisher',
    sellerVerified: true,
    subjects: e.subjects,
    gradeMin: e.gradeMin,
    gradeMax: e.gradeMax,
    philosophies: e.philosophies,
    format: 'online',
    price: 0,
    description: e.description,
    includes: e.includes,
    lessons: e.lessons,
    lessonsPerWeek: e.lessonsPerWeek,
    minutesPerLesson: e.minutesPerLesson,
    parentInvolvement: e.parentInvolvement,
    familyStyle: e.familyStyle,
    lessonSteps: [],
    cover: e.cover,
    color: e.color,
    esaEligible: false,
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: LISTED_AT,
    packageId: `pk-lib-${e.key}`,
    packageVersion: e.version ?? 1,
    license: e.license,
    attribution: libraryAttribution(e),
    outline: e.outline,
  };
}

export function libraryContent(e: LibraryEntry): PackageContent {
  return { units: libraryUnits(e), version: e.version ?? 1, license: e.license, attribution: libraryAttribution(e) };
}
