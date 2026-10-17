// Core domain model for Kinship. Everything here is plain data so it can be
// persisted locally today and synced to the Kinship API later.

export type ID = string;
/** ISO calendar date, e.g. "2026-10-16". */
export type DateKey = string;
/** 24h clock time, e.g. "09:30". */
export type ClockTime = string;
/** 0 = Sunday ... 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Philosophy =
  | 'charlotte_mason'
  | 'classical'
  | 'montessori'
  | 'unschooling'
  | 'nature_forest'
  | 'faith_based'
  | 'unit_study'
  | 'traditional';

export type Subject =
  | 'math'
  | 'reading'
  | 'writing'
  | 'phonics'
  | 'science'
  | 'history'
  | 'geography'
  | 'civics'
  | 'foreign_language'
  | 'art'
  | 'music'
  | 'pe'
  | 'health'
  | 'life_skills'
  | 'bible'
  | 'free_play'
  | 'other';

/** Who the parent is "spent" on during a block. */
export type AttentionMode = 'parent' | 'solo' | 'group';

export type LearningDifference = 'adhd' | 'dyslexia' | 'dysgraphia' | 'dyscalculia' | 'autism' | 'gifted' | '2e' | 'speech';

export interface Child {
  id: ID;
  name: string;
  birthdate: DateKey;
  grade: string;
  avatar: string; // emoji
  color: string;
  pin?: string; // 4-digit, optional
  learningDifferences: LearningDifference[];
  passions: string[];
  /** Minutes the child can comfortably work alone. */
  soloToleranceMin: number;
  sparks: number;
}

export interface FamilyProfile {
  familyName: string;
  parentName: string;
  parentPin: string;
  stateCode: string;
  zip: string;
  philosophy?: QuizResult;
  values: string[];
  interests: string[];
  schoolYearStart: DateKey;
  schoolYearEnd: DateKey;
  schoolDays: Weekday[];
  /** Optional weekly catch-up day that bumped tasks land on first. */
  flexDay?: Weekday;
  createdAt: string;
}

export interface QuizResult {
  /** Percentages per philosophy, summing to ~100, highest first. */
  breakdown: { philosophy: Philosophy; percent: number }[];
  /** -1..1 per dimension (negative = left pole). */
  dimensions: Record<QuizDimension, number>;
  takenAt: string;
}

export type QuizDimension = 'structure' | 'experiential' | 'faith' | 'screenFree' | 'collective';

export interface Step {
  id: ID;
  label: string;
  done: boolean;
}

/** A recurring block in the weekly rhythm. */
export interface RhythmBlock {
  id: ID;
  title: string;
  subject: Subject;
  childIds: ID[]; // >1 child only meaningful for 'group'
  mode: AttentionMode;
  start: ClockTime;
  durationMin: number;
  days: Weekday[];
  icon: string;
  steps: string[];
  curriculumId?: ID;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'skipped';

/** A concrete task for one child on one date. */
export interface Task {
  id: ID;
  blockId?: ID;
  /** Shared by all children's copies of a group block on one date. */
  groupKey?: string;
  childId: ID;
  date: DateKey;
  title: string;
  subject: Subject;
  mode: AttentionMode;
  start: ClockTime;
  durationMin: number;
  icon: string;
  steps: Step[];
  status: TaskStatus;
  completedAt?: string;
  /** Minutes actually spent (timer) — falls back to durationMin when logging hours. */
  minutesSpent?: number;
  selfAssessment?: 1 | 2 | 3;
  reflection?: string;
  curriculumId?: ID;
  bumpedFrom?: DateKey;
}

export interface HelpRequest {
  id: ID;
  childId: ID;
  taskId?: ID;
  note?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface MoodCheckIn {
  childId: ID;
  date: DateKey;
  mood: 1 | 2 | 3 | 4 | 5;
}

export interface Evidence {
  id: ID;
  childId: ID;
  date: DateKey;
  subject: Subject;
  uri: string;
  note: string;
  taskId?: ID;
  standard?: string;
}

export interface HoursLog {
  id: ID;
  childId: ID;
  date: DateKey;
  subject: Subject;
  minutes: number;
  note?: string;
}

export interface Curriculum {
  id: ID;
  name: string;
  subject: Subject;
  childIds: ID[];
  totalLessons: number;
  lessonsDone: number;
  startDate: DateKey;
  targetEndDate: DateKey;
  schoolDays: Weekday[];
  model: 'turnkey' | 'modular' | 'custom';
}

export type FundingSource = 'esa' | 'tax' | 'out_of_pocket';

export interface Expense {
  id: ID;
  date: DateKey;
  vendor: string;
  description: string;
  amount: number;
  category: 'curriculum' | 'supplies' | 'tutoring' | 'technology' | 'field_trip' | 'testing' | 'other';
  fundingSource: FundingSource;
  childId?: ID;
  approvedVendor: boolean;
  receiptUri?: string;
}

export interface NoiDraft {
  schoolYear: string;
  parentName: string;
  address: string;
  district: string;
  superintendent: string;
  signature: string;
  signedAt?: string;
  checklist: Record<string, boolean>;
}

export interface CoOp {
  id: ID;
  name: string;
  description: string;
  meets: string;
  members: string[];
  duties: { label: string; family: string }[];
  joined: boolean;
}

export interface CommunityEvent {
  id: ID;
  title: string;
  date: DateKey;
  location: string;
  ages: string;
  host: string;
  costPerKid: number;
  rsvps: number;
  capacity: number;
  going: boolean;
  carpool: boolean;
}

export interface SwapListing {
  id: ID;
  title: string;
  subject: Subject;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  price: number;
  seller: string;
  distanceBand: string;
  mine: boolean;
}
