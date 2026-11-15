import { allLessons } from './package';
import { getStateLaw } from './states';
import { subjectLabel } from './subjects';
import type { Curriculum, RhythmBlock, Subject } from './types';

/**
 * Standards tags on lessons, and what subjects a family's plan covers.
 *
 * Creators tag lessons with any code (free text: a state's own standards,
 * TEKS, NGSS…) or pick from a small built-in list of Common Core math
 * domains and ELA strands. No standards database is downloaded: codes are
 * plain strings, and only the built-in ones are recognized for their subject.
 */

export interface Strand {
  /** "NF", "RL"… */
  code: string;
  label: string;
  framework: 'math' | 'ela';
  subject: Subject;
  /** Grades it's written for (0 = K). */
  grades: [number, number];
}

export const STRANDS: Strand[] = [
  { code: 'CC', label: 'Counting & Cardinality', framework: 'math', subject: 'math', grades: [0, 0] },
  { code: 'OA', label: 'Operations & Algebraic Thinking', framework: 'math', subject: 'math', grades: [0, 5] },
  { code: 'NBT', label: 'Number & Operations in Base Ten', framework: 'math', subject: 'math', grades: [0, 5] },
  { code: 'NF', label: 'Fractions', framework: 'math', subject: 'math', grades: [3, 5] },
  { code: 'MD', label: 'Measurement & Data', framework: 'math', subject: 'math', grades: [0, 5] },
  { code: 'G', label: 'Geometry', framework: 'math', subject: 'math', grades: [0, 8] },
  { code: 'RP', label: 'Ratios & Proportions', framework: 'math', subject: 'math', grades: [6, 7] },
  { code: 'NS', label: 'The Number System', framework: 'math', subject: 'math', grades: [6, 8] },
  { code: 'EE', label: 'Expressions & Equations', framework: 'math', subject: 'math', grades: [6, 8] },
  { code: 'F', label: 'Functions', framework: 'math', subject: 'math', grades: [8, 8] },
  { code: 'SP', label: 'Statistics & Probability', framework: 'math', subject: 'math', grades: [6, 8] },
  { code: 'RL', label: 'Reading: Literature', framework: 'ela', subject: 'reading', grades: [0, 12] },
  { code: 'RI', label: 'Reading: Informational Text', framework: 'ela', subject: 'reading', grades: [0, 12] },
  { code: 'RF', label: 'Reading: Foundational Skills', framework: 'ela', subject: 'phonics', grades: [0, 5] },
  { code: 'W', label: 'Writing', framework: 'ela', subject: 'writing', grades: [0, 12] },
  { code: 'SL', label: 'Speaking & Listening', framework: 'ela', subject: 'reading', grades: [0, 12] },
  { code: 'L', label: 'Language', framework: 'ela', subject: 'writing', grades: [0, 12] },
];

const gradeCode = (g: number) => (g <= 0 ? 'K' : String(Math.min(12, g)));

/** The Common Core code for a strand at a grade, e.g. CCSS.MATH.CONTENT.3.NF or CCSS.ELA-LITERACY.RL.4. */
export function standardCode(s: Strand, grade: number): string {
  const g = Math.max(s.grades[0], Math.min(s.grades[1], grade));
  return s.framework === 'math' ? `CCSS.MATH.CONTENT.${gradeCode(g)}.${s.code}` : `CCSS.ELA-LITERACY.${s.code}.${gradeCode(g)}`;
}

/** Strands that fit a curriculum's subjects and grades. */
export function strandsFor(subjects: Subject[], gradeMin: number, gradeMax: number): Strand[] {
  const ela: Subject[] = ['reading', 'writing', 'phonics'];
  return STRANDS.filter(
    (s) => (s.framework === 'math' ? subjects.includes('math') : subjects.some((x) => ela.includes(x))) && s.grades[0] <= gradeMax && s.grades[1] >= gradeMin,
  );
}

const BY_CODE = new Map(STRANDS.map((s) => [`${s.framework}:${s.code}`, s]));

/** A built-in Common Core code → its strand and grade. Also reads short forms like "3.NF.A.1" and "RL.4.2". */
export function parseStandard(raw: string): { strand: Strand; grade: string } | undefined {
  const code = raw.trim().toUpperCase().replace(/^CCSS\./, '').replace(/^MATH\.CONTENT\.|^MATH\./, '').replace(/^ELA-LITERACY\.|^ELA\./, '');
  const math = code.match(/^(K|\d{1,2})\.([A-Z]{1,3})(?:\.|$)/);
  if (math && BY_CODE.has(`math:${math[2]}`)) return { strand: BY_CODE.get(`math:${math[2]}`)!, grade: math[1] };
  const ela = code.match(/^([A-Z]{1,2})\.(K|\d{1,2})(?:\.|$)/);
  if (ela && BY_CODE.has(`ela:${ela[1]}`)) return { strand: BY_CODE.get(`ela:${ela[1]}`)!, grade: ela[2] };
  return undefined;
}

/** "Math 3.NF · Fractions" for built-in codes; anything else as typed. */
export function standardLabel(raw: string): string {
  const p = parseStandard(raw);
  if (!p) return raw.trim();
  return p.strand.framework === 'math' ? `Math ${p.grade}.${p.strand.code} · ${p.strand.label}` : `ELA ${p.strand.code}.${p.grade} · ${p.strand.label}`;
}

/** Tags typed as a list: commas, semicolons, or new lines. Deduped, case-insensitive. */
export function parseStandardList(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim().slice(0, 60))
    .filter((s) => s && !seen.has(s.toUpperCase()) && seen.add(s.toUpperCase()));
}

// ───────────────────────────── Coverage

export interface SubjectCoverage {
  subject: Subject;
  /** Curricula and rhythm blocks teaching it. */
  sources: string[];
  /** Standards tagged in lesson plans that count toward this subject. */
  standards: string[];
}

/** What a family's plan covers: curricula, rhythm blocks, and the standards tagged in their lessons. */
export function subjectCoverage(curricula: Curriculum[], blocks: RhythmBlock[] = []): SubjectCoverage[] {
  const map = new Map<Subject, SubjectCoverage>();
  const at = (s: Subject) => map.get(s) ?? map.set(s, { subject: s, sources: [], standards: [] }).get(s)!;
  const addSource = (s: Subject, name: string) => {
    const c = at(s);
    if (!c.sources.includes(name)) c.sources.push(name);
  };
  for (const c of curricula) {
    addSource(c.subject, c.name);
    for (const l of allLessons(c.outline)) {
      for (const code of l.standards ?? []) {
        const s = parseStandard(code)?.strand.subject ?? c.subject;
        if (s !== c.subject) addSource(s, c.name);
        const cov = at(s);
        if (!cov.standards.includes(code)) cov.standards.push(code);
      }
    }
  }
  for (const b of blocks) if (b.subject !== 'free_play' && b.subject !== 'other') addSource(b.subject, b.title);
  return [...map.values()].sort((a, b) => b.sources.length - a.sources.length || subjectLabel(a.subject).localeCompare(subjectLabel(b.subject)));
}

// ───────────────────────────── State-required subjects

export interface RequiredSubject {
  label: string;
  /** Any of these in the plan counts. */
  anyOf: Subject[];
}

const R = {
  reading: { label: 'Reading', anyOf: ['reading', 'phonics'] },
  language: { label: 'Language arts', anyOf: ['reading', 'writing', 'phonics'] },
  writing: { label: 'Writing', anyOf: ['writing'] },
  spelling: { label: 'Spelling & grammar', anyOf: ['writing', 'phonics'] },
  literature: { label: 'Literature', anyOf: ['reading'] },
  math: { label: 'Math', anyOf: ['math'] },
  science: { label: 'Science', anyOf: ['science'] },
  social: { label: 'Social studies', anyOf: ['history', 'geography', 'civics'] },
  history: { label: 'History', anyOf: ['history'] },
  civics: { label: 'Civics & citizenship', anyOf: ['civics', 'history'] },
  geography: { label: 'Geography', anyOf: ['geography', 'history'] },
  health: { label: 'Health', anyOf: ['health', 'pe'] },
  pe: { label: 'Physical education', anyOf: ['pe'] },
  arts: { label: 'Art & music', anyOf: ['art', 'music'] },
} satisfies Record<string, RequiredSubject & { anyOf: Subject[] }>;
type Req = keyof typeof R;

/**
 * Subjects a state's homeschool law lists (simplified, like the rest of
 * states.ts — always shown with its verify notice). States that only say
 * "equivalent instruction" or leave subjects to the parent aren't listed.
 */
const REQUIRED: Partial<Record<string, Req[]>> = {
  AZ: ['reading', 'spelling', 'math', 'social', 'science'],
  CO: ['reading', 'writing', 'math', 'history', 'civics', 'literature', 'science'],
  CT: ['reading', 'writing', 'spelling', 'geography', 'math', 'history', 'civics'],
  DC: ['language', 'math', 'science', 'social', 'arts', 'health', 'pe'],
  GA: ['reading', 'language', 'math', 'social', 'science'],
  IL: ['language', 'math', 'science', 'social', 'arts', 'health'],
  KY: ['reading', 'writing', 'spelling', 'history', 'math', 'civics'],
  MA: ['reading', 'writing', 'spelling', 'geography', 'math', 'arts', 'history', 'civics', 'health', 'pe'],
  MD: ['language', 'math', 'science', 'social', 'arts', 'health', 'pe'],
  ME: ['language', 'math', 'science', 'social', 'pe', 'health', 'arts'],
  MI: ['reading', 'spelling', 'math', 'science', 'history', 'civics', 'literature', 'writing'],
  MN: ['reading', 'writing', 'literature', 'arts', 'math', 'science', 'social', 'health', 'pe'],
  MO: ['reading', 'language', 'math', 'social', 'science'],
  NH: ['science', 'math', 'language', 'civics', 'history', 'health', 'reading', 'writing', 'spelling', 'arts'],
  NM: ['reading', 'language', 'math', 'social', 'science'],
  NV: ['language', 'math', 'science', 'social'],
  NY: ['math', 'reading', 'spelling', 'writing', 'geography', 'history', 'science', 'health', 'arts', 'pe'],
  OK: ['reading', 'writing', 'math', 'science', 'civics', 'health', 'pe'],
  PA: ['language', 'math', 'science', 'geography', 'history', 'civics', 'health', 'pe', 'arts'],
  RI: ['reading', 'writing', 'geography', 'math', 'history', 'civics', 'health', 'pe'],
  SC: ['reading', 'writing', 'math', 'science', 'social'],
  SD: ['language', 'math'],
  TX: ['reading', 'spelling', 'math', 'civics'],
  UT: ['language', 'math', 'science', 'social', 'arts', 'health', 'pe'],
  VT: ['reading', 'writing', 'math', 'civics', 'history', 'pe', 'health', 'literature', 'science', 'arts'],
  WA: ['science', 'math', 'language', 'social', 'history', 'health', 'reading', 'writing', 'spelling', 'arts'],
  WI: ['reading', 'language', 'math', 'social', 'science', 'health'],
  WY: ['reading', 'writing', 'math', 'civics', 'history', 'literature', 'science'],
};

export function requiredSubjects(stateCode?: string): RequiredSubject[] {
  if (!stateCode) return [];
  return (REQUIRED[stateCode.toUpperCase()] ?? []).map((k) => R[k]);
}

/** Required subjects nothing in the family's plan covers yet. */
export function missingSubjects(stateCode: string | undefined, coverage: SubjectCoverage[]): RequiredSubject[] {
  const have = new Set(coverage.map((c) => c.subject));
  return requiredSubjects(stateCode).filter((r) => !r.anyOf.some((s) => have.has(s)));
}

/** "Arizona asks for Science and Social studies" — or undefined when nothing is missing. */
export function missingSentence(stateCode: string | undefined, missing: RequiredSubject[]): string | undefined {
  if (!missing.length) return undefined;
  const name = (stateCode && getStateLaw(stateCode)?.name) || 'Your state';
  const list = missing.map((m) => m.label);
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  return `${name} asks for ${joined}, and nothing in your plan covers ${missing.length === 1 ? 'it' : 'them'} yet.`;
}
