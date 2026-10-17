import { addDays, schoolYearLabel, todayKey } from '@/lib/dates';
import type { Child, CoOp, CommunityEvent, Curriculum, FamilyProfile, RhythmBlock, SwapListing, Weekday } from '@/lib/types';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];

export const AVATARS = ['🦊', '🐻', '🦉', '🐢', '🦁', '🐬', '🦄', '🐝', '🐙', '🦖', '🐼', '🐸'];
export const KID_COLORS = ['#E07A5F', '#3D9970', '#4C7FD9', '#9B6BD6', '#E3A33B', '#D9578B'];

/** Default school year: mid-August → early June around the current date. */
export function defaultSchoolYear(): { start: string; end: string } {
  const startYear = Number(schoolYearLabel().slice(0, 4));
  return { start: `${startYear}-08-17`, end: `${startYear + 1}-06-04` };
}

/** "The Miller Crew" from the product blueprint, for exploring the app. */
export function demoWorkspace() {
  const yearsAgo = (y: number, md: string) => `${new Date().getFullYear() - y}-${md}`;
  const children: Child[] = [
    { id: 'leo', name: 'Leo', birthdate: yearsAgo(5, '03-14'), grade: 'Kindergarten', avatar: '🦖', color: KID_COLORS[0], learningDifferences: [], passions: ['dinosaurs', 'lego'], soloToleranceMin: 10, sparks: 120 },
    { id: 'maya', name: 'Maya', birthdate: yearsAgo(9, '01-22'), grade: '4th Grade', avatar: '🦉', color: KID_COLORS[1], learningDifferences: ['dyslexia'], passions: ['gardening', 'drawing'], soloToleranceMin: 25, sparks: 450, pin: '1111' },
    { id: 'noah', name: 'Noah', birthdate: yearsAgo(13, '07-02'), grade: '8th Grade', avatar: '🐙', color: KID_COLORS[2], learningDifferences: ['adhd'], passions: ['robotics', 'chess'], soloToleranceMin: 45, sparks: 780 },
  ];
  const { start, end } = defaultSchoolYear();
  const family: FamilyProfile = {
    familyName: 'The Miller Crew',
    parentName: 'Dana Miller',
    parentPin: '1234',
    stateCode: 'CO',
    zip: '80202',
    philosophy: {
      breakdown: [
        { philosophy: 'charlotte_mason', percent: 60 },
        { philosophy: 'nature_forest', percent: 25 },
        { philosophy: 'unit_study', percent: 15 },
      ],
      dimensions: { structure: 0.1, experiential: 0.3, faith: -0.4, screenFree: 0.5, collective: 0.6 },
      takenAt: new Date().toISOString(),
    },
    values: ['curiosity', 'kindness', 'time outdoors'],
    interests: ['nature journaling', 'robotics', 'history'],
    schoolYearStart: start,
    schoolYearEnd: end,
    schoolDays: WEEKDAYS,
    flexDay: 5,
    createdAt: new Date().toISOString(),
  };

  const b = (p: Omit<RhythmBlock, 'days'> & { days?: Weekday[] }): RhythmBlock => ({ days: WEEKDAYS, ...p });
  const blocks: RhythmBlock[] = [
    b({ id: 'b-leo-phonics', title: '1-on-1 Phonics', subject: 'phonics', childIds: ['leo'], mode: 'parent', start: '09:00', durationMin: 30, icon: '🔤', steps: ['Letter sound flashcards', 'Read a short word list', 'Trace 3 letters'], curriculumId: 'c-aar' }),
    b({ id: 'b-leo-play', title: 'Lego / Sensory Play', subject: 'free_play', childIds: ['leo'], mode: 'solo', start: '09:30', durationMin: 30, icon: '🧱', steps: ['Build something tall', 'Tell a grown-up about it'] }),
    b({ id: 'b-leo-out', title: 'Outdoor Free Play', subject: 'pe', childIds: ['leo'], mode: 'solo', start: '10:00', durationMin: 30, icon: '🌳', steps: [] }),
    b({ id: 'b-maya-read', title: 'Silent Reading', subject: 'reading', childIds: ['maya'], mode: 'solo', start: '09:00', durationMin: 30, icon: '📖', steps: ['Read 20 minutes of The Secret Garden', 'Write one sentence about what happened'] }),
    b({ id: 'b-maya-math', title: '1-on-1 Math Help', subject: 'math', childIds: ['maya'], mode: 'parent', start: '09:30', durationMin: 30, icon: '🧮', steps: ['Beast Academy 4A practice', 'Check answers together'], curriculumId: 'c-ba' }),
    b({ id: 'b-maya-code', title: 'Typing / Coding', subject: 'other', childIds: ['maya'], mode: 'solo', start: '10:00', durationMin: 30, icon: '⌨️', steps: [] }),
    b({ id: 'b-noah-math', title: 'Pre-Algebra Video + Problem Set', subject: 'math', childIds: ['noah'], mode: 'solo', start: '09:00', durationMin: 30, icon: '📐', steps: ['Watch the lesson video', 'Problems 1–20 (odds)', 'Check & correct'], curriculumId: 'c-saxon' }),
    b({ id: 'b-noah-essay', title: 'History Essay Writing', subject: 'writing', childIds: ['noah'], mode: 'solo', start: '09:30', durationMin: 30, icon: '📝', steps: ['Outline', 'Draft 2 paragraphs'] }),
    b({ id: 'b-noah-lab', title: '1-on-1 Science Lab Review', subject: 'science', childIds: ['noah'], mode: 'parent', start: '10:00', durationMin: 30, icon: '🔬', steps: ['Review lab notes', 'Discuss conclusions'] }),
    b({ id: 'b-family-unit', title: 'Family Unit Study: Botany & Nature Journaling', subject: 'science', childIds: ['leo', 'maya', 'noah'], mode: 'group', start: '10:30', durationMin: 45, icon: '🌱', steps: ['Nature walk', 'Sketch one plant', 'Label its parts'] }),
    b({ id: 'b-maya-seed', title: 'Science: Seed Germination Observation', subject: 'science', childIds: ['maya'], mode: 'solo', start: '11:15', durationMin: 20, icon: '🌱', steps: ['Take a photo of your bean sprout', 'Draw the leaf structure'] }),
    b({ id: 'b-all-walk', title: 'Outdoor Nature Walk / Bike Ride', subject: 'pe', childIds: ['maya', 'noah'], mode: 'solo', start: '13:00', durationMin: 30, icon: '🚲', steps: [] }),
  ];

  const curricula: Curriculum[] = [
    { id: 'c-aar', name: 'All About Reading Level 1', subject: 'phonics', childIds: ['leo'], totalLessons: 60, lessonsDone: 9, startDate: start, targetEndDate: end, schoolDays: WEEKDAYS, model: 'modular' },
    { id: 'c-ba', name: 'Beast Academy 4A–4D', subject: 'math', childIds: ['maya'], totalLessons: 144, lessonsDone: 22, startDate: start, targetEndDate: end, schoolDays: WEEKDAYS, model: 'turnkey' },
    { id: 'c-saxon', name: 'Saxon Algebra ½', subject: 'math', childIds: ['noah'], totalLessons: 123, lessonsDone: 30, startDate: start, targetEndDate: end, schoolDays: WEEKDAYS, model: 'turnkey' },
    { id: 'c-sotw', name: 'Story of the World Vol. 1', subject: 'history', childIds: ['leo', 'maya', 'noah'], totalLessons: 42, lessonsDone: 6, startDate: start, targetEndDate: end, schoolDays: [2, 4], model: 'custom' },
  ];

  return { family, children, blocks, curricula };
}

export function seedCommunity(): { coops: CoOp[]; events: CommunityEvent[]; swaps: SwapListing[] } {
  const t = todayKey();
  return {
    coops: [
      { id: 'co1', name: 'Riverbend Nature Co-op', description: 'Weekly outdoor classes for ages 4–12: botany, tracking, and nature journaling.', meets: 'Tuesdays 10:00 AM', members: ['Sarah K.', 'Hannah W.', 'Priya R.'], duties: [{ label: 'Snack', family: 'Sarah K.' }, { label: 'Lead lesson', family: 'Hannah W.' }, { label: 'Cleanup', family: 'Open' }], joined: false },
      { id: 'co2', name: 'Classical Conversations Community', description: 'Memory work, presentations, and science for K–6; Challenge program for 7+.', meets: 'Thursdays 9:00 AM', members: ['Marcus T.', 'Rachel B.'], duties: [{ label: 'Setup', family: 'Marcus T.' }, { label: 'Tutor', family: 'Rachel B.' }], joined: false },
      { id: 'co3', name: 'Teen Robotics Lab', description: 'FIRST LEGO League team for ages 10–15.', meets: 'Fridays 1:00 PM', members: ['Anh N.', 'Jenna & Luis M.'], duties: [{ label: 'Coach', family: 'Anh N.' }], joined: false },
    ],
    events: [
      { id: 'e1', title: 'Natural History Museum – Homeschool Day', date: addDays(t, 6), location: 'Museum of Nature & Science', ages: 'All ages', host: 'Marcus T.', costPerKid: 8, rsvps: 14, capacity: 30, going: false, carpool: false },
      { id: 'e2', title: 'Creek Study & Macroinvertebrate Hunt', date: addDays(t, 10), location: 'Cherry Creek Trailhead', ages: '6–12', host: 'Sarah K.', costPerKid: 0, rsvps: 9, capacity: 15, going: false, carpool: false },
      { id: 'e3', title: 'Park Day + Curriculum Swap Table', date: addDays(t, 3), location: 'Washington Park, north pavilion', ages: 'All ages', host: 'Hannah W.', costPerKid: 0, rsvps: 22, capacity: 60, going: false, carpool: false },
    ],
    swaps: [
      { id: 's1', title: 'Saxon Math 5/4 – textbook + answer key', subject: 'math', condition: 'good', price: 25, seller: 'Rachel B.', distanceBand: 'within 25 mi', mine: false },
      { id: 's2', title: 'Story of the World Vol. 2 + Activity Book', subject: 'history', condition: 'like_new', price: 30, seller: 'Marcus T.', distanceBand: 'within 5 mi', mine: false },
      { id: 's3', title: 'Snap Circuits Jr. kit', subject: 'science', condition: 'good', price: 15, seller: 'Anh N.', distanceBand: 'within 10 mi', mine: false },
      { id: 's4', title: 'Cuisenaire rods (classroom set)', subject: 'math', condition: 'fair', price: 0, seller: 'Priya R.', distanceBand: 'within 5 mi', mine: false },
    ],
  };
}
