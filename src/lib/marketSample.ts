import { addDays, todayKey } from './dates';
import type { Listing, Review } from './market';
import { ratingSummary } from './market';
import { lessonTotal, outlinePreview } from './package';
import { SAMPLE_OUTLINES, sampleStudioListings } from './studioSample';

/**
 * Sample catalog shown until real sellers are connected (and in local-only
 * mode). Publishers, products, and reviewers are fictional; every entry is
 * flagged `sample` and badged as such in the UI.
 */

type Seed = Omit<Listing, 'id' | 'ratingAvg' | 'ratingCount' | 'createdAt' | 'sample' | 'sellerKind' | 'sellerVerified' | 'esaEligible' | 'familyStyle' | 'includes' | 'lessonSteps'> &
  Partial<Pick<Listing, 'sellerKind' | 'sellerVerified' | 'esaEligible' | 'familyStyle' | 'includes' | 'lessonSteps'>> & { key: string; ratings: number[]; ageDays: number };

const SEEDS: Seed[] = [
  { key: 'brightfield-math-3', title: 'Brightfield Math, Level 3', seller: 'Brightfield Learning', subjects: ['math'], gradeMin: 3, gradeMax: 3, philosophies: ['traditional', 'classical'], format: 'bundle', price: 89, description: 'Spiral-review math with short daily lessons, mental-math warmups, and a cumulative test every fifth lesson. Teacher guide is scripted so any parent can teach it.', includes: ['Student workbook A & B', 'Scripted teacher guide', 'Answer key', 'Printable fact cards'], lessons: 140, lessonsPerWeek: 4, minutesPerLesson: 40, parentInvolvement: 'medium', cover: '🧮', color: '#4C7FD9', lessonSteps: ['Mental-math warmup', 'New lesson', 'Practice set', 'Check answers'], ratings: [5, 5, 4, 5, 4, 5, 3, 5, 5, 4, 5, 4], ageDays: 420 },
  { key: 'brightfield-math-4', title: 'Brightfield Math, Level 4', seller: 'Brightfield Learning', subjects: ['math'], gradeMin: 4, gradeMax: 4, philosophies: ['traditional', 'classical'], format: 'bundle', price: 89, description: 'Multi-digit multiplication, long division, fractions, and geometry with the same spiral approach as Level 3.', includes: ['Student workbook A & B', 'Scripted teacher guide', 'Answer key'], lessons: 140, lessonsPerWeek: 4, minutesPerLesson: 45, parentInvolvement: 'medium', cover: '🧮', color: '#4C7FD9', lessonSteps: ['Mental-math warmup', 'New lesson', 'Practice set', 'Check answers'], ratings: [5, 4, 5, 5, 4, 4, 5, 2, 5], ageDays: 400 },
  { key: 'puzzle-path', title: 'Puzzle Path Math Adventures', seller: 'Owl & Abacus', subjects: ['math'], gradeMin: 2, gradeMax: 5, philosophies: ['unschooling', 'unit_study', 'montessori'], format: 'online', price: 12, description: 'A game-based online course where kids solve puzzles to move through a story world. Adaptive difficulty; parents get a weekly progress email. Price is per month.', includes: ['12 months of access', 'Parent dashboard', 'Printable challenge cards'], lessons: 160, lessonsPerWeek: 5, minutesPerLesson: 25, parentInvolvement: 'low', cover: '🧩', color: '#9B6BD6', lessonSteps: ['Play today\'s puzzle chapter', 'Try one challenge card'], ratings: [5, 5, 5, 4, 5, 4, 5, 5, 3, 4, 5, 5, 4, 5], ageDays: 120 },
  { key: 'golden-bead', title: 'Golden Bead Math at Home', seller: 'Meadowlark Montessori Co.', subjects: ['math'], gradeMin: -1, gradeMax: 2, philosophies: ['montessori'], format: 'bundle', price: 145, description: 'Hands-on place value, addition, and subtraction with real bead materials and an illustrated album of presentations for the parent.', includes: ['Bead materials kit', 'Illustrated presentation album', 'Printable number cards'], lessons: 90, lessonsPerWeek: 3, minutesPerLesson: 30, parentInvolvement: 'high', cover: '🟡', color: '#E3A33B', lessonSteps: ['Set out the materials', 'Presentation', 'Child works independently'], ratings: [5, 5, 4, 5, 5, 4], ageDays: 300 },
  { key: 'pre-algebra-quest', title: 'Pre-Algebra Quest', seller: 'Owl & Abacus', subjects: ['math'], gradeMin: 6, gradeMax: 8, philosophies: ['traditional', 'unschooling'], format: 'online', price: 19, description: 'Video lessons with instant-feedback problem sets, built for self-directed middle schoolers. Price is per month.', includes: ['Video lessons', 'Auto-graded problem sets', 'Parent dashboard'], lessons: 150, lessonsPerWeek: 5, minutesPerLesson: 40, parentInvolvement: 'low', cover: '📐', color: '#3D9970', lessonSteps: ['Watch the lesson video', 'Problem set', 'Fix any misses'], ratings: [4, 5, 4, 3, 5, 4, 4, 5], ageDays: 60 },
  { key: 'little-wren', title: 'Little Wren Phonics, Book 1', seller: 'Little Wren Press', subjects: ['phonics', 'reading'], gradeMin: -1, gradeMax: 1, philosophies: ['charlotte_mason', 'traditional', 'faith_based'], format: 'print', price: 42, description: 'Open-and-go phonics with 10-minute lessons, decodable readers, and multisensory games. Friendly for kids with dyslexia.', includes: ['Lesson book', '6 decodable readers', 'Letter tiles'], lessons: 80, lessonsPerWeek: 4, minutesPerLesson: 15, parentInvolvement: 'high', cover: '🔤', color: '#E07A5F', lessonSteps: ['Letter sounds review', 'New sound', 'Read the decodable page', 'Tile game'], ratings: [5, 5, 5, 5, 4, 5, 5, 4, 5, 5], ageDays: 500 },
  { key: 'little-wren-2', title: 'Little Wren Phonics, Book 2', seller: 'Little Wren Press', subjects: ['phonics', 'reading'], gradeMin: 1, gradeMax: 2, philosophies: ['charlotte_mason', 'traditional', 'faith_based'], format: 'print', price: 42, description: 'Blends, digraphs, and multi-syllable words with longer decodable stories.', includes: ['Lesson book', '6 decodable readers', 'Spelling cards'], lessons: 80, lessonsPerWeek: 4, minutesPerLesson: 20, parentInvolvement: 'high', cover: '🔤', color: '#E07A5F', lessonSteps: ['Review cards', 'New pattern', 'Read the story', 'Dictation'], ratings: [5, 4, 5, 5], ageDays: 200 },
  { key: 'living-books-y3', title: 'Living Books Language Arts, Year 3', seller: 'Fernwood Press', subjects: ['reading', 'writing'], gradeMin: 2, gradeMax: 4, philosophies: ['charlotte_mason', 'nature_forest'], format: 'digital', price: 34, description: 'Narration, copywork, and picture study built around six classic novels. Short lessons, rich books, no busywork.', includes: ['36-week PDF guide', 'Copywork pages', 'Picture study prints'], lessons: 144, lessonsPerWeek: 4, minutesPerLesson: 25, parentInvolvement: 'medium', familyStyle: false, cover: '📚', color: '#3D9970', lessonSteps: ['Read the assigned chapter', 'Oral narration', 'Copywork'], ratings: [5, 5, 4, 5, 5, 5, 4], ageDays: 260 },
  { key: 'morning-basket', title: 'Gather Round Morning Basket', seller: 'Fernwood Press', subjects: ['reading', 'music', 'art'], gradeMin: 0, gradeMax: 8, philosophies: ['charlotte_mason', 'faith_based', 'classical'], format: 'digital', price: 24, description: 'A whole-family morning time plan: poetry, hymn or folk song, composer and artist study, and a read-aloud. Everyone together, about 30 minutes.', includes: ['36 weekly plans', 'Poetry & song booklet', 'Artist prints'], lessons: 180, lessonsPerWeek: 5, minutesPerLesson: 30, parentInvolvement: 'high', familyStyle: true, cover: '🧺', color: '#D9578B', lessonSteps: ['Poem of the week', 'Song', 'Picture or composer study', 'Read-aloud'], ratings: [5, 5, 5, 4, 5, 5, 5, 5, 4], ageDays: 340 },
  { key: 'writers-workshop', title: "Young Writer's Workshop", seller: 'Lamplight Writing Studio', subjects: ['writing'], gradeMin: 5, gradeMax: 8, philosophies: ['classical', 'traditional'], format: 'online', price: 129, description: 'Self-paced video course on paragraphs, essays, and persuasive writing with rubric-based parent grading.', includes: ['Video lessons', 'Rubrics', 'Sample essays'], lessons: 72, lessonsPerWeek: 2, minutesPerLesson: 45, parentInvolvement: 'low', cover: '📝', color: '#4C7FD9', lessonSteps: ['Watch the lesson', 'Writing assignment', 'Self-check with the rubric'], ratings: [4, 4, 5, 3, 4, 5], ageDays: 90 },
  { key: 'story-of-earth', title: 'Atlas & Quill World History, Vol. 1', seller: 'Atlas & Quill', subjects: ['history', 'geography'], gradeMin: 1, gradeMax: 6, philosophies: ['classical', 'charlotte_mason', 'unit_study'], format: 'bundle', price: 68, description: 'Narrative world history from the first farmers to the fall of Rome. Read-aloud chapters, map work, and hands-on projects at three levels so siblings learn together.', includes: ['Read-aloud text', 'Activity guide with 3 levels', 'Map pack'], lessons: 42, lessonsPerWeek: 2, minutesPerLesson: 45, parentInvolvement: 'high', familyStyle: true, cover: '🏛️', color: '#9B6BD6', lessonSteps: ['Read the chapter aloud', 'Map work', 'Narration or project'], ratings: [5, 5, 4, 5, 5, 4, 5, 3, 5, 5, 4], ageDays: 700 },
  { key: 'american-story', title: 'Our American Story', seller: 'Atlas & Quill', subjects: ['history', 'civics'], gradeMin: 3, gradeMax: 8, philosophies: ['classical', 'traditional', 'unit_study'], format: 'bundle', price: 72, description: 'U.S. history through primary sources, biographies, and timelines, with a civics strand on how government works.', includes: ['Student reader', 'Primary source pack', 'Timeline cards'], lessons: 36, lessonsPerWeek: 2, minutesPerLesson: 40, parentInvolvement: 'medium', familyStyle: true, cover: '🗽', color: '#E07A5F', lessonSteps: ['Read', 'Primary source discussion', 'Timeline entry'], ratings: [4, 5, 4, 4, 5], ageDays: 150 },
  { key: 'pinecone-botany', title: 'Pinecone Science: Botany & Seasons', seller: 'Pinecone Science Co.', subjects: ['science'], gradeMin: 0, gradeMax: 5, philosophies: ['nature_forest', 'charlotte_mason', 'montessori'], format: 'digital', price: 29, description: 'Outdoor-first science: weekly nature walks, seed experiments, and nature-journal prompts across the seasons.', includes: ['PDF guide', 'Nature journal pages', 'Supply list'], lessons: 36, lessonsPerWeek: 1, minutesPerLesson: 60, parentInvolvement: 'medium', familyStyle: true, cover: '🌱', color: '#3D9970', lessonSteps: ['Nature walk', 'Observe and sketch', 'Journal prompt'], ratings: [5, 5, 5, 4, 5, 5, 5, 4, 5, 5, 5, 5, 4], ageDays: 230 },
  { key: 'pinecone-chem', title: 'Pinecone Science: Kitchen Chemistry', seller: 'Pinecone Science Co.', subjects: ['science'], gradeMin: 3, gradeMax: 7, philosophies: ['unit_study', 'unschooling', 'nature_forest'], format: 'digital', price: 29, description: 'Thirty experiments with things already in your kitchen, each with a one-page lab sheet.', includes: ['PDF guide', 'Lab sheets', 'Supply list'], lessons: 30, lessonsPerWeek: 1, minutesPerLesson: 50, parentInvolvement: 'medium', cover: '⚗️', color: '#E3A33B', lessonSteps: ['Gather supplies', 'Predict', 'Experiment', 'Lab sheet'], ratings: [5, 4, 5, 5, 4], ageDays: 40 },
  { key: 'physical-science', title: 'Foundations of Physical Science', seller: 'Northstar Classical', subjects: ['science'], gradeMin: 7, gradeMax: 9, philosophies: ['classical', 'faith_based', 'traditional'], format: 'bundle', price: 118, description: 'A rigorous text with labs, module tests, and a solutions manual; prepares for high school biology and chemistry.', includes: ['Textbook', 'Student notebook', 'Solutions & tests'], lessons: 112, lessonsPerWeek: 4, minutesPerLesson: 50, parentInvolvement: 'low', cover: '🔬', color: '#4C7FD9', lessonSteps: ['Read the section', 'On-your-own questions', 'Notebook'], ratings: [4, 4, 3, 5, 4, 4, 5], ageDays: 480 },
  { key: 'faith-heroes', title: 'Heroes of Faith Bible Study', seller: 'Harbor Light Books', subjects: ['bible'], gradeMin: 1, gradeMax: 6, philosophies: ['faith_based'], format: 'print', price: 26, description: 'Weekly family Bible study with memory verses, coloring pages, and discussion questions for different ages.', includes: ['Family guide', 'Memory verse cards', 'Coloring pages'], lessons: 36, lessonsPerWeek: 1, minutesPerLesson: 30, parentInvolvement: 'high', familyStyle: true, cover: '🕊️', color: '#9B6BD6', lessonSteps: ['Read the passage', 'Memory verse', 'Discussion'], ratings: [5, 5, 4, 5], ageDays: 320 },
  { key: 'spanish-explorers', title: 'Spanish Explorers', seller: 'Puente Languages', subjects: ['foreign_language'], gradeMin: 1, gradeMax: 6, philosophies: ['traditional', 'unschooling', 'unit_study'], format: 'online', price: 15, description: 'Songs, stories, and short speaking games with native-speaker videos. Price is per month.', includes: ['Video lessons', 'Printable flashcards', 'Song downloads'], lessons: 120, lessonsPerWeek: 3, minutesPerLesson: 20, parentInvolvement: 'low', familyStyle: true, cover: '🌎', color: '#E07A5F', lessonSteps: ['Song', 'Story video', 'Speaking game'], ratings: [4, 5, 4, 4, 3, 5], ageDays: 75 },
  { key: 'art-studio', title: 'Open Studio Art for Kids', seller: 'Copper Kettle Studio', subjects: ['art'], gradeMin: 0, gradeMax: 8, philosophies: ['unschooling', 'montessori', 'charlotte_mason', 'nature_forest'], format: 'online', price: 49, description: 'Weekly video art projects with drawing, watercolor, and clay. Every project has an easier and a harder version.', includes: ['36 video projects', 'Supply list'], lessons: 36, lessonsPerWeek: 1, minutesPerLesson: 45, parentInvolvement: 'low', familyStyle: true, cover: '🎨', color: '#D9578B', lessonSteps: ['Watch the project video', 'Create', 'Share your art'], ratings: [5, 5, 5, 5, 4, 5, 5], ageDays: 180 },
  { key: 'piano-start', title: 'Piano Starts Here', seller: 'Copper Kettle Studio', subjects: ['music'], gradeMin: 1, gradeMax: 8, philosophies: ['traditional', 'unschooling'], format: 'online', price: 18, description: 'Short daily piano lessons with on-screen feedback; works with any keyboard. Price is per month.', includes: ['Video lessons', 'Sheet music'], lessons: 150, lessonsPerWeek: 5, minutesPerLesson: 15, parentInvolvement: 'low', cover: '🎹', color: '#3D9970', lessonSteps: ['Warm-up', 'New piece', 'Practice'], ratings: [4, 4, 5, 3], ageDays: 30 },
  { key: 'life-skills', title: 'Home Ec for Kids: 30 Real-Life Skills', seller: 'Wildflower Path', subjects: ['life_skills'], gradeMin: 2, gradeMax: 8, philosophies: ['unschooling', 'montessori', 'nature_forest', 'faith_based'], format: 'digital', price: 19, description: 'Cooking, laundry, budgeting, simple repairs, and first aid — one skill a week with a checklist to master it.', includes: ['PDF skill cards', 'Mastery checklists'], lessons: 30, lessonsPerWeek: 1, minutesPerLesson: 40, parentInvolvement: 'medium', familyStyle: true, cover: '🧺', color: '#E3A33B', lessonSteps: ['Learn the skill', 'Practice together', 'Do it solo'], ratings: [5, 4, 5, 5, 5], ageDays: 110 },
  { key: 'unit-oceans', title: 'Deep Blue: Ocean Unit Study', seller: 'Wildflower Path', subjects: ['science', 'geography', 'reading'], gradeMin: 0, gradeMax: 6, philosophies: ['unit_study', 'nature_forest', 'charlotte_mason'], format: 'digital', price: 14, description: 'Six weeks of ocean science, map work, and literature for the whole family, with tiered activities by age.', includes: ['PDF guide', 'Book list', 'Printable activities'], lessons: 30, lessonsPerWeek: 5, minutesPerLesson: 45, parentInvolvement: 'medium', familyStyle: true, cover: '🐋', color: '#4C7FD9', lessonSteps: ['Read-aloud', 'Map or science activity', 'Notebook page'], ratings: [5, 5, 4, 5], ageDays: 20 },
  { key: 'free-nature-journal', title: 'Free Nature Journal Starter', seller: 'Pinecone Science Co.', subjects: ['science', 'art'], gradeMin: 0, gradeMax: 8, philosophies: ['nature_forest', 'charlotte_mason'], format: 'digital', price: 0, description: 'A free four-week introduction to nature journaling with printable pages.', includes: ['PDF guide', 'Journal pages'], lessons: 8, lessonsPerWeek: 2, minutesPerLesson: 30, parentInvolvement: 'medium', familyStyle: true, cover: '🍃', color: '#3D9970', lessonSteps: ['Go outside', 'Sketch one thing', 'Write what you noticed'], ratings: [5, 5, 4, 5, 5, 4, 5], ageDays: 365 },
  { key: 'free-typing', title: 'Free Typing Club Basics', seller: 'Owl & Abacus', subjects: ['other'], gradeMin: 2, gradeMax: 8, philosophies: ['traditional', 'unschooling'], format: 'online', price: 0, description: 'Free typing lessons with games and badges.', includes: ['Online lessons'], lessons: 40, lessonsPerWeek: 3, minutesPerLesson: 15, parentInvolvement: 'low', cover: '⌨️', color: '#9B6BD6', lessonSteps: ['Warm-up drill', "Today's lesson", 'Speed game'], ratings: [4, 4, 5, 3, 4], ageDays: 260 },
  // Used, from families
  { key: 'used-atlas', title: 'Atlas & Quill World History Vol. 2 + Activity Guide (used)', seller: 'Marcus T.', sellerKind: 'family', sellerVerified: false, condition: 'like_new', subjects: ['history'], gradeMin: 1, gradeMax: 6, philosophies: ['classical', 'charlotte_mason'], format: 'print', price: 30, description: 'Used one year, no writing inside. Local pickup or I can ship.', includes: ['Read-aloud text', 'Activity guide'], lessons: 42, lessonsPerWeek: 2, minutesPerLesson: 45, parentInvolvement: 'high', familyStyle: true, cover: '🏛️', color: '#9B6BD6', lessonSteps: ['Read the chapter aloud', 'Map work', 'Narration or project'], esaEligible: false, ratings: [], ageDays: 6 },
  { key: 'used-brightfield', title: 'Brightfield Math Level 2 set (used)', seller: 'Hannah W.', sellerKind: 'family', sellerVerified: false, condition: 'good', subjects: ['math'], gradeMin: 2, gradeMax: 2, philosophies: ['traditional', 'classical'], format: 'print', price: 35, description: 'Teacher guide and answer key in great shape; student workbook is new (unused).', includes: ['Teacher guide', 'Answer key', 'New workbook'], lessons: 140, lessonsPerWeek: 4, minutesPerLesson: 35, parentInvolvement: 'medium', cover: '🧮', color: '#4C7FD9', lessonSteps: ['Warmup', 'New lesson', 'Practice set'], esaEligible: false, ratings: [], ageDays: 3 },
  { key: 'used-phonics', title: 'Little Wren Phonics Book 1 + readers (used)', seller: 'Sarah K.', sellerKind: 'family', sellerVerified: false, condition: 'good', subjects: ['phonics', 'reading'], gradeMin: -1, gradeMax: 1, philosophies: ['charlotte_mason', 'traditional'], format: 'print', price: 22, description: 'All six readers included. A few pencil marks in the lesson book.', includes: ['Lesson book', '6 readers'], lessons: 80, lessonsPerWeek: 4, minutesPerLesson: 15, parentInvolvement: 'high', cover: '🔤', color: '#E07A5F', lessonSteps: ['Letter sounds review', 'New sound', 'Read the decodable page'], esaEligible: false, ratings: [], ageDays: 12 },
];

const AUTHORS = ['Hannah W.', 'Marcus T.', 'Sarah K.', 'Priya N.', 'Jordan B.', 'Elena R.', 'Sam O.', 'Grace L.', 'Tomás V.', 'Aisha M.', 'Ben C.', 'Lily P.', 'Rosa G.', 'Kenji H.'];
const GRADES = ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade'];

const TEMPLATES: Record<number, { title: string; body: string }[]> = {
  5: [
    { title: 'Exactly what we needed', body: 'Open-and-go and my kid actually asks to do it. The lessons are short enough that we never fight about it.' },
    { title: 'Our favorite this year', body: 'Clear, gentle, and thorough. We finished early and started the next level.' },
    { title: 'Works for my two very different learners', body: 'One rushes, one needs time. The format lets both work at their own pace.' },
    { title: 'Worth every penny', body: 'Beautifully made and well paced. I spend less time planning and more time teaching.' },
  ],
  4: [
    { title: 'Solid, with a few gaps', body: 'Really good overall. I add some extra practice for review, but the core is excellent.' },
    { title: 'Great content, busy weeks', body: 'Some weeks felt long, so we spread lessons out. Freerange re-pacing helped a lot.' },
    { title: 'Kids like it', body: 'Engaging and well explained. A couple of activities needed supplies we didn’t have.' },
  ],
  3: [
    { title: 'Okay for us', body: 'Fine material, but my child needed more hands-on work than this offers.' },
    { title: 'Mixed feelings', body: 'Some lessons are great, others felt like busywork. We use it alongside other resources.' },
  ],
  2: [{ title: 'Not a fit for my learner', body: 'Too much repetition for a child who gets it quickly. Might suit others better.' }],
  1: [{ title: 'Didn’t work for us', body: 'We stopped after a few weeks. The pace and style weren’t right for our family.' }],
};

function sampleReviews(seed: Seed, idx: number): Review[] {
  return seed.ratings.map((rating, i) => {
    const t = TEMPLATES[rating][(idx + i) % TEMPLATES[rating].length];
    return {
      id: `r-${seed.key}-${i}`,
      listingId: `l-${seed.key}`,
      author: AUTHORS[(idx * 3 + i) % AUTHORS.length],
      rating: rating as Review['rating'],
      title: t.title,
      body: t.body,
      childGrade: GRADES[Math.min(GRADES.length - 1, Math.max(0, seed.gradeMin + ((i + idx) % (seed.gradeMax - seed.gradeMin + 1))))],
      createdAt: `${addDays(todayKey(), -Math.max(1, Math.round(seed.ageDays * ((i + 1) / (seed.ratings.length + 1)))))}T12:00:00.000Z`,
      verified: (i + idx) % 4 !== 3,
      helpful: (idx * 7 + i * 5) % 23,
      sample: true,
    };
  });
}

export function sampleCatalog(): { listings: Listing[]; reviews: Review[] } {
  const listings: Listing[] = [];
  const reviews: Review[] = [];
  SEEDS.forEach((s, idx) => {
    const { key, ratings: _r, ageDays, ...rest } = s;
    const rs = sampleReviews(s, idx);
    const sum = ratingSummary(rs);
    listings.push({
      sellerKind: 'publisher',
      sellerVerified: true,
      esaEligible: true,
      familyStyle: false,
      includes: [],
      lessonSteps: [],
      ...rest,
      id: `l-${key}`,
      ratingAvg: sum.avg,
      ratingCount: sum.count,
      createdAt: `${addDays(todayKey(), -ageDays)}T12:00:00.000Z`,
      sample: true,
    });
    reviews.push(...rs);
  });
  // Sample listings with a full lesson plan, and creator (Studio) listings.
  for (const l of listings) {
    const content = SAMPLE_OUTLINES[l.id];
    if (content) Object.assign(l, { packageId: `pk-${l.id}`, outline: outlinePreview(content.units), lessons: lessonTotal(content.units), license: content.license });
  }
  listings.push(...sampleStudioListings().map((p) => p.listing));
  return { listings, reviews };
}
