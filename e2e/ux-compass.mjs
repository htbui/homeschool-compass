// The Compass-area findings from the design review (C-01 … C-30), checked in the DOM on the
// local-only build, at desktop and phone size. Every check is labelled with its finding id.
//   BASE_URL=http://localhost:8082 node e2e/ux-compass.mjs
//   BASE_URL=http://localhost:8082 W=390 H=844 node e2e/ux-compass.mjs
// (The signed-in parts of C-05 — forgot / change password — are in ux-compass-cloud.mjs.)
import { ADA, ALL, BEN, block, bodyText, click, clickLabel, day, expect, expectNot, fill, finish, goto, goTab, has, load, log, OUT, page, pin, run, scenario, seed, sleep, store, TODAY, TOMORROW, W, H } from './compass-helpers.mjs';

const phone = W < 700;
const shot = (name) => page.screenshot({ path: `${OUT}ux-compass-${name}-${W}.png` });
const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const todayWeekday = new Date().getDay();

/** Bounding boxes of visible elements matching a selector and (optionally) exact text or aria-label. */
const boxes = (sel, match) =>
  page.evaluate((sel, match) =>
    [...document.querySelectorAll(sel)]
      .filter((e) => e.offsetParent !== null && (!match || e.innerText?.trim() === match || e.getAttribute('aria-label') === match))
      .map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right, text: e.innerText?.trim().slice(0, 40), label: e.getAttribute('aria-label') }; }), sel, match);
const box = async (sel, match) => (await boxes(sel, match)).at(-1);
const btn = (text) => box('[role="button"],button', text);
const labels = () => page.evaluate(() => [...document.querySelectorAll('[aria-label]')].filter((e) => e.offsetParent).map((e) => e.getAttribute('aria-label')));

/** A family whose rhythm runs every day, plus one task happening right now. */
const nowTask = () => ({ id: `now-${run}`, childId: ADA, date: TODAY, title: 'Pond study', subject: 'science', mode: 'solo', start: clock(Math.max(0, Math.min(minutesNow() - 5, 23 * 60))), durationMin: 50, icon: '🐸', steps: [], status: 'todo' });

async function main() {
  // ───────────────────────────── Today
  await load({ ...seed, tasks: [...seed.tasks, nowTask()] });

  scenario('C-01 Today agenda');
  await expect('Family Flight Deck');
  await expect('The day');
  const rows = (await labels()).filter((l) => /, (Ada|Ben)(, .*)?, \d+:\d\d (AM|PM)$/.test(l));
  log(rows.length >= 5, `C-01 every task is a labelled agenda row with kid and time (${rows.length})`);
  await expect('needs you', 'C-01 parent-time slots are called out');
  const order = await page.evaluate(() => {
    const ls = [...document.querySelectorAll('[aria-label]')].filter((e) => e.offsetParent).map((e) => e.getAttribute('aria-label'));
    return [ls.findIndex((l) => l.startsWith('Writing with Pat,')), ls.findIndex((l) => l.startsWith('Phonics with Pat,'))];
  });
  log(order[0] >= 0 && order[1] >= 0, 'C-01 both 9:00 1-on-1s listed in the same slot');
  const noSideScroll = await page.evaluate(() => [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.innerText?.includes('Fraction practice') && e.innerText.length < 4000).every((e) => e.scrollWidth <= e.clientWidth + 2));
  log(noSideScroll, 'C-01 the day never needs a sideways swipe');
  await expect('Now', 'C-01 a Now / Next card on today');
  log((await labels()).some((l) => l === 'Now and next'), 'C-01 Now / Next is announced');
  await expect('Pond study', 'C-01 what is happening now is listed');
  if (!phone) {
    await click('Timeline', { exact: true });
    await sleep(500);
    const lanes = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('[aria-label]')].filter((e) => e.offsetParent && /, \d+:\d\d (AM|PM)$/.test(e.getAttribute('aria-label')) && !/, (Ada|Ben)/.test(e.getAttribute('aria-label')));
      const card = blocks[0]?.closest('[data-testid]') ?? blocks[0]?.parentElement?.parentElement?.parentElement?.parentElement;
      const right = Math.max(...blocks.map((b) => b.getBoundingClientRect().right));
      return { n: blocks.length, right, vw: document.documentElement.clientWidth, cardRight: card?.getBoundingClientRect().right ?? 0 };
    });
    log(lanes.n >= 5 && lanes.right <= lanes.vw, `C-01 desktop timeline fits the width (${Math.round(lanes.right)} ≤ ${lanes.vw})`);
    log((await labels()).includes('Now'), 'C-01 the timeline draws a "now" line');
    await click('Agenda', { exact: true });
  } else {
    log(!(await has('Timeline')), 'C-01 phones get the agenda only');
  }
  await shot('today');

  scenario('C-09 Today header and help');
  for (const [name, sel] of [['Previous day', '‹'], ['Next day', '›']]) {
    const b = (await boxes('[role="button"],button', name)).at(-1) ?? (await btn(sel));
    log(b && b.h >= 44 && b.w >= 44, `C-09 ${name} is at least 44 px (${b && `${Math.round(b.w)}×${Math.round(b.h)}`})`);
  }
  for (const t of ['🖨️  Print day', '＋  Task', '↪︎  Bump remaining']) {
    const b = await btn(t);
    log(b && b.h >= 44, `C-09 "${t.slice(3).trim()}" is 44 px tall (${b && Math.round(b.h)})`);
  }
  const bell = (await boxes('[aria-label^="Notifications"]')).at(-1);
  log(bell && bell.h >= 44 && bell.w >= 44, `C-09 bell is 44 px (${bell && `${Math.round(bell.w)}×${Math.round(bell.h)}`})`);
  log((await labels()).some((l) => /^Days this year: /.test(l)), 'C-09 "Days this year" is a button');
  await clickLabel((await labels()).find((l) => /^Days this year: /.test(l)));
  log(await page.waitForFunction(() => location.pathname === '/records/hours', { timeout: 5000 }).then(() => true, () => false), 'C-09 Days this year opens Hours');
  await load({ ...seed, help: [{ id: `h-${run}`, childId: ADA, taskId: undefined, createdAt: new Date(Date.now() - 3 * 60000).toISOString() }] });
  await expect('Ada needs help', 'C-09 a help banner sits above everything');
  const banner = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="alert"]')].find((e) => e.offsetParent && e.innerText.includes('needs help'));
    const r = el?.getBoundingClientRect();
    return r ? { top: r.top, hasButton: el.innerText.includes('On my way') } : null;
  });
  log(banner && banner.top < 120 && banner.hasButton, `C-09 the banner is at the top with "On my way" (${banner?.top})`);
  log((await labels()).some((l) => /^Help waiting: 1/.test(l)), 'C-09 "Help waiting" is a button');
  await click('On my way ✓');
  await expectNot('Ada needs help', 'C-09 the banner clears once answered');

  scenario('C-02 Empty day → next school day; first week');
  const notToday = ALL.filter((d) => d !== todayWeekday);
  await load({ ...seed, tasks: [], blocks: seed.blocks.map((b) => ({ ...b, days: notToday })) });
  await expect('Nothing scheduled today', 'C-02 today is empty');
  await expect('Next school day:', 'C-02 previews the next school day');
  await expect('Fraction practice', 'C-02 the preview lists its work');
  await click(`Go to tomorrow`, { exact: true });
  await expect('Done today', 'still on Today');
  log((await bodyText()).includes(new Date(`${TOMORROW}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })), 'C-02 "Go to tomorrow" opens that day');
  await expect('Your first week', 'C-02 a new family sees "Your first week"');
  await expect('File your NOI');
  await expect('Try kid mode');
  await click('Hide', { exact: true });
  await expectNot('Your first week', 'C-02 the card can be hidden');
  log((await store()).family.firstWeekDismissed === true, 'C-02 hiding it is remembered');
  // The demo family opens on a day with work.
  await page.evaluate(() => localStorage.clear());
  await goto('/onboarding');
  await click('Explore with a demo family');
  await expect('Family Flight Deck');
  log(!(await has('Nothing scheduled')), 'C-02 the demo family opens on a school day');

  scenario('C-06 / C-24 Add a task in place');
  await load(seed);
  await click('＋  Task', { exact: true });
  await expect('One-off task', 'C-06 the one-off form opens on Today');
  log(await page.evaluate(() => location.pathname === '/today'), 'C-06 still on /today');
  const picked = await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"]')].filter((e) => e.offsetParent && /Ada|Ben/.test(e.innerText)).map((e) => e.getAttribute('aria-checked')));
  log(picked.length === 2 && picked.every((x) => x === 'false'), `C-24 no child is preselected with two kids (${picked.join()})`);
  log(await page.evaluate(() => [...document.querySelectorAll('input')].some((e) => e.offsetParent && e.getAttribute('placeholder') === 'e.g. Piano practice')), 'C-24 neutral "e.g. Piano practice" example');
  await fill('e.g. Piano practice', 'Clay modelling');
  await expect('at least one child', 'C-24 Save says a child is still needed');
  await click('🦖 Ben', { exact: true });
  await fill('e.g. 9:30 AM', '2pm');
  await click('Save', { exact: true });
  await expect('Added a task', 'C-06 saved with a confirmation');
  log(await page.evaluate(() => location.pathname === '/today'), 'C-06 the parent stays on Today');
  log((await store()).tasks.some((t) => t.title === 'Clay modelling' && t.childId === BEN && t.date === TODAY), 'C-24 saved for the kid who was picked');
  await click('＋  Task', { exact: true });
  await click('Cancel', { exact: true });
  log(await page.evaluate(() => location.pathname === '/today'), 'C-06 Cancel stays on Today');

  scenario('C-07 Task sheet');
  await clickLabel((await labels()).find((l) => l.startsWith('Fraction practice,')));
  await expect('Mark done ✓');
  await expectNot('Update time', 'C-07 no "Update time" until something changes');
  await expectNot('Delete task', 'C-07 Delete is tucked away');
  const done = await btn('Mark done ✓');
  const skip = await btn('Skip today');
  log(done && skip && done.y > skip.y, 'C-07 Mark done sits below the secondary actions');
  const sheetW = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && e.innerText.trim() === 'Mark done ✓').map((e) => e.parentElement.getBoundingClientRect().width)));
  log(done && done.w >= sheetW * 0.9, `C-07 Mark done is full width (${Math.round(done?.w)} of ${Math.round(sheetW)})`);
  await expect('Not started', 'C-07 status in words');
  await fill('e.g. 9:30 AM', '8:15');
  await expect('Update time', 'C-07 "Update time" appears after a change');
  await click('More…', { exact: true });
  await expect('Delete task', 'C-07 Delete under More');
  await click('Delete task', { exact: true });
  await expect('Delete “Fraction practice”', 'C-07 Delete asks first');
  await click('Cancel', { exact: true });
  await page.keyboard.press('Escape');
  await clickLabel('Close').catch(() => {});

  scenario('C-08 / C-23 Navigation');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((e) => e.offsetParent && e.closest('[role="tablist"]')?.parentElement?.innerText?.includes('Community')).map((e) => ({ t: e.innerText.trim().split('\n').at(-1).trim(), h: e.getBoundingClientRect().height, lines: [...e.querySelectorAll('div')].filter((d) => d.childElementCount === 0 && d.innerText.trim() && /[a-z]/i.test(d.innerText)).map((d) => Math.round(d.getBoundingClientRect().height)) })));
  const names = tabs.map((t) => t.t);
  log(JSON.stringify(names.slice(0, 5)) === JSON.stringify(['Today', 'Plan', 'Marketplace', 'Compass', 'Community']), `C-08 five tabs (${names.join(', ')})`);
  log(tabs.slice(0, 5).every((t) => t.lines.every((h) => h <= 22)), `C-08 every label on one line (${tabs.map((t) => t.lines.join('/')).join(' ')})`);
  if (phone) {
    const fs = await page.evaluate(() => Math.min(...[...document.querySelectorAll('[role="tab"] div')].filter((d) => d.offsetParent && d.childElementCount === 0 && /^[A-Za-z]+$/.test(d.innerText.trim())).map((d) => parseFloat(getComputedStyle(d).fontSize))));
    log(fs >= 11, `C-08 labels are at least 11 px (${fs})`);
  }
  await goTab('Plan');
  await expect('Weekly Rhythm', 'C-08 Plan opens the week');
  for (const part of ['🗓️ Week', '📚 Curricula', '🧭 Unit study']) log(await has(part), `C-08 Plan has "${part}"`);
  await click('📚 Curricula', { exact: true });
  await expect('My Curriculum', 'C-08 Curricula inside Plan');
  log(await page.evaluate(() => [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some((e) => e.innerText.trim().endsWith('Plan'))), 'C-08 the Plan tab stays selected on Curricula');
  if (!phone) {
    const side = await page.evaluate(() => {
      const list = [...document.querySelectorAll('[role="tablist"]')].find((e) => e.offsetParent && e.innerText.includes('Marketplace'));
      let el = list;
      while (el && el.getBoundingClientRect().height < window.innerHeight - 5) el = el.parentElement;
      const r = el?.getBoundingClientRect();
      return { w: r?.width ?? 0, text: el?.innerText ?? '' };
    });
    log(side.w > 0 && side.w <= 260, `C-23 sidebar is slim (${Math.round(side.w)} px)`);
    log(side.text.includes(seed.family.familyName) && side.text.includes('Settings') && side.text.includes('Kid mode'), 'C-23 sidebar has the family name, Settings and Kid mode');
    await goto('/settings');
    await expect('Family name');
    const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('input')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().width)));
    log(widest <= 660, `C-23 Settings inputs are capped (${Math.round(widest)} px)`);
  }

  scenario('C-25 Late-night timeline');
  await load({ ...seed, blocks: [], tasks: [{ id: `late-${run}`, childId: ADA, date: TODAY, title: 'Star gazing', subject: 'science', mode: 'group', start: '23:50', durationMin: 30, icon: '🔭', steps: [], status: 'todo' }] });
  if (!phone) {
    await click('Timeline', { exact: true });
    await sleep(500);
    const axis = await page.evaluate(() => (document.body.innerText.match(/\b\d{1,2}(:\d\d)? (AM|PM)\b/g) ?? []));
    log(!axis.includes('11:59 PM') && axis.includes('12 AM'), `C-25 the axis ends at 12 AM without repeating 11:59 PM (${axis.join(' ')})`);
  } else {
    await expect('11:50 PM', 'C-25 late tasks list at their time');
    log(!(await bodyText()).includes('11:59 PM'), 'C-25 no clamped 11:59 PM');
  }

  // ───────────────────────────── Compass
  scenario('C-10 Compliance radar');
  await load(seed);
  await goTab('Compass');
  await expect('To do', 'C-10 a To do list');
  await expect('File your Notice of Intent');
  await expect('Due: Notice of intent 14 days before starting', 'C-10 the NOI shows its deadline');
  const todo = await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((e) => e.offsetParent && e.innerText.startsWith('To do\n'));
    return card ? card.innerText.split('\n').filter((l) => /^(📌|⏳) /.test(l)).length : 0;
  });
  const actions = await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((e) => e.offsetParent && e.innerText.startsWith('To do\n'));
    return card ? [...card.querySelectorAll('[role="button"]')].filter((b) => b.innerText.trim().endsWith('›')).length : 0;
  });
  log(todo > 0 && actions === todo, `C-10 every to-do has a next step (${actions}/${todo})`);
  log(!(await has('⚠️ 1 / 172')), 'C-10 no wall of ⚠️');
  await click('Set a date ›', { exact: true });
  await expect('Plan the assessment');
  const later = day(40);
  await fill('e.g. 05/21/2017', `${later.slice(5, 7)}/${later.slice(8)}/${later.slice(0, 4)}`);
  await click('Save', { exact: true });
  await expect('Assessment planned for', 'C-10 the assessment can be planned');
  await expect('On track', 'C-10 planned items move to an On track list');
  log((await store()).family.assessmentDate === later, 'C-10 the date is saved');
  await expect('Since ', 'C-22 Compass hours header');
  log(!/Since \d{4}-\d\d-\d\d/.test(await bodyText()), 'C-22 "Since" reads as a date, not ISO');
  log((await bodyText()).includes('of 688 hrs'), 'C-22 hours read "x of 688 hrs"');
  await goTab('Today');
  const radarLines = await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.innerText.startsWith('🧭 Compliance radar') && e.innerText.includes('See all')).at(-1);
    return card ? card.innerText.split('\n').filter((l) => /^(📌|⏳) /.test(l)) : [];
  });
  log(radarLines.length === 1, `C-10 Today shows only the most urgent item (${radarLines.join(' | ')})`);
  await expect('See all (', 'C-10 with a way to see the rest');

  // ───────────────────────────── Records
  scenario('C-22 Records');
  await load({ ...seed, tasks: [...seed.tasks, { id: `pe-${run}`, childId: ADA, date: TODAY, title: 'Bike ride', subject: 'pe', mode: 'solo', start: '07:00', durationMin: 300, icon: '🚲', steps: [], status: 'done', completedAt: `${TODAY}T08:00:00` }] });
  await goto('/records/hours');
  await expect('By subject');
  await expect('(non-core)', 'C-22 non-core is spelled out');
  log(!(await has('·nc')), 'C-22 no "·nc"');
  await expect('of 688 hrs', 'C-22 "x of 688 hrs"');
  const summaryChips = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('div')].find((e) => e.offsetParent && e.innerText.startsWith('By subject\n') && e.innerText.includes('Log off-app') === false);
    return sec ? sec.querySelectorAll('[role="checkbox"],[role="button"]').length : -1;
  });
  log(summaryChips === 0, `C-22 subject totals are plain tags, not chips (${summaryChips})`);
  const before = (await store()).tasks.find((t) => t.id === `pe-${run}`);
  await clickLabel('Fix the time for Bike ride');
  await expect('Minutes spent', 'C-22 auto-logged rows can be fixed');
  await click("Don't count it", { exact: true });
  await click('Leave out', { exact: true });
  log((await store()).tasks.find((t) => t.id === `pe-${run}`).hoursExcluded === true && !before.hoursExcluded, 'C-22 an auto-log can be left out');
  await expect('not counted');
  await goto('/records/expenses');
  await expect('Tax-eligible');
  log(!(await has('ESA spent')) && !(await has('Annual ESA award')), 'C-22 no ESA fields in Colorado');
  await load({ ...seed, family: { ...seed.family, stateCode: 'AZ' } });
  await goto('/records/expenses');
  await expect('ESA spent', 'C-22 ESA fields in Arizona (which has one)');
  await goto('/records/noi');
  await click('Preview letter');
  await expect('Preview: Notice of Intent', 'C-22 the NOI can be previewed');
  await expect('[home address — still needed]', 'C-22 a blank address is flagged, not shown as filled');
  await expect('Still needed before you send it: home address');

  // ───────────────────────────── My Curriculum
  scenario('C-19 / C-29 My Curriculum');
  const pkgId = `pk-${run}`;
  const units = [{ id: 'u1', title: 'Halves', lessons: [...seed.curricula[0].outline[0].lessons, { id: 'l-new', title: 'Brand new lesson', steps: [], links: [], questions: [] }] }];
  await load({ ...seed, curricula: [{ ...seed.curricula[0], packageId: pkgId, license: { kind: 'all_rights_reserved' } }] });
  await page.evaluate((pkg) => localStorage.setItem('freerange-studio', JSON.stringify({ state: { active: false, packages: [pkg], bundles: [], coupons: [], classes: [] }, version: 0 })), {
    id: pkgId, title: 'Fraction Forest', description: '', subjects: ['math'], gradeMin: 1, gradeMax: 3, philosophies: [], parentInvolvement: 'medium', familyStyle: false, minutesPerLesson: 30, lessonsPerWeek: 3, format: 'digital', cover: '📘', color: '#2F6B5E', price: 0, units, origin: { kind: 'owned_book', title: 'Fraction Forest' }, license: { kind: 'all_rights_reserved' }, status: 'draft', version: 0, createdAt: `${TODAY}T08:00:00.000Z`, updatedAt: new Date().toISOString(),
  });
  await goto('/learn');
  await expect('Your curricula');
  await expect('1 plan has an update', 'C-29 an update summary at the top');
  const sumY = await page.evaluate(() => {
    const s = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.innerText.startsWith('✨ 1 plan has an update')).at(-1)?.getBoundingClientRect().top;
    const c = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.innerText.startsWith('🧮 Fraction Forest')).at(-1)?.getBoundingClientRect().top;
    return [s, c];
  });
  log(sumY[0] < sumY[1], 'C-29 the summary is above the curriculum cards');
  await click('Review', { exact: true });
  await expect('Update my plan', 'C-29 Review opens the update');
  await page.keyboard.press('Escape');
  await clickLabel('Close').catch(() => {});
  await sleep(300);
  await expect('On track to finish', 'C-19 one plain pace line');
  log(!/lessons\/week|\(\d+(\.\d+)?\/day\)/.test(await bodyText()), 'C-19 no "lessons/week (0.4/day)" jargon up front');
  log(!(await has('modular')) && !(await has('turnkey')), 'C-19 no unexplained model labels on the card');
  log(!(await btn('−1')), 'C-19 no tiny −1 beside +1');
  await click('+1 lesson', { exact: true });
  await expect('Undo', 'C-19 +1 can be undone');
  await click('Undo', { exact: true });
  log((await store()).curricula[0].progress[ADA] === 0, 'C-19 undo puts it back');
  log(await has('Where curricula come from ›'), 'C-19 the explainer is folded away once there is a curriculum');
  await click('Where curricula come from ›');
  await expect('Just track lessons', 'C-19 the explainer uses the Add sheet’s words');
  log(!(await has('Quick import)')), 'C-19 no "Quick import" in the explainer');

  scenario('C-30 Private book, no grade warnings');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('freerange-studio')); s.state.active = true; localStorage.setItem('freerange-studio', JSON.stringify(s)); });
  await goto(`/studio/${pkgId}?tab=publish`);
  await click('Add to my family’s plan');
  await expect('Add to your plan');
  log(!(await has('outside grade range')), 'C-30 no "(outside grade range)" for a book with no grades');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('freerange-studio')); s.state.active = false; localStorage.setItem('freerange-studio', JSON.stringify(s)); });

  // ───────────────────────────── Settings and account
  scenario('C-17 Settings');
  await load(seed);
  await goto('/settings');
  await expect('Family name');
  const sections = await page.evaluate(() => {
    const want = ['Family', 'Children', 'School calendar', 'Kid mode', 'Printing', 'Privacy & data', 'Freerange Studio'];
    const all = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.childElementCount === 0);
    return want.map((w) => all.find((e) => e.innerText.trim() === w)?.getBoundingClientRect().top ?? -1);
  });
  log(sections.every((y, i) => y >= 0 && (i === 0 || y > sections[i - 1])), `C-17 sections in order: Family … Studio last (${sections.map(Math.round).join(', ')})`);
  await expect('Take the style quiz', 'C-17 the style quiz can be (re)taken from Settings');
  await click('Edit values & interests');
  await click('curiosity', { exact: true });
  await click('space', { exact: true });
  await click('Save', { exact: true });
  const fam = (await store()).family;
  log(fam.values.includes('curiosity') && fam.interests.includes('space'), 'C-17 values & interests can be edited');
  const sw = await page.evaluate(() => [...document.querySelectorAll('[role="switch"]')].filter((e) => e.offsetParent).map((e) => e.getAttribute('aria-label')));
  log(sw.includes('Share anonymous lesson insights') && sw.includes('Let kids start upcoming work early') && sw.includes('Kids can print'), `C-17 labelled switches (${sw.join(' | ')})`);
  await click('Take the style quiz');
  await expect('Retake the style quiz', 'C-17 retaking opens the quiz');
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => [...document.querySelectorAll('div[tabindex]')].filter((e) => e.offsetParent && e.innerText && e.innerText.length > 12 && !/Previous|Next|Back/.test(e.innerText))[0]?.click());
    await sleep(250);
  }
  await expect('You lean', 'C-20 results lead with "You lean …"');
  await click('Save my style');
  await expect('Family name', 'C-17 back in Settings');
  log(!!(await store()).family.philosophy && (await store()).family.familyName === seed.family.familyName, 'C-17 the new style is saved without redoing onboarding');

  scenario('C-18 Account in the device-only build');
  await goto('/account');
  await expect("Cloud sync isn't set up in this build");
  const dev = await page.evaluate(() => !!globalThis.__DEV__);
  log((await has('EXPO_PUBLIC_SUPABASE_URL')) === dev, `C-18 developer setup notes only in a dev build (dev=${dev})`);
  await expect('Go to Today', 'C-18 always a way on');
  await click('Go to Today', { exact: true });
  await expect('Family Flight Deck');

  scenario('C-27 Notifications');
  await goto('/notifications');
  await expect('You’re all caught up');
  log(!(await has('Mark all read')), 'C-27 no disabled "Mark all read" when nothing is unread');

  // ───────────────────────────── Onboarding
  scenario('C-21 Welcome');
  await page.evaluate(() => localStorage.clear());
  await goto('/onboarding');
  const setUp = await btn('Set up my family');
  const demo = await btn('Explore with a demo family');
  log(setUp && demo && demo.b <= H, `C-21 both main buttons visible without scrolling (bottom ${Math.round(demo?.b)} ≤ ${H})`);

  scenario('C-20 Results');
  await click('Set up my family');
  const typeAt = async (i, text) => { const hs = []; for (const h of await page.$$('input')) if (await h.evaluate((e) => e.offsetParent !== null)) hs.push(h); await hs[i].click({ clickCount: 3 }); await hs[i].type(text); };
  await typeAt(0, `UX Results ${run}`);
  await typeAt(1, 'Sam Park');
  await typeAt(2, '4321');
  await typeAt(3, '80202');
  await sleep(400);
  await click('Continue', { exact: true });
  for (const [name, dob] of [['Ivy', '2018-04-02'], ['Max', '2015-09-15']]) {
    if (name !== 'Ivy') await click('Add a child');
    await fill('e.g. Maya', name);
    await fill('e.g. 05/21/2017', dob);
    await click('Add child', { exact: true });
  }
  await click('Continue to style quiz');
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => [...document.querySelectorAll('div[tabindex]')].filter((e) => e.offsetParent && e.innerText && e.innerText.length > 12 && !/Previous|Next|Back/.test(e.innerText))[0]?.click());
    await sleep(250);
  }
  await expect('You lean', 'C-20 "You lean …" headline');
  log(!/\d+% [A-Z].* \+ \d+%/.test(await bodyText()), 'C-20 no "52% … + 24% …" headline');
  await expect('Optional: pick any that fit', 'C-20 values and interests say they’re optional');
  const switches = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[role="switch"]')].filter((e) => e.offsetParent).map((e) => [e.getAttribute('aria-label'), e.getAttribute('aria-checked')])));
  log(switches['Start with this daily rhythm'] === 'true', 'C-20 a "Start with this daily rhythm" switch, on');
  await expect('You can edit it anytime', 'C-20 with "You can edit it anytime"');
  log(switches['Share anonymous lesson insights'] === 'false', 'C-17 insights are asked in onboarding and start off');
  if (phone) {
    const clipped = await page.evaluate(() => [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.getAttribute('aria-label') === 'Monday, per child').length);
    log(clipped === 1, 'C-20 the rhythm preview is a list per child on a phone');
  }
  await click('Start homeschooling with Freerange');
  await expect('Family Flight Deck');
  log((await store()).family.insightsOptOut === true, 'C-17 a new family shares nothing unless they opt in');
  log((await store()).blocks.length > 0, 'C-20 the rhythm was kept');

  // ───────────────────────────── Kid mode
  scenario('C-15 / C-26 Picker, PIN and mood');
  await load(seed);
  await goto('/kid');
  const kidButtons = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent).map((e) => e.getAttribute('aria-label')));
  log(kidButtons.some((l) => l?.startsWith('Ada')) && kidButtons.some((l) => l?.startsWith('Ben')), 'C-15 kid avatars are buttons');
  await click('Ada');
  await expect('Enter your secret code');
  const key1 = async () => (await boxes('[role="button"]', '1')).at(-1)?.y;
  const y0 = await key1();
  await pin('1111');
  await expect('Try again');
  const y1 = await key1();
  log(Math.abs(y0 - y1) < 1, `C-26 the keypad doesn't move when "Try again" shows (${Math.round(y0)} → ${Math.round(y1)})`);
  await sleep(600);
  await pin('1357');
  await expect('How are you feeling today?');
  log((await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent).map((e) => e.getAttribute('aria-label')))).includes('Happy'), 'C-15 mood tiles are buttons');
  await click('Okay');
  await expect('Your missions today');
  const missionLabels = (await labels()).filter((l) => /^Mission \d+, /.test(l));
  log(missionLabels.length >= 3 && missionLabels.some((l) => /, up next/.test(l)), `C-15 mission cards say what they are (${missionLabels[0]})`);
  const cards = await boxes('[role="button"]');
  log(cards.filter((b) => /^Mission/.test(b.label ?? '')).every((b) => b.h >= 64), 'C-15 mission cards are at least 64 px');
  await expect('★ Up next', 'C-15 status in words with an icon');

  scenario('C-03 Timer survives leaving the screen');
  await click('Fraction practice');
  await expect('Show your work');
  await click('Start', { exact: true });
  await sleep(2300);
  await click('‹ My day');
  await expect('⏱ 0 min', 'C-03 the running time shows on the mission card');
  await sleep(1200);
  await click('Fraction practice');
  await expect('Show your work');
  const t = await page.evaluate(() => document.body.innerText.match(/\b(\d\d):(\d\d)\b/)?.slice(1).map(Number));
  log(t && t[0] * 60 + t[1] >= 3, `C-03 the timer kept counting while away (${t?.join(':')})`);
  log(await has('Pause'), 'C-03 still running when the kid comes back');
  const tk = (await store()).tasks.find((x) => x.blockId === 'b-frac' && x.date === TODAY);
  log(!!tk.timer?.startedAt, 'C-03 the timer is stored on the task');
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  log(await has('Pause'), 'C-03 survives a reload');

  scenario('C-14 / C-15 Steps and finishing');
  const stepBox = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="checkbox"]')].find((e) => e.offsetParent && (e.getAttribute('aria-label') ?? '').startsWith('Step 1'));
    const box = el?.querySelector('div');
    return el ? { checked: el.getAttribute('aria-checked'), border: box ? getComputedStyle(box).borderTopWidth : '' } : null;
  });
  log(stepBox?.checked === 'false' && stepBox.border === '2px', `C-15 step boxes are checkboxes with a 2 px border (${JSON.stringify(stepBox)})`);
  await click('Fold the paper');
  log(await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"]')].find((e) => (e.getAttribute('aria-label') ?? '').startsWith('Step 1'))?.getAttribute('aria-checked') === 'true'), 'C-15 a ticked step says so');
  await click("I'm done! ✓");
  await sleep(900);
  const how = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim().startsWith('How did it go?')).at(-1);
    const r = el?.getBoundingClientRect();
    return r ? { top: r.top, bottom: r.bottom, vh: window.innerHeight } : null;
  });
  log(how && how.top >= 0 && how.bottom <= how.vh, `C-14 "How did it go?" is on screen after "I'm done!" (${how && Math.round(how.top)})`);
  await click('Mark complete ✓');
  await sleep(2400);
  log(((await store()).tasks.find((x) => x.blockId === 'b-frac' && x.date === TODAY).minutesSpent ?? 0) >= 0, 'C-03 finished with the timer’s minutes');

  scenario('C-13 Help can be taken back');
  await expect('Your missions today');
  await click('Ask Pat for help ✋');
  await expect('Pat got your message 👍', 'C-13 neutral confirmation');
  log(!(await has('helping someone else')), 'C-13 no guess that Pat is helping someone else');
  await click('OK', { exact: true });
  const dayHelp = await btn('I figured it out ✓');
  log(!!dayHelp, 'C-13 "I figured it out" on the day');
  await click('Silent reading');
  await expect('Read 20 minutes');
  const cardHelp = await btn('I figured it out ✓');
  log(cardHelp && dayHelp && Math.abs(cardHelp.h - dayHelp.h) < 2, `C-13 the same big help control on a mission (${Math.round(cardHelp?.h)} px)`);
  await click('I figured it out ✓');
  await expect('Ask Pat for help ✋', 'C-13 the request is withdrawn');
  log((await store()).help.every((h) => h.resolvedAt) && (await store()).help.some((h) => h.withdrawn), 'C-13 nothing stale left in the parent’s queue');
  const askBtn = await btn('Ask Pat for help ✋');
  log(askBtn && askBtn.h >= 50, `C-13 the help button on a mission is large (${Math.round(askBtn?.h)} px)`);
  await click('‹ My day');

  scenario('C-12 Start early: solo only, parent told');
  await clickLabel('Next day');
  await expect('coming up');
  const tomorrowCards = (await labels()).filter((l) => /^Mission \d+, /.test(l));
  log(tomorrowCards.some((l) => l.includes('Writing with Pat') && !/start early/.test(l)), 'C-12 a 1-on-1 is not offered early');
  log(tomorrowCards.some((l) => l.includes('Silent reading') && /start early/.test(l)), 'C-12 a solo mission is');
  await click('Writing with Pat');
  await expect('so you\'ll do it together on the day', 'C-12 says why not');
  log(!(await has('Start it now')), 'C-12 no "Start it now" on a 1-on-1');
  await click('‹ My day');
  await click('Silent reading');
  await click('Start it now');
  await expect("I'm done!", 'C-12 a solo mission starts early');
  await click('‹ My day');
  await click('Grown-up exit');
  await pin('2468');
  await expect('Family Flight Deck');
  await goto('/notifications');
  await expect('started tomorrow’s Silent reading', 'C-12 the parent is told');
  await load({ ...seed, family: { ...seed.family, kidsStartEarly: false } });
  await goto(`/kid/${ADA}?date=${TOMORROW}`);
  await page.evaluate((id) => { const s = JSON.parse(localStorage.getItem('freerange-v1')); s.state.mode = { kind: 'kid', childId: id }; localStorage.setItem('freerange-v1', JSON.stringify(s)); }, ADA);
  await goto(`/kid/${ADA}?date=${TOMORROW}`);
  await expect('coming up');
  log(!(await has('Start early')), 'C-12 the Settings switch turns starting early off');

  scenario('C-16 Kids and printing');
  await load({ ...seed, mode: { kind: 'kid', childId: BEN }, moods: [{ childId: BEN, date: TODAY, mood: 4 }] });
  await page.evaluate(() => localStorage.removeItem('freerange-printer'));
  await goto('/');
  await expect('My day');
  await click('Print my day');
  await expect('Ask a grown-up', 'C-16 kids are asked to fetch a grown-up');
  log(!(await has('Set up printing')) && !(await has('Print a test page')), 'C-16 no printer setup in kid mode');
  await click('Ask Pat for help ✋');
  log((await store()).help.some((h) => h.childId === BEN && h.note === 'Set up the printer'), 'C-16 with a help request for the printer');
  await load({ ...seed, family: { ...seed.family, kidsCanPrint: false }, mode: { kind: 'kid', childId: BEN }, moods: [{ childId: BEN, date: TODAY, mood: 4 }] });
  await expect('My day');
  log(!(await has('Print my day')), 'C-16 "Kids can print" off hides the button');
  await shot('kid');
}

await finish(main, 'Compass UX');
