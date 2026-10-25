// Full functional walkthrough of every screen and form on the web build.
// Run with the dev server up: `npm run web`, then `node e2e/scenarios.mjs`.
import { mkdirSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PNG = new URL('./screenshots/fixture.png', import.meta.url).pathname;
// 2x2 PNG used as a "work sample" photo.
writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64'));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 300000).unref();
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 900) });
page.setDefaultTimeout(15000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
browser.on('targetcreated', async (t) => { const p = await t.page().catch(() => null); if (p && p !== page) setTimeout(() => p.close().catch(() => {}), 1500); });

let failures = 0;
let section = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
const scenario = (name) => { section = name; console.log(`\n— ${name}`); };

const bodyText = () => page.evaluate(() => document.body.innerText);
const has = async (t) => (await bodyText()).includes(t);
const expect = async (t, label = `shows "${t}"`) => log(await has(t), label);
const expectNot = async (t, label = `hides "${t}"`) => log(!(await has(t)), label);

/** Click the last visible clickable whose text matches (dialogs render last, so they win). */
async function click(text, { exact = false } = {}) {
  const ok = await page.evaluate((t, exact) => {
    const els = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse();
    const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)));
    if (!el) return false;
    el.click();
    return true;
  }, text, exact);
  if (!ok) throw new Error(`[${section}] nothing clickable with text "${text}"`);
  await sleep(450);
}
async function isDisabled(text) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('[role="button"],button')].reverse().find((e) => e.offsetParent && e.innerText.trim() === t);
    return el ? el.getAttribute('aria-disabled') === 'true' || el.disabled === true : null;
  }, text);
}
/** Fill the nth visible input/textarea with this placeholder. */
async function fill(placeholder, text, nth = 0) {
  const tag = await page.evaluate((ph, nth) => {
    const visible = [...document.querySelectorAll('input,textarea')].filter((e) => e.offsetParent !== null && (e.getAttribute('placeholder') ?? '') === ph);
    const el = visible.at(nth);
    if (!el) return null;
    const t = `f${Math.random().toString(36).slice(2)}`;
    el.setAttribute('data-e2e', t);
    return t;
  }, placeholder, nth);
  if (!tag) throw new Error(`[${section}] no input with placeholder "${placeholder}" (#${nth})`);
  const h = await page.$(`[data-e2e="${tag}"]`);
  await h.evaluate((e) => { e.focus(); e.select?.(); });
  await page.keyboard.press('Backspace');
  if (text) await page.keyboard.type(text);
  await sleep(150);
}
/** Fill the input that follows a label's text. */
async function fillLabel(label, text) {
  const id = await page.evaluate((label) => {
    const labels = [...document.querySelectorAll('div,span')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === label);
    const l = labels.at(-1);
    if (!l) return null;
    let n = l;
    for (let i = 0; i < 4 && n; i++) {
      const input = n.parentElement?.querySelector('input,textarea');
      if (input) { const tag = `x${Math.random().toString(36).slice(2)}`; input.setAttribute('data-e2e', tag); return tag; }
      n = n.parentElement;
    }
    return null;
  }, label);
  if (!id) throw new Error(`[${section}] no input for label "${label}"`);
  const h = await page.$(`[data-e2e="${id}"]`);
  await h.evaluate((e) => { e.focus(); e.select?.(); });
  await page.keyboard.press('Backspace');
  if (text) await page.keyboard.type(text);
  await sleep(150);
}
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('kinship-v1') ?? '{}').state ?? {});
/** Tab labels include an icon glyph, so match the tab whose last text line is the name. */
const goTab = async (name) => {
  const ok = await page.evaluate((name) => {
    const tab = [...document.querySelectorAll('[role="tab"],a[href]')].find((e) => e.offsetParent && e.innerText.trim().split('\n').at(-1).trim() === name);
    tab?.click();
    return !!tab;
  }, name);
  if (!ok) throw new Error(`[${section}] no tab "${name}"`);
  await sleep(600);
};

async function run() {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);

  // ───────────────────────────── Onboarding
  scenario('Onboarding: family step');
  await click('Set up my family');
  log(await isDisabled('Continue'), 'Continue disabled when empty');
  await expect('Still needed: family name, your name, 4-digit parent PIN, state');
  await fill('The Miller Crew', 'The Rivera Family');
  await fill('Dana Miller', 'Sam Rivera');
  await fillLabel('Parent PIN', '12');
  await expect('4-digit parent PIN', 'explains short PIN');
  await fillLabel('Parent PIN', '2468');
  await fillLabel('ZIP code', '78701');
  await expect('Texas Legal Radar', 'ZIP 78701 → Texas');
  log(!(await isDisabled('Continue')), 'Continue enabled when complete');
  await click('Continue', { exact: true });

  scenario('Onboarding: kids');
  await expect('Add a child');
  log(await isDisabled('Add child'), 'Add child disabled when empty');
  await fill('Maya', 'Lucia');
  for (const [dob, ok] of [['13/40/2018', false], ['5/21/2099', false], ['05/21/2017', true], ['May 21 2017', true], ['5/21/17', true]]) {
    await fill('05/21/2017', dob);
    log((await isDisabled('Add child')) === !ok, `birthdate "${dob}" → ${ok ? 'accepted' : 'rejected'}`);
  }
  await expect('age ', 'shows computed age');
  await fill('05/21/2017', '2/30/2017');
  await expect('Not recognized', 'explains unrecognized date');
  await expect('Still needed: a valid birthdate', 'explains disabled button');
  await shot('s-child-form-invalid');
  await fill('05/21/2017', '5/21/17');
  await click('Dyslexia', { exact: true });
  await fill('dinosaurs, robotics, creative writing', 'horses, painting');
  await fillLabel('Kid PIN (optional)', '12');
  log(await isDisabled('Add child'), '2-digit kid PIN blocks save');
  await expect('a 4-digit PIN (or leave it blank)');
  await fillLabel('Kid PIN (optional)', '7777');
  await click('Add child', { exact: true });
  await expect('Lucia');
  await expect('Age 9', 'card shows age');
  await expect('4th Grade', 'grade auto-filled from final birthdate, not a partial one');
  await click('Add a child');
  await fill('Maya', 'Mateo');
  await fill('05/21/2017', '2020-01-15');
  await click('Add child', { exact: true });
  await expect('Mateo');
  // Edit Mateo
  await click('Mateo');
  await fill('Maya', 'Mateo R.');
  await click('Save', { exact: true });
  await expect('Mateo R.', 'child edited');
  await click('Continue to style quiz');

  scenario('Onboarding: quiz');
  await expect('Question 1 of 15');
  const pickOption = (i) => page.evaluate((i) => {
    const opts = [...document.querySelectorAll('[tabindex]')].filter((e) => e.offsetParent && e.innerText && e.innerText.length > 12 && !/Previous|Next|Back|Step/.test(e.innerText) && e.childElementCount <= 1);
    opts[i]?.click();
    return opts.length;
  }, i);
  await pickOption(1); await sleep(300);
  await expect('Question 2 of 15');
  await click('Previous');
  await expect('Question 1 of 15', 'Previous goes back');
  await click('Next');
  await expect('Question 2 of 15', 'Next goes forward on answered question');
  for (let q = 2; q <= 15; q++) { await pickOption(q % 3); await sleep(280); }
  await sleep(600);

  scenario('Onboarding: results');
  await expect('Your homeschool style');
  await expect('Compatibility breakdown');
  await click('curiosity', { exact: true });
  await click('nature', { exact: true });
  await expect('Recommended daily rhythm');
  await shot('s-results');
  await click('Start homeschooling with Kinship');
  await expect('Family Flight Deck');
  await expect('The Rivera Family');
  const s0 = await store();
  log(s0.children?.length === 2 && s0.family?.values?.includes('curiosity'), 'family + values persisted');
  log(s0.children?.[0]?.birthdate === '2017-05-21', 'birthdate stored canonically (2017-05-21)');
  log((s0.blocks?.length ?? 0) > 0, 'recommended rhythm saved');

  // ───────────────────────────── Today / Flight Deck
  scenario('Flight Deck: empty day');
  const weekday = await page.evaluate(() => new Date().getDay());
  // Find a day with nothing scheduled (the next Saturday).
  for (let i = 0; i < (6 - weekday + 7) % 7; i++) await click('›', { exact: true });
  await expect('Nothing scheduled this day');
  await expect('Help queue', 'help queue visible on empty days');
  await expect('Compliance radar', 'compliance radar visible on empty days');
  await click('Add a task', { exact: true });
  await expect('One-off task', 'empty-day Add a task opens one-off form');
  await click('Cancel', { exact: true });
  await goTab('Today');
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);

  scenario('Flight Deck: tasks');
  // Navigate to a weekday so the rhythm is populated.
  if (weekday === 0 || weekday === 6) for (let i = 0; i < (weekday === 6 ? 2 : 1); i++) await click('›', { exact: true });
  await expect('0/', 'shows done counter');
  const firstTask = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].find((e) => /, \d+:\d\d (AM|PM)$/.test(e.getAttribute('aria-label')))?.getAttribute('aria-label'));
  log(!!firstTask, `timeline has tasks (${firstTask})`);
  await page.evaluate((l) => [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === l).click(), firstTask);
  await sleep(500);
  await expect('Update time');
  await fill('9:30 AM', '2:15pm');
  await expect('✓ 2:15 PM', 'time feedback');
  await click('Update time');
  await expect('2:15 PM', 'task moved to 2:15 PM');
  await click('Mark done ✓');
  await expect('Reopen', 'task done');
  await click('Reopen');
  await expect('Mark done ✓', 'task reopened');
  await click('Skip today');
  await expect('Restore', 'task skipped');
  await click('Restore');
  await click('Mark done ✓');
  await click('Close', { exact: false }).catch(async () => page.keyboard.press('Escape'));
  await sleep(300);
  await expect('1/', 'done counter incremented');

  scenario('Flight Deck: conflict + auto-stagger');
  await click('Task', { exact: true }).catch(() => click('➕  Task'));
  await sleep(600);
  await expect('One-off task');
  await fill('1-on-1 Phonics', 'Piano with Mom');
  await click('Lucia', { exact: false });
  await click('Mateo R.', { exact: false });
  await click('With parent (1-on-1)');
  await fill('9:30 AM', '9');
  await click('Save', { exact: true });
  await sleep(800);
  await expect('Family Flight Deck', 'returned to Today');
  await expect('parent conflict', 'conflict detected');
  await shot('s-conflict');
  await click('Auto-stagger 1-on-1s');
  await expectNot('parent conflict', 'conflict resolved by auto-stagger');
  await expect('Rescheduled', 'stagger toast');

  scenario('Flight Deck: gentle bump');
  const beforeBump = (await store()).tasks.filter((t) => t.status === 'todo').length;
  await click('Bump remaining');
  await expect('Gentle bump');
  await click('Next school day');
  await expect('Bumped', 'bump toast');
  const afterBump = await store();
  log(afterBump.tasks.some((t) => t.bumpedFrom), `tasks carry bumpedFrom (${beforeBump} todo before)`);
  await click('›', { exact: true });
  await sleep(500);
  await expectNot('parent conflict', 'bumped work does not double-book the parent');
  await goTab('Today');

  // ───────────────────────────── Rhythm builder
  scenario('Rhythm builder');
  await goTab('Rhythm');
  await expect('Weekly Rhythm');
  await click('Block', { exact: false });
  log(await isDisabled('Save'), 'Save disabled without title');
  await fill('1-on-1 Phonics', 'Spanish Practice');
  await click('Foreign Language', { exact: false });
  await fill('9:30 AM', '1:30');
  await expect('✓ 1:30 PM', '"1:30" read as afternoon');
  await fill('Watch the lesson\nDo problems 1–10', 'Duolingo unit');
  await click('Save', { exact: true });
  await expect('Spanish Practice', 'block created');
  await click('Spanish Practice');
  await fill('1-on-1 Phonics', 'Spanish Practice (edited)');
  await click('Save', { exact: true });
  await expect('Spanish Practice (edited)', 'block edited');
  await click('Spanish Practice (edited)');
  await click('Delete', { exact: true });
  await expect('Delete “Spanish Practice (edited)”?', 'delete confirm shown');
  await click('Delete', { exact: true });
  await expectNot('Spanish Practice (edited)', 'block deleted');
  await click('Sat', { exact: true });
  await expect('Nothing on this day', 'empty weekend');

  // ───────────────────────────── Curriculum
  scenario('Curriculum: pacing');
  await goTab('Curriculum');
  await click('＋  Add', { exact: true });
  await click('Saxon Math (grade level)');
  await fill('0', '12');
  await fill('05/21/2017', '8/17/2026', 0);
  await fill('05/21/2017', 'June 4 2027', 1);
  await click('Save', { exact: true });
  await expect('Saxon Math (grade level)', 'curriculum added');
  await expect('lessons/week', 'pace computed');
  await click('+1 lesson');
  await expect('13 / 120 lessons', '+1 lesson');
  await click('−1', { exact: true });
  await expect('12 / 120 lessons', '−1 lesson');
  await click('Edit', { exact: true });
  await fill('120', '5');
  await expect('completed ≤ total', 'rejects completed > total');
  await fill('120', '150');
  await click('Save', { exact: true });
  await expect('12 / 150 lessons', 'edited total');
  await click('Edit', { exact: true });
  await click('Remove', { exact: true });
  await click('Remove', { exact: true });
  await expectNot('Saxon Math (grade level)', 'curriculum removed');

  scenario('Curriculum: unit study');
  await click('Unit Study Generator');
  await fill('Space Exploration, Ancient Egypt, Oceans…', 'Volcanoes');
  await click('Generate', { exact: true });
  await expect('Day 10');
  await expect('Volcanoes');
  await click('Add to rhythm');
  await expect('Added to rhythm ✓');

  // ───────────────────────────── Compass + records
  scenario('Compass');
  await goTab('Compass');
  await expect('Homeschool Compass');
  await expect('no notice required', 'Texas: no notice');
  await click('Export packet');
  await sleep(1200);
  await expect('Homeschool Compass', 'packet export did not crash');

  scenario('Records: NOI');
  await click('Notice of Intent', { exact: false });
  await sleep(600);
  await expect("doesn't require a notice");
  log(await isDisabled('Sign letter ✍️'), 'sign disabled until complete');
  await fill('123 Maple St\nDenver, CO 80202', '12 Oak Lane\nAustin, TX 78701');
  await fillLabel('Type your full legal name to sign', 'Sam Rivera');
  await click('Sign letter ✍️');
  await expect('Signed ', 'signed');
  await click('Kept a copy for your records');
  log((await store()).noi.checklist.copy === true, 'checklist item saved');
  await click('Export PDF');
  await sleep(800);
  await page.goBack(); await sleep(700);

  scenario('Records: hours');
  await click('Hours & Attendance', { exact: false });
  await sleep(600);
  await click('PE', { exact: false });
  await fillLabel('Minutes', '45');
  await fill('05/21/2017', '1/1/2099');
  await expect("Can't log time in the future");
  await fill('05/21/2017', 'yesterday');
  await expect('Not recognized', 'rejects unparseable date');
  await fill('05/21/2017', new Date(Date.now() - 864e5).toLocaleDateString('en-US'));
  await fill('Swim lessons, museum field trip…', 'Swim team');
  await click('Add log', { exact: true });
  await expect('Swim team', 'log added for each child');
  log((await store()).hoursLogs.length === 2, 'one log per selected child');
  await click('Remove', { exact: true });
  log((await store()).hoursLogs.length === 1, 'log removed');
  await page.goBack(); await sleep(700);

  scenario('Records: portfolio');
  await click('Portfolio Vault', { exact: false });
  await sleep(600);
  const [chooser] = await Promise.all([page.waitForFileChooser(), click('Upload', { exact: false })]);
  await chooser.accept([PNG]);
  await sleep(1500);
  await expect('Tag this sample', 'tag sheet opened after upload');
  await fill('Long division practice, p. 42', 'Watercolor volcano');
  await fill('CCSS.MATH.4.NBT.B.6', 'VA:Cr1.1.4');
  await click('Save to portfolio');
  await expect('1 work sample', 'sample saved');
  await click('Watercolor volcano');
  await expect('Standard: VA:Cr1.1.4');
  await click('Delete sample');
  await click('Delete', { exact: true });
  await expect('0 work samples', 'sample deleted');
  await page.goBack(); await sleep(700);

  scenario('Records: expenses');
  await click('ESA & Expenses', { exact: false });
  await sleep(600);
  await fill('7,000', '7,000');
  await click('Save', { exact: true });
  await expect('Saved ✓', 'ESA award saved');
  log((await store()).esaAnnualAward === 7000, 'award = 7000');
  await click('Add expense');
  await fill('Rainbow Resource Center', 'Rainbow Resource');
  await fill('49.99', '$12.50');
  await expect('✓ $12.50', 'decimal amount accepted');
  await click('Supplies', { exact: false }).catch(() => click('supplies', { exact: true }));
  await click('Save', { exact: true });
  await expect('$12.50', 'expense listed');
  await click('Rainbow Resource');
  await fill('49.99', '20');
  await click('Save', { exact: true });
  await expect('$20.00', 'expense edited');
  await click('Export report');
  await sleep(800);
  await click('Rainbow Resource');
  await click('Delete', { exact: true });
  await expect('No expenses yet', 'expense deleted');
  await page.goBack(); await sleep(700);

  // ───────────────────────────── Community
  scenario('Community');
  await goTab('Community');
  await click('2 mi', { exact: true });
  await click('50 mi', { exact: true });
  await click('8–11', { exact: true });
  await click('Request to connect');
  await expect('Request sent');
  await click('🏫 Co-ops');
  await click('Request to join');
  await expect('Rotating duties', 'joined co-op shows duties');
  await click('Start one');
  await fillLabel('Name', 'Hill Country Explorers');
  await click('Create', { exact: true });
  await expect('Hill Country Explorers');
  await click('🚌 Field trips');
  await click('RSVP', { exact: true });
  await click('Join carpool matching');
  await expect('In carpool pool ✓');
  await click('Organize');
  await fillLabel('Title', 'Capitol tour');
  await fill('05/21/2017', '1/1/2020');
  await expect('Pick today or a future date');
  await fill('05/21/2017', new Date(Date.now() + 5 * 864e5).toLocaleDateString('en-US'));
  await click('Create', { exact: true });
  await expect('Capitol tour', 'event created');
  await click('📦 Swap');
  await click('List item');
  await fill('Saxon Math 6/5 student text', 'Lego Education set');
  await fill('0', '25');
  await click('List it');
  await expect('Lego Education set');
  await click('Remove', { exact: true });
  await expectNot('Lego Education set', 'listing removed');

  // ───────────────────────────── Settings
  scenario('Settings');
  await goTab('Today');
  await click('⚙️  Settings', { exact: true });
  await sleep(600);
  await fillLabel('Family name', 'The Rivera Crew');
  await fillLabel('Year starts', '8/24/2026');
  log((await store()).family.schoolYearStart === '2026-08-24', 'school year start saved canonically');
  await fillLabel('Year ends', '1/1/2020');
  await expect('Must be after the start date');
  log((await store()).family.schoolYearEnd !== '2020-01-01', 'invalid end date not saved');
  await fillLabel('Year ends', '6/4/2027');
  await click('Fri', { exact: true });
  await fill('New 4-digit PIN', '1357');
  await click('Update', { exact: true });
  await expect('Updated ✓');
  log((await store()).family.parentPin === '1357', 'parent PIN changed');
  await click('Lucia');
  await fillLabel('Kid PIN (optional)', '');
  await click('Save', { exact: true });
  log(!(await store()).children.find((c) => c.name === 'Lucia').pin, 'kid PIN cleared');
  await click('Lucia');
  await fillLabel('Kid PIN (optional)', '7777');
  await click('Save', { exact: true });
  await click('Import backup');
  await fill('', 'not json').catch(() => {});
  await page.evaluate(() => { const t = [...document.querySelectorAll('textarea')].at(-1); t.focus(); });
  await page.keyboard.type('{"nope":1}');
  await click('Import', { exact: true });
  await expect('Not a Kinship backup file', 'rejects bad backup');
  await page.keyboard.press('Escape');
  await click('✕', { exact: true }).catch(() => {});
  await page.goBack(); await sleep(700);

  // ───────────────────────────── Kid mode
  scenario('Kid mode');
  // Give Lucia a fresh mission today (earlier steps bumped/finished everything).
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  await click('➕  Task', { exact: true });
  await fill('1-on-1 Phonics', 'Volcano reading');
  await click('Reading', { exact: false });
  await click('Independent', { exact: false });
  await fill('9:30 AM', '11pm');
  await fill('Watch the lesson\nDo problems 1–10', 'Read chapter 1\nDraw a volcano');
  await click('Save', { exact: true });
  await sleep(800);
  await click('Kid mode');
  await expect("Who's learning today?");
  await click('Lucia');
  await expect('Enter your secret code');
  for (const d of '1111') await click(d, { exact: true });
  await expect('Try again', 'wrong kid PIN rejected');
  await sleep(500);
  for (const d of '7777') await click(d, { exact: true });
  await expect('How are you feeling today?');
  await click('Super!');
  await expect('Your missions today');
  const sparks0 = (await store()).children.find((c) => c.name === 'Lucia').sparks;
  const mission = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[tabindex]')].find((e) => e.offsetParent && /UP NEXT|IN PROGRESS/.test(e.innerText));
    el?.click();
    return el?.innerText.split('\n')[0];
  });
  await sleep(600);
  log(!!mission, `opened mission ${mission}`);
  await expect('Show your work');
  await click('Start', { exact: true });
  await sleep(2200);
  log(/00:0[1-3]/.test(await bodyText()), 'timer counts up');
  await click('Pause', { exact: true });
  await click('🍅 Focus 25');
  await expect('25:00', 'pomodoro countdown');
  await click("I'm done!");
  await click('🤩 Easy!');
  await fill('Today I learned…', 'Volcanoes have magma chambers');
  await click('Mark complete ✓');
  await sleep(2500);
  const sparks1 = (await store()).children.find((c) => c.name === 'Lucia').sparks;
  log(sparks1 === sparks0 + 15, `sparks +15 with reflection (${sparks0} → ${sparks1})`);
  await click('for help');
  await expect('Help is on the way');
  await click('OK', { exact: true });
  await expect('is coming', 'help button shows pending');
  await click('Switch kid');
  await click('Mateo R.');
  await expect('How are you feeling today?', 'second kid gets own mood check');
  await click('Okay');
  await click('Grown-up exit');
  for (const d of '2468') await click(d, { exact: true });
  await expect('Try again', 'old parent PIN rejected');
  await sleep(500);
  for (const d of '1357') await click(d, { exact: true });
  await expect('Family Flight Deck', 'parent unlocked');
  await expect('Help queue (1 waiting)');
  await click('On my way ✓');
  await expect('No one needs you right now.', 'help resolved');

  scenario('Persistence + erase');
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  await expect('Family Flight Deck', 'still signed in after reload');
  await expect('The Rivera Crew', 'renamed family persisted');
  await click('Settings', { exact: false });
  await click('Erase everything');
  await click('Erase', { exact: true });
  await sleep(800);
  await expect('Welcome to Kinship', 'erase returns to welcome');
}

try {
  await run();
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
  await shot('s-failure').catch(() => {});
}
const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
