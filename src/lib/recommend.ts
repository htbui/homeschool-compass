import { ageOn, fromMinutes, toMinutes } from './dates';
import { uid } from './id';
import type { Child, Philosophy, RhythmBlock, Subject, Weekday } from './types';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

/** Lesson length by age — short lessons for little ones (a Charlotte Mason staple, sensible for all). */
export const lessonMinutes = (age: number) => (age <= 6 ? 20 : age <= 9 ? 30 : age <= 12 ? 40 : 50);

interface GroupTheme {
  title: string;
  subject: Subject;
  icon: string;
  steps: string[];
}

const GROUP_BY_PHILOSOPHY: Record<Philosophy, GroupTheme> = {
  charlotte_mason: { title: 'Morning Time: Living Book + Narration', subject: 'history', icon: '📚', steps: ['Read aloud a chapter', 'Each child narrates back', 'Picture or composer study'] },
  classical: { title: 'Memory Work & History Cycle', subject: 'history', icon: '🏛️', steps: ['Recite memory work', 'History reading', 'Timeline card'] },
  montessori: { title: 'Family Circle & Practical Life', subject: 'life_skills', icon: '🧺', steps: ['Morning circle', 'Practical life work', 'Share one discovery'] },
  unschooling: { title: 'Family Explore Time', subject: 'science', icon: '🔭', steps: ['Pick a question together', 'Investigate', 'Share what you found'] },
  nature_forest: { title: 'Nature Walk & Journaling', subject: 'science', icon: '🌲', steps: ['Outdoor exploration', 'Sketch one find', 'Name it together'] },
  faith_based: { title: 'Devotions & Family Unit Study', subject: 'bible', icon: '🕊️', steps: ['Devotion reading', 'Memory verse', 'Discussion'] },
  unit_study: { title: 'Family Unit Study', subject: 'science', icon: '🧭', steps: ['Theme read-aloud', 'Tiered activity', 'Show & tell'] },
  traditional: { title: 'Family Science Lesson', subject: 'science', icon: '🔬', steps: ['Read the chapter', 'Experiment', 'Lab notes'] },
};

/** Skill subjects get individual 1-on-1 or solo time per child. */
function skillBlocks(age: number): { title: string; subject: Subject; icon: string; steps: string[] }[] {
  if (age <= 7)
    return [
      { title: 'Phonics & Reading', subject: 'phonics', icon: '🔤', steps: ['Letter sounds', 'Read aloud together'] },
      { title: 'Hands-on Math', subject: 'math', icon: '🧮', steps: ['Manipulatives warm-up', 'Short lesson'] },
    ];
  return [
    { title: 'Math Lesson', subject: 'math', icon: '🧮', steps: ['Lesson', 'Practice problems', 'Check work'] },
    { title: age <= 11 ? 'Language Arts' : 'Writing & Literature', subject: age <= 11 ? 'reading' : 'writing', icon: '✏️', steps: ['Reading', 'Written response'] },
  ];
}

/**
 * Parent-attention need by age (from the blueprint's persona model: ~80% at 5,
 * ~40% at 9, ~15% at 13). Above the threshold a skill block is 1-on-1.
 */
const needsOneOnOne = (age: number, index: number) => (age <= 7 ? true : age <= 11 ? index === 0 : false);

/**
 * Build a starter weekly rhythm: skill blocks staggered so only one child holds
 * the parent at a time (others work solo or play), then a family group block.
 */
export function recommendRhythm(children: Child[], primary: Philosophy | undefined, dayStart = '09:00'): RhythmBlock[] {
  const blocks: RhythmBlock[] = [];
  if (children.length === 0) return blocks;
  const sorted = [...children].sort((a, b) => ageOn(a.birthdate) - ageOn(b.birthdate)); // youngest first — they fade fastest
  const childCursor = new Map(sorted.map((c) => [c.id, toMinutes(dayStart)]));
  let parentFree = toMinutes(dayStart);

  // Interleave: round r gives each child their r-th skill block.
  const maxRounds = 2;
  for (let r = 0; r < maxRounds; r++) {
    for (const child of sorted) {
      const age = ageOn(child.birthdate);
      const skill = skillBlocks(age)[r];
      if (!skill) continue;
      const dur = lessonMinutes(age);
      const oneOnOne = needsOneOnOne(age, r);
      let start = childCursor.get(child.id)!;
      if (oneOnOne) start = Math.max(start, parentFree);
      // Fill a gap before a delayed 1-on-1 with independent play/reading.
      const gap = start - childCursor.get(child.id)!;
      if (gap >= 15) {
        blocks.push(block(child, age <= 7 ? 'Independent Play / Puzzles' : 'Silent Reading', age <= 7 ? 'free_play' : 'reading', 'solo', childCursor.get(child.id)!, gap, age <= 7 ? '🧩' : '📖', []));
      }
      blocks.push(block(child, skill.title, skill.subject, oneOnOne ? 'parent' : 'solo', start, dur, skill.icon, skill.steps));
      childCursor.set(child.id, start + dur);
      if (oneOnOne) parentFree = start + dur;
    }
  }

  // Family block starts once everyone (and the parent) is free.
  const groupStart = Math.max(parentFree, ...childCursor.values());
  const theme = GROUP_BY_PHILOSOPHY[primary ?? 'unit_study'];
  blocks.push({
    id: uid('b'),
    title: theme.title,
    subject: theme.subject,
    childIds: sorted.map((c) => c.id),
    mode: 'group',
    start: fromMinutes(roundTo5(groupStart)),
    durationMin: 45,
    days: WEEKDAYS,
    icon: theme.icon,
    steps: theme.steps,
  });

  // Afternoon: outdoor time + passion project per child.
  const afternoon = toMinutes('13:00');
  for (const child of sorted) {
    const passion = child.passions[0];
    blocks.push(block(child, passion ? `Passion Project: ${passion}` : 'Outdoor Time', passion ? 'other' : 'pe', 'solo', afternoon, 30, passion ? '💡' : '🌳', []));
  }
  return blocks;
}

const roundTo5 = (m: number) => Math.ceil(m / 5) * 5;

function block(child: Child, title: string, subject: Subject, mode: RhythmBlock['mode'], start: number, durationMin: number, icon: string, steps: string[]): RhythmBlock {
  return { id: uid('b'), title, subject, childIds: [child.id], mode, start: fromMinutes(roundTo5(start)), durationMin, days: WEEKDAYS, icon, steps };
}

/** Curriculum suggestions by philosophy (content-agnostic: we plan around what you own). */
export const CURRICULUM_SUGGESTIONS: Record<Philosophy, string[]> = {
  charlotte_mason: ['Ambleside Online (free)', 'A Gentle Feast', 'Simply Charlotte Mason', 'Blossom & Root'],
  classical: ['Story of the World', 'Memoria Press', 'Classical Conversations', 'Writing & Rhetoric'],
  montessori: ['Montessori at home materials', 'Waseca Biomes', 'Montessori Math (golden beads)'],
  unschooling: ['Library + strewing baskets', 'Project-based kits (KiwiCo)', 'Khan Academy as needed'],
  nature_forest: ['Exploring Nature with Children', 'Blossom & Root', 'Wild + Free bundles'],
  faith_based: ['The Good and the Beautiful', 'Sonlight', 'Apologia Science', 'Abeka'],
  unit_study: ['Torchlight', 'Five in a Row', 'Gather Round Homeschool', 'Build Your Library'],
  traditional: ['Saxon Math', 'Time4Learning', 'BJU Press', 'Calvert'],
};
