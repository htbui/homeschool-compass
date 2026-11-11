import type { Listing, PackageContent } from './market';
import { attributionFor, lessonTotal, outlinePreview, type PackageLesson, type PackageUnit } from './package';

/**
 * Sample lesson-by-lesson packages for the sample catalog, so the Studio →
 * Marketplace → daily lesson flow works before real creators publish.
 * Creators, sources, and content are fictional (example.org is a reserved
 * test domain).
 */

const L = (id: string, title: string, p: Partial<PackageLesson> = {}): PackageLesson => ({ id, title, steps: [], links: [], questions: [], ...p });

const NATURE: PackageUnit[] = [
  {
    id: 'nj-u1',
    title: 'Week 1: Getting started',
    lessons: [
      L('nj-1', 'Your first journal page', { steps: ['Pick a sit spot outside', 'Sketch one thing for 10 minutes', 'Write the date, place, and weather'], questions: ['What surprised you today?'] }),
      L('nj-2', 'Leaves up close', { steps: ['Collect three different leaves', 'Trace and sketch them', 'Label the edges and veins'], questions: ['How are your leaves alike? How are they different?'] }),
    ],
  },
  {
    id: 'nj-u2',
    title: 'Week 2: Looking closer',
    lessons: [
      L('nj-3', 'Bark rubbings', { steps: ['Find two trees', 'Make a crayon rubbing of each', 'Sketch each tree’s shape'], questions: ['Which bark felt roughest?'] }),
      L('nj-4', 'Birds at the window', { steps: ['Watch a feeder or window for 15 minutes', 'Tally each bird you see', 'Sketch one bird'] }),
    ],
  },
  {
    id: 'nj-u3',
    title: 'Week 3: Weather and sky',
    lessons: [
      L('nj-5', 'Cloud watching', { steps: ['Lie back and watch the clouds', 'Sketch three cloud shapes', 'Note the wind and temperature'] }),
      L('nj-6', 'Shadows through the day', { steps: ['Trace a stick’s shadow in the morning', 'Trace it again at noon and afternoon', 'Draw the three shadows'], questions: ['Why did the shadow change?'] }),
    ],
  },
  {
    id: 'nj-u4',
    title: 'Week 4: Your place',
    lessons: [
      L('nj-7', 'A sit spot, revisited', { steps: ['Return to your first sit spot', 'Sketch what changed', 'Compare with your first page'] }),
      L('nj-8', 'Make a nature map', { steps: ['Walk your yard or park', 'Draw a map with your favorite spots', 'Add a key'], questions: ['What do you want to watch next month?'] }),
    ],
  },
];

const FRACTIONS: PackageUnit[] = [
  {
    id: 'fw-u1',
    title: 'Unit 1: Halves and wholes',
    lessons: [
      L('fw-1', 'Fold it in half', { minutes: 25, steps: ['Fold paper shapes in half', 'Color one half', 'Write ½ on each'], questions: ['Draw a shape that is NOT cut in half.'], answers: ['Any shape split into two unequal parts'], notes: 'Let them check by folding: halves match exactly when folded.' }),
      L('fw-2', 'Fair shares', { steps: ['Share 8 crackers between 2 people', 'Share 8 between 4', 'Draw what you did'] }),
      L('fw-3', 'Half of a number', { steps: ['Use counters to find half of 6, 10, 14', 'Find half of an odd number — what happens?'], questions: ['What is half of 12?', 'What is half of 20?'], answers: ['6', '10'] }),
    ],
  },
  {
    id: 'fw-u2',
    title: 'Unit 2: Thirds, fourths, and more',
    lessons: [
      L('fw-4', 'Pizza fractions', { steps: ['Cut a paper pizza into 4 slices', 'Name each slice ¼', 'Eat (pretend!) 3 slices'], questions: ['How much pizza is left?'] }),
      L('fw-5', 'Thirds with string', { steps: ['Fold string into thirds', 'Measure each part'] }),
      L('fw-6', 'Fraction strips', { steps: ['Make strips for ½, ⅓, ¼, ⅙, ⅛', 'Line them up', 'Glue them into your notebook'] }),
      L('fw-7', 'Which is bigger?', { steps: ['Compare fractions with your strips', 'Play the “bigger fraction” card game'], questions: ['Which is bigger, ⅓ or ¼?', 'Which is bigger, ½ or ⅝?'] }),
    ],
  },
  {
    id: 'fw-u3',
    title: 'Unit 3: Equal fractions',
    lessons: [
      L('fw-8', 'Same size, different names', { steps: ['Find strips equal to ½', 'Write the matching fractions'], questions: ['Name two fractions equal to ½.'] }),
      L('fw-9', 'Fractions in the kitchen', { steps: ['Measure ½ cup using ¼ cups', 'Measure ¾ cup two ways'] }),
      L('fw-10', 'Fraction number line', { steps: ['Draw a line from 0 to 1', 'Mark halves, fourths, eighths'] }),
      L('fw-11', 'Fraction story problems', { steps: ['Read each story', 'Draw a picture', 'Solve'], questions: ['Mia ate ⅜ of a pie and Leo ate ⅛. How much did they eat together?'] }),
      L('fw-12', 'Show what you know', { steps: ['Make a fraction poster', 'Teach a grown-up one thing you learned'] }),
    ],
  },
];

const GARDEN_SOURCE = { kind: 'open_web' as const, url: 'https://example.org/open-garden-science', title: 'Open Garden Science', author: 'Open Garden Project', retrievedAt: '2026-10-01T00:00:00.000Z', licenseDetected: true };
const GARDEN_LICENSE = { kind: 'cc_by_nc_sa' as const, version: '4.0' };
const GARDEN: PackageUnit[] = [
  {
    id: 'gs-u1',
    title: 'Seeds',
    lessons: [
      L('gs-1', 'What’s inside a seed?', { links: [{ label: 'Open lesson', url: 'https://example.org/open-garden-science/seeds-inside' }], steps: ['Soak a bean overnight', 'Split it open', 'Sketch the parts'] }),
      L('gs-2', 'Sprouting in a jar', { links: [{ label: 'Open lesson', url: 'https://example.org/open-garden-science/sprouting' }], steps: ['Set up the jar', 'Check daily and draw'] }),
    ],
  },
  {
    id: 'gs-u2',
    title: 'Soil and roots',
    lessons: [
      L('gs-3', 'Soil detectives', { links: [{ label: 'Open lesson', url: 'https://example.org/open-garden-science/soil' }], steps: ['Shake soil in a jar of water', 'Wait an hour', 'Draw the layers'] }),
      L('gs-4', 'Root view window', { links: [{ label: 'Open lesson', url: 'https://example.org/open-garden-science/roots' }], steps: ['Plant a bean against a clear cup', 'Measure the root each day'] }),
    ],
  },
];

interface SamplePackage {
  listing: Listing;
  content: PackageContent;
}

function samplePackage(listing: Omit<Listing, 'lessons' | 'outline' | 'packageId' | 'sample'>, units: PackageUnit[], extra: Pick<PackageContent, 'license' | 'attribution'>): SamplePackage {
  return {
    listing: { ...listing, lessons: lessonTotal(units), outline: outlinePreview(units), packageId: `pk-${listing.id}`, sample: true, license: extra.license, attribution: extra.attribution },
    content: { units, version: 1, ...extra },
  };
}

const days = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

/** Creator listings that only exist in the sample catalog. */
export function sampleStudioListings(): SamplePackage[] {
  return [
    samplePackage(
      {
        id: 'l-fractions-workshop',
        title: 'Fractions Workshop: Hands-On Fractions',
        seller: 'Maple Room Studio',
        sellerKind: 'creator',
        sellerVerified: false,
        subjects: ['math'],
        gradeMin: 2,
        gradeMax: 4,
        philosophies: ['montessori', 'unit_study', 'traditional'],
        format: 'digital',
        price: 9,
        description: 'Twelve hands-on lessons that build fractions from folding paper to story problems. Every lesson has a kid checklist and printable questions, made in Freerange Studio.',
        includes: ['12 lessons in 3 units', 'Lesson-by-lesson plan that schedules into Freerange', 'Printable worksheet questions'],
        lessonsPerWeek: 3,
        minutesPerLesson: 30,
        parentInvolvement: 'medium',
        familyStyle: false,
        lessonSteps: [],
        cover: '🍕',
        color: '#E3A33B',
        esaEligible: false,
        ratingAvg: 0,
        ratingCount: 0,
        createdAt: days(9),
      },
      FRACTIONS,
      { license: { kind: 'cc_by', version: '4.0', holder: 'Maple Room Studio' }, attribution: '“Fractions Workshop” by Maple Room Studio, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).' },
    ),
    samplePackage(
      {
        id: 'l-open-garden',
        title: 'Open Garden Science (lesson plan)',
        seller: 'Juniper & Co. Learning',
        sellerKind: 'creator',
        sellerVerified: false,
        subjects: ['science'],
        gradeMin: 1,
        gradeMax: 5,
        philosophies: ['nature_forest', 'unit_study'],
        format: 'online',
        price: 0,
        description: 'A free online garden science course, organized into a ready-to-schedule plan with kid checklists. Adapted under the source’s Creative Commons license.',
        includes: ['4 lessons in 2 units', 'Lesson-by-lesson plan that schedules into Freerange'],
        lessonsPerWeek: 2,
        minutesPerLesson: 35,
        parentInvolvement: 'medium',
        familyStyle: true,
        lessonSteps: [],
        cover: '🌻',
        color: '#3D9970',
        esaEligible: false,
        ratingAvg: 0,
        ratingCount: 0,
        createdAt: days(3),
      },
      GARDEN,
      { license: GARDEN_LICENSE, attribution: attributionFor({ title: 'Open Garden Science', origin: GARDEN_SOURCE, license: GARDEN_LICENSE }, 'Juniper & Co. Learning') },
    ),
  ];
}

/** Sample publisher listings that also come with a full lesson plan. */
export const SAMPLE_OUTLINES: Record<string, PackageContent> = {
  'l-free-nature-journal': { units: NATURE, version: 1, license: { kind: 'all_rights_reserved', holder: 'Pinecone Science Co.' } },
};

export function sampleContent(listingId: string): PackageContent | undefined {
  return SAMPLE_OUTLINES[listingId] ?? sampleStudioListings().find((p) => p.listing.id === listingId)?.content;
}
