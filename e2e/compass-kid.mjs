// Compass & kid mode journeys on the local-only web build, from a seeded family
// (see compass-helpers.mjs).
// Run: `EXPO_PUBLIC_FREERANGE_LOCAL_ONLY=1 npx expo start --web --port 8091`, then
// `BASE_URL=http://localhost:8091 node e2e/compass-kid.mjs` (W=390 H=844 for phone size).
import { ADA, BEN, click, clickLabel, errors, expect, expectNot, fill, finish, goto, load, log, OUT, openMission, page, pin, printed, run, scenario, seed, sleep, store, TODAY, TOMORROW, W, bodyText } from './compass-helpers.mjs';

async function run_() {
  await load(seed);

  scenario('Flight Deck: conflict on a seeded day');
  await expect('Family Flight Deck');
  await expect('1 parent conflict', 'Ada’s writing and Ben’s phonics both need Pat at 9:00');
  await click('Auto-stagger 1-on-1s');
  await expect('Rescheduled', 'stagger toast');
  await expectNot('parent conflict', 'conflict cleared');
  const staggered = (await store()).tasks.filter((t) => t.date === TODAY && t.mode === 'parent').map((t) => t.start).sort();
  log(staggered.join() === '09:00,09:30', `1-on-1s now back to back (${staggered.join()})`);
  await page.screenshot({ path: `${OUT}compass-${W}-deck.png` });

  scenario('Kid picker + PINs');
  await click('Kid mode');
  await expect("Who's learning today?");
  await click('Ben');
  await expect('How are you feeling today? 🔊', 'Ben (5) gets the read-aloud mood check without a PIN');
  await click('Happy');
  await expect('🗺️ My day', 'non-reader day map');
  await click('for help');
  await expect('Pat got your message', 'help sent (neutral wording)');
  await click('OK', { exact: true });
  await click('Switch kid');
  await click('Ada');
  await expect('Enter your secret code');
  await pin('1111');
  await expect('Try again', 'wrong kid PIN rejected');
  await sleep(600);
  await pin('1357');
  await expect('How are you feeling today?');
  await click('Okay');
  await expect('Your missions today (0 of 3 done)');

  scenario('Kid lock: parent areas stay closed');
  const benTask = (await store()).tasks.find((t) => t.childId === BEN && t.date === TODAY);
  for (const path of ['/today', '/settings', '/records/hours', '/account', '/onboarding', '/notifications', `/kid/${BEN}`]) {
    await goto(path);
    const t = await bodyText();
    log(t.includes('Switch kid') && t.includes('Ada!') && !t.includes('Change parent PIN'), `${path} → Ada’s own day`);
  }
  await goto(`/kid/task/${benTask.id}`);
  await expect('Mission not found', 'another kid’s mission does not open');
  log((await store()).mode.kind === 'kid', 'still in kid mode');
  await goto('/');
  await expect('Your missions today', 'home goes to the kid’s day');

  scenario('Mission: lesson card hides the answer key');
  log(await openMission('Fraction practice'), 'opened Fraction practice');
  await expect('Lesson 1 of 30: Halves 1');
  await expect('1 worksheet question');
  const card = await bodyText();
  log(!/ANSWER-|NOTE-|answer key/i.test(card), 'no answers, notes, or key button in kid mode');
  await click('Print worksheet');
  await sleep(700);
  const sheet = await printed();
  log(sheet.includes('What is half of 2?') && !/ANSWER-|NOTE-/.test(sheet), 'kid worksheet prints the question, not the answer');

  scenario('Mission: steps, tricky self-assessment, sparks');
  await click('Fold the paper');
  log((await store()).tasks.find((t) => t.blockId === 'b-frac' && t.date === TODAY).status === 'in_progress', 'ticking a step starts the mission');
  await click("I'm done!");
  await click('😕 Tricky');
  await fill('e.g. Today I learned…', '   ');
  await click('Mark complete ✓');
  await expect('+10 Sparks', 'a blank reflection earns no bonus (and says so)');
  await expect('Your missions today (1 of 3 done)');
  const s1 = await store();
  const frac = s1.tasks.find((t) => t.blockId === 'b-frac' && t.date === TODAY);
  log(frac.status === 'done' && frac.selfAssessment === 1 && frac.lessonNo === 1 && !frac.reflection, 'done, marked tricky, lesson 1 recorded');
  log(s1.children.find((k) => k.id === ADA).sparks === 60, 'sparks 50 → 60');
  log(s1.curricula[0].progress[ADA] === 1, 'Ada is on lesson 2 now');

  scenario('Help queue: ask, and a while-you-wait suggestion');
  await click('for help');
  await expect('While you wait, try:');
  await expect('Silent reading', 'suggests her next solo mission');
  await click('Start it');
  await expect('Read 20 minutes', 'opens the suggested mission');
  await expect('Pat got your message', 'help already requested');
  await click('‹ My day');

  scenario('Days: looking back');
  await clickLabel('Previous day');
  await expect('looking back');
  await expect('○ Not finished', 'yesterday’s unfinished work is labelled');
  await expect('✓ Done');
  await expectNot('for help', 'no help button on past days');
  await click('Back to today');
  await expect('Your missions today');

  scenario('Days: start early');
  await clickLabel('Next day');
  await expect('coming up');
  await expect('🚀 Start early?');
  const before = (await store()).tasks.filter((t) => t.childId === ADA && t.date === TOMORROW).length;
  log(await openMission('Silent reading'), 'opened tomorrow’s reading');
  await expect('Planned for');
  await expectNot('for help', 'no help on an upcoming mission');
  await click('Start it now');
  await expect("I'm done!", 'started early');
  const s2 = await store();
  const early = s2.tasks.find((t) => t.childId === ADA && t.blockId === 'b-read' && t.bumpedFrom === TOMORROW);
  log(early?.date === TODAY && early.status === 'in_progress', 'moved to today, remembers its planned day');
  await click('‹ My day');
  await expect('coming up');
  await sleep(500);
  const after = (await store()).tasks.filter((t) => t.childId === ADA && t.date === TOMORROW).length;
  log(after === before - 1, `tomorrow has one mission fewer and it is not recreated (${before} → ${after})`);
  await click('Back to today');
  await expect('Your missions today (1 of 4 done)', 'today now counts the early mission');

  scenario('Grown-up exit');
  await click('Grown-up exit');
  await pin('1234');
  await expect('Try again', 'wrong parent PIN rejected');
  await sleep(600);
  await pin('2468');
  await expect('Family Flight Deck');
  await expect('Help queue (2 waiting)');
  await expect('doing “Lego time” meanwhile', 'Ben’s filler shows in the queue');
  await page.screenshot({ path: `${OUT}compass-${W}-help.png` });

  scenario('Answer key for grown-ups');
  await click('›', { exact: true });
  await sleep(500);
  const fracLabel = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') ?? '').startsWith('Fraction practice,'))?.getAttribute('aria-label'));
  log(!!fracLabel, 'tomorrow’s fraction lesson on the timeline');
  await clickLabel(fracLabel);
  await expect('Lesson 2 of 30: Halves 2');
  await click('Show answer key');
  await expect('ANSWER-2', 'parent sees the answer');
  await expect('NOTE-2', 'parent sees the notes');
  await page.keyboard.press('Escape');
  await click('Close', { exact: false }).catch(() => {});
  await click('Answer key');
  await sleep(700);
  const key_ = await printed();
  log(key_.includes('ANSWER-2') && key_.includes('NOTE-2'), 'the printed key has answers and notes');
  await click('Today', { exact: false });

  scenario('Removing a child clears their help request');
  await click('⚙️  Settings', { exact: true });
  await click('Ben');
  await click('Remove Ben');
  await click('Remove', { exact: true });
  await expectNot('Kindergarten', 'Ben is gone');
  await goto('/today');
  await expect('Help queue (1 waiting)', 'only Ada still waiting (Ben’s request went with him)');
  await click('On my way ✓');
  await expect('No one needs you right now.');

  scenario('Gentle bump');
  await click('Bump remaining');
  await expect('Next school day', 'every day is a school day here');
  await click('Next school day');
  await expect('Bumped', 'bump toast');
  const s3 = await store();
  log(s3.tasks.filter((t) => t.date === TODAY && (t.status === 'todo' || t.status === 'in_progress')).length === 0, 'nothing unfinished left today');
  log(s3.tasks.some((t) => t.date === TOMORROW && t.bumpedFrom === TODAY), 'bumped work sits on tomorrow');

  scenario('Bump with no school days (regression)');
  await load({ ...seed, family: { ...seed.family, schoolDays: [], familyName: `No Days ${run}` } });
  await expect('Family Flight Deck');
  await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].find((e) => e.innerText?.trim() === '✏️ Writing with Pat')?.click());
  await click('Bump remaining');
  await expect('No school days are set', 'explains why there is nowhere to bump');
  await expectNot('Only tasks from now on', 'no “from now on” button that has no target');
  log(!errors.some((e) => e.includes('PAGEERROR')), 'no crash');
  await page.keyboard.press('Escape');

  scenario('Backups');
  await load(seed);
  const backup = await page.evaluate(() => {
    const { state } = JSON.parse(localStorage.getItem('freerange-v1'));
    state.family.familyName = 'Restored Crew';
    return JSON.stringify({ app: 'freerange', version: 1, exportedAt: new Date().toISOString(), data: state });
  });
  await goto('/settings');
  for (const bad of ['not json', '{"app":"freerange","data":{"tasks":"x"}}']) {
    await click('Import backup');
    await page.evaluate(() => [...document.querySelectorAll('textarea')].filter((t) => t.offsetParent).at(-1).focus());
    await page.keyboard.down('Meta'); await page.keyboard.press('a'); await page.keyboard.up('Meta');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(bad);
    await click('Import', { exact: true });
    await expect('Not a Freerange backup file', `rejects ${bad}`);
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  log((await store()).family.familyName === seed.family.familyName, 'bad backups change nothing');
  await click('Import backup');
  await page.evaluate((text) => {
    const t = [...document.querySelectorAll('textarea')].filter((x) => x.offsetParent).at(-1);
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(t, text);
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }, backup);
  await sleep(300);
  await click('Import', { exact: true });
  await expect('Restored Crew', 'a real backup restores the family');
  log((await store()).mode.kind === 'parent', 'import lands in parent mode');
}


await finish(run_, 'Compass kid-mode');
