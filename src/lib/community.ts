import type { Philosophy } from './types';

/**
 * Privacy-first family matching. Exact locations never leave a device: the
 * server (future) only stores a coarse geocell, and clients only ever see a
 * distance *band*, never a raw distance or address.
 */

export const DISTANCE_BANDS = [2, 5, 10, 25, 50] as const;

/** Bucket a raw distance into a display band like "within 5 mi". */
export function distanceBand(miles: number): string {
  const band = DISTANCE_BANDS.find((b) => miles <= b);
  return band ? `within ${band} mi` : '50+ mi';
}

/**
 * Snap coordinates to a ~1.5 mile grid so two nearby families are
 * indistinguishable, then compute distance between cells.
 */
export function fuzzCoord(lat: number, lng: number, cellDeg = 0.02): [number, number] {
  const snap = (v: number) => Math.round(v / cellDeg) * cellDeg;
  return [snap(lat), snap(lng)];
}

export function haversineMiles(a: [number, number], b: [number, number]): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface FamilyCard {
  id: string;
  displayName: string; // first-name + initial only
  kidAges: number[];
  philosophies: Philosophy[];
  interests: string[];
  distanceMiles: number;
  verified: boolean;
}

export interface FamilyFilter {
  maxMiles: number;
  ageMin?: number;
  ageMax?: number;
  philosophy?: Philosophy;
  interest?: string;
}

export function matchFamilies(cards: FamilyCard[], f: FamilyFilter, myInterests: string[] = []): (FamilyCard & { band: string; score: number })[] {
  return cards
    .filter((c) => c.distanceMiles <= f.maxMiles)
    .filter((c) => f.ageMin === undefined || c.kidAges.some((a) => a >= f.ageMin! && a <= (f.ageMax ?? 99)))
    .filter((c) => !f.philosophy || c.philosophies.includes(f.philosophy))
    .filter((c) => !f.interest || c.interests.some((i) => i.toLowerCase().includes(f.interest!.toLowerCase())))
    .map((c) => {
      const shared = c.interests.filter((i) => myInterests.map((m) => m.toLowerCase()).includes(i.toLowerCase())).length;
      const score = shared * 2 + (c.verified ? 1 : 0) - c.distanceMiles / 10;
      return { ...c, band: distanceBand(c.distanceMiles), score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Sample network shown until the Kinship community service is connected. */
export const SAMPLE_FAMILIES: FamilyCard[] = [
  { id: 'f1', displayName: 'Sarah K.', kidAges: [6, 9], philosophies: ['charlotte_mason', 'nature_forest'], interests: ['nature journaling', 'birds', 'read-alouds'], distanceMiles: 1.8, verified: true },
  { id: 'f2', displayName: 'Marcus T.', kidAges: [8, 10, 13], philosophies: ['classical'], interests: ['latin', 'chess', 'history'], distanceMiles: 4.2, verified: true },
  { id: 'f3', displayName: 'Priya R.', kidAges: [5], philosophies: ['montessori'], interests: ['art', 'gardening'], distanceMiles: 3.1, verified: false },
  { id: 'f4', displayName: 'Jenna & Luis M.', kidAges: [7, 11], philosophies: ['unit_study', 'faith_based'], interests: ['robotics', 'space', 'baseball'], distanceMiles: 8.7, verified: true },
  { id: 'f5', displayName: 'Anh N.', kidAges: [12, 14], philosophies: ['traditional'], interests: ['coding', 'robotics', 'debate'], distanceMiles: 6.5, verified: true },
  { id: 'f6', displayName: 'Hannah W.', kidAges: [4, 6, 8], philosophies: ['nature_forest', 'unschooling'], interests: ['hiking', 'bugs', 'dinosaurs'], distanceMiles: 12.4, verified: false },
  { id: 'f7', displayName: 'Tomás G.', kidAges: [9], philosophies: ['unschooling'], interests: ['minecraft', 'dinosaurs', 'cooking'], distanceMiles: 2.6, verified: true },
  { id: 'f8', displayName: 'Rachel B.', kidAges: [10, 13, 16], philosophies: ['classical', 'faith_based'], interests: ['creative writing', 'theater', 'history'], distanceMiles: 19.0, verified: true },
];
