import type { Philosophy, QuizDimension, QuizResult } from './types';

type Weights = Partial<Record<Philosophy, number>>;

export interface QuizOption {
  label: string;
  /** Contribution to each dimension, -2..2 (negative = left pole). */
  dims: Partial<Record<QuizDimension, number>>;
  weights: Weights;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

export const DIMENSION_POLES: Record<QuizDimension, [string, string]> = {
  structure: ['Freedom', 'Structure'],
  experiential: ['Books & Texts', 'Hands-on & Projects'],
  faith: ['Secular', 'Faith-Infused'],
  screenFree: ['Tech-Integrated', 'Screen-Free & Nature'],
  collective: ['Individual Pacing', 'Family Together'],
};

/** The 15-question archetype quiz (Phase 1 spec). */
export const QUIZ: QuizQuestion[] = [
  {
    id: 'q1',
    prompt: 'Your ideal school morning looks like…',
    options: [
      { label: 'A clear timetable — we start at 9 and move subject by subject', dims: { structure: 2 }, weights: { traditional: 3, classical: 2 } },
      { label: 'A gentle rhythm — short lessons, then lots of free time', dims: { structure: 0 }, weights: { charlotte_mason: 3, montessori: 1 } },
      { label: 'Whatever the kids are curious about that day', dims: { structure: -2 }, weights: { unschooling: 3 } },
      { label: 'Outside first, books later', dims: { structure: -1, screenFree: 2 }, weights: { nature_forest: 3 } },
    ],
  },
  {
    id: 'q2',
    prompt: 'How do you feel about textbooks and workbooks?',
    options: [
      { label: 'Essential — they keep us on track', dims: { experiential: -2, structure: 1 }, weights: { traditional: 3 } },
      { label: 'Prefer "living books" written by passionate authors', dims: { experiential: -1 }, weights: { charlotte_mason: 3, classical: 1 } },
      { label: 'Fine as a reference, but projects teach more', dims: { experiential: 1 }, weights: { unit_study: 3 } },
      { label: 'Rarely — real life is the curriculum', dims: { experiential: 2, structure: -2 }, weights: { unschooling: 3 } },
    ],
  },
  {
    id: 'q3',
    prompt: 'Which outcome matters most to you?',
    options: [
      { label: 'Strong logic, rhetoric, and command of the great books', dims: { experiential: -1 }, weights: { classical: 3 } },
      { label: 'A love of learning and good habits', dims: {}, weights: { charlotte_mason: 3 } },
      { label: 'Independence and self-directed mastery', dims: { collective: -2 }, weights: { montessori: 3, unschooling: 1 } },
      { label: 'Character and faith formation', dims: { faith: 2 }, weights: { faith_based: 3 } },
    ],
  },
  {
    id: 'q4',
    prompt: 'Faith in your homeschool is…',
    options: [
      { label: 'Central — woven into every subject', dims: { faith: 2 }, weights: { faith_based: 4 } },
      { label: 'Important, but taught separately', dims: { faith: 1 }, weights: { faith_based: 1 } },
      { label: 'Not part of our academics', dims: { faith: -2 }, weights: {} },
      { label: 'We explore many traditions comparatively', dims: { faith: -1 }, weights: { unit_study: 1, classical: 1 } },
    ],
  },
  {
    id: 'q5',
    prompt: 'Screens and technology for learning?',
    options: [
      { label: 'Love them — apps, videos, online classes', dims: { screenFree: -2 }, weights: { traditional: 2 } },
      { label: 'Some, for subjects like math or coding', dims: { screenFree: -1 }, weights: { unit_study: 1, classical: 1 } },
      { label: 'Minimal — real objects and real books', dims: { screenFree: 1 }, weights: { charlotte_mason: 2, montessori: 2 } },
      { label: 'Screen-free; we live outdoors', dims: { screenFree: 2 }, weights: { nature_forest: 3 } },
    ],
  },
  {
    id: 'q6',
    prompt: 'With several kids at different ages, you\'d rather…',
    options: [
      { label: 'Teach one theme to everyone at different depths', dims: { collective: 2 }, weights: { unit_study: 3, charlotte_mason: 1 } },
      { label: 'Run separate grade-level tracks', dims: { collective: -2, structure: 1 }, weights: { traditional: 3 } },
      { label: 'Follow the classical cycle together (Ancients → Moderns)', dims: { collective: 1 }, weights: { classical: 3 } },
      { label: 'Let each child lead their own exploration', dims: { collective: -2, structure: -1 }, weights: { montessori: 2, unschooling: 2 } },
    ],
  },
  {
    id: 'q7',
    prompt: 'A great science lesson is…',
    options: [
      { label: 'A nature walk with sketching in a journal', dims: { screenFree: 2, experiential: 1 }, weights: { charlotte_mason: 2, nature_forest: 3 } },
      { label: 'A lab following a textbook chapter', dims: { structure: 1, experiential: -1 }, weights: { traditional: 3 } },
      { label: 'Building something they designed themselves', dims: { experiential: 2 }, weights: { montessori: 2, unschooling: 2 } },
      { label: 'Part of a big multi-week theme like "Oceans"', dims: { collective: 1 }, weights: { unit_study: 3 } },
    ],
  },
  {
    id: 'q8',
    prompt: 'Memorization (poems, math facts, timelines) is…',
    options: [
      { label: 'Foundational — kids love it when young', dims: { structure: 1 }, weights: { classical: 4 } },
      { label: 'Useful in small doses', dims: {}, weights: { charlotte_mason: 1, traditional: 1 } },
      { label: 'Rarely needed', dims: { structure: -1 }, weights: { unschooling: 2, montessori: 1 } },
    ],
  },
  {
    id: 'q9',
    prompt: 'Your learning space looks like…',
    options: [
      { label: 'Desks and a whiteboard', dims: { structure: 2 }, weights: { traditional: 3 } },
      { label: 'Low open shelves with hands-on materials', dims: { experiential: 2 }, weights: { montessori: 4 } },
      { label: 'A cozy couch and overflowing bookshelves', dims: { experiential: -1 }, weights: { charlotte_mason: 3 } },
      { label: 'The backyard, the woods, the creek', dims: { screenFree: 2 }, weights: { nature_forest: 4 } },
    ],
  },
  {
    id: 'q10',
    prompt: 'How do you prefer to know your kids are learning?',
    options: [
      { label: 'Tests and grades', dims: { structure: 2 }, weights: { traditional: 3 } },
      { label: 'Narration — they tell back what they learned', dims: {}, weights: { charlotte_mason: 4 } },
      { label: 'Essays, debates, and Socratic discussion', dims: { experiential: -1 }, weights: { classical: 3 } },
      { label: 'I can see it in what they create and do', dims: { experiential: 2, structure: -1 }, weights: { unschooling: 2, montessori: 2 } },
    ],
  },
  {
    id: 'q11',
    prompt: 'How much planning do you enjoy?',
    options: [
      { label: 'I want a boxed curriculum with a daily plan', dims: { structure: 2 }, weights: { traditional: 2, faith_based: 1 } },
      { label: 'I like planning themes and gathering resources', dims: { structure: 0, collective: 1 }, weights: { unit_study: 3 } },
      { label: 'Light planning — I\'ll follow good book lists', dims: {}, weights: { charlotte_mason: 2, classical: 1 } },
      { label: 'As little as possible; we go with the flow', dims: { structure: -2 }, weights: { unschooling: 3 } },
    ],
  },
  {
    id: 'q12',
    prompt: 'Art and music in your home are…',
    options: [
      { label: 'Picture study and composer study each term', dims: {}, weights: { charlotte_mason: 3 } },
      { label: 'Part of the history timeline we\'re studying', dims: { collective: 1 }, weights: { classical: 2, unit_study: 2 } },
      { label: 'Open-ended — materials always available', dims: { experiential: 2 }, weights: { montessori: 2, unschooling: 1 } },
      { label: 'Electives, like at school', dims: { structure: 1 }, weights: { traditional: 2 } },
    ],
  },
  {
    id: 'q13',
    prompt: 'When a child is frustrated with a lesson, you…',
    options: [
      { label: 'Push through — consistency builds discipline', dims: { structure: 2 }, weights: { traditional: 2, classical: 1 } },
      { label: 'Stop, go outside, and try again tomorrow', dims: { screenFree: 1, structure: -1 }, weights: { nature_forest: 2, charlotte_mason: 1 } },
      { label: 'Let them choose a different activity', dims: { structure: -2, collective: -1 }, weights: { montessori: 2, unschooling: 2 } },
      { label: 'Pray together and reframe the challenge', dims: { faith: 2 }, weights: { faith_based: 3 } },
    ],
  },
  {
    id: 'q14',
    prompt: 'Your biggest worry about homeschooling is…',
    options: [
      { label: 'Falling behind grade level', dims: { structure: 2 }, weights: { traditional: 3 } },
      { label: 'Kids missing out on community', dims: { collective: 2 }, weights: { unit_study: 1, nature_forest: 1 } },
      { label: 'Not giving them a rigorous foundation', dims: { experiential: -1 }, weights: { classical: 3 } },
      { label: 'Crushing their natural curiosity', dims: { structure: -2 }, weights: { unschooling: 3, montessori: 1 } },
    ],
  },
  {
    id: 'q15',
    prompt: 'Pick the phrase that sounds most like your family:',
    options: [
      { label: '"Education is an atmosphere, a discipline, a life."', dims: {}, weights: { charlotte_mason: 4 } },
      { label: '"Teach them how to think, not what to think."', dims: { experiential: -1 }, weights: { classical: 4 } },
      { label: '"Help me to do it myself."', dims: { collective: -1, experiential: 1 }, weights: { montessori: 4 } },
      { label: '"There\'s no such thing as bad weather."', dims: { screenFree: 2 }, weights: { nature_forest: 4 } },
    ],
  },
];

export const PHILOSOPHY_INFO: Record<Philosophy, { label: string; emoji: string; summary: string; typicalDay: string }> = {
  charlotte_mason: {
    label: 'Charlotte Mason',
    emoji: '📚',
    summary: 'Short, focused lessons, living books, narration, nature study, and habit training.',
    typicalDay: 'Mornings of 10–20 minute lessons (math, copywork, a living-book reading with narration), then afternoons for nature walks, handicrafts, and free play.',
  },
  classical: {
    label: 'Classical',
    emoji: '🏛️',
    summary: 'The Trivium — grammar, logic, rhetoric — with a chronological history cycle and great books.',
    typicalDay: 'Memory work and recitation, math, Latin, then a history reading tied to the timeline, with older kids writing essays and discussing primary sources.',
  },
  montessori: {
    label: 'Montessori',
    emoji: '🧩',
    summary: 'Prepared environment, hands-on materials, and child-led work cycles.',
    typicalDay: 'A long uninterrupted work period where each child chooses from prepared shelves, with short parent presentations of new materials.',
  },
  unschooling: {
    label: 'Unschooling',
    emoji: '🌈',
    summary: 'Interest-led learning through life, play, and real projects.',
    typicalDay: 'No fixed lessons — kids pursue passions (baking, coding, bugs) while you strew resources and log the learning you see.',
  },
  nature_forest: {
    label: 'Nature / Forest School',
    emoji: '🌲',
    summary: 'Outdoor, all-weather, play-based learning with nature as the classroom.',
    typicalDay: 'Hours outside exploring, building, and observing, with nature journaling and stories when you come back in.',
  },
  faith_based: {
    label: 'Faith-Based',
    emoji: '🕊️',
    summary: 'Faith and character formation integrated through every subject.',
    typicalDay: 'Morning devotion and memory verses, then core subjects from a faith-integrated curriculum, with service projects woven in.',
  },
  unit_study: {
    label: 'Unit Study',
    emoji: '🧭',
    summary: 'Thematic units that tie every subject together — great for multiple ages.',
    typicalDay: 'Skill subjects (math, phonics) individually in the morning, then the whole family dives into the current theme with tiered activities.',
  },
  traditional: {
    label: 'Traditional / School-at-Home',
    emoji: '📝',
    summary: 'Grade-level textbooks, schedules, and tests — familiar and easy to measure.',
    typicalDay: 'A timetable of subjects with textbook lessons, worksheets, and periodic quizzes for each child.',
  },
};

const DIMENSIONS: QuizDimension[] = ['structure', 'experiential', 'faith', 'screenFree', 'collective'];

/**
 * Score answers (question id → option index). Unanswered questions are ignored.
 * Philosophies under 10% are folded into the remaining ones so the breakdown
 * reads like "70% Charlotte Mason + 30% Unit Study" rather than a long tail.
 */
export function scoreQuiz(answers: Record<string, number>, takenAt = new Date().toISOString()): QuizResult {
  const totals: Partial<Record<Philosophy, number>> = {};
  const dimSum: Record<QuizDimension, number> = { structure: 0, experiential: 0, faith: 0, screenFree: 0, collective: 0 };
  const dimCount: Record<QuizDimension, number> = { structure: 0, experiential: 0, faith: 0, screenFree: 0, collective: 0 };

  for (const q of QUIZ) {
    const idx = answers[q.id];
    const opt = idx === undefined ? undefined : q.options[idx];
    if (!opt) continue;
    for (const [p, w] of Object.entries(opt.weights) as [Philosophy, number][]) {
      totals[p] = (totals[p] ?? 0) + w;
    }
    for (const d of DIMENSIONS) {
      if (opt.dims[d] !== undefined) {
        dimSum[d] += opt.dims[d]!;
        dimCount[d] += 1;
      }
    }
  }

  const dimensions = Object.fromEntries(
    DIMENSIONS.map((d) => [d, dimCount[d] ? Math.max(-1, Math.min(1, dimSum[d] / (2 * dimCount[d]))) : 0]),
  ) as Record<QuizDimension, number>;

  const entries = (Object.entries(totals) as [Philosophy, number][]).filter(([, v]) => v > 0);
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (sum === 0) return { breakdown: [], dimensions, takenAt };

  let kept = entries.filter(([, v]) => v / sum >= 0.1);
  if (kept.length === 0) kept = entries;
  kept = kept.sort((a, b) => b[1] - a[1]).slice(0, 3);
  const keptSum = kept.reduce((a, [, v]) => a + v, 0);

  const breakdown = kept.map(([philosophy, v]) => ({ philosophy, percent: Math.round((v / keptSum) * 100) }));
  // Make rounding add up to exactly 100.
  const drift = 100 - breakdown.reduce((a, b) => a + b.percent, 0);
  breakdown[0].percent += drift;

  return { breakdown, dimensions, takenAt };
}

export function describeResult(result: QuizResult): string {
  if (result.breakdown.length === 0) return 'Eclectic';
  return result.breakdown.map((b) => `${b.percent}% ${PHILOSOPHY_INFO[b.philosophy].label}`).join(' + ');
}
