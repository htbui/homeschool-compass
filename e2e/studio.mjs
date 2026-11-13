// Studio walkthrough on the web build (local-only server): creator onboarding,
// creating, converting, importing, publishing, and lessons reaching a kid.
// Run with `npm run web:local`, then `BASE_URL=http://localhost:8082 node e2e/studio.mjs`.

import { mkdirSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

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
const opened = [];
browser.on('targetcreated', async (t) => { opened.push(t.url()); const p = await t.page().catch(() => null); if (p && p !== page) setTimeout(() => p.close().catch(() => {}), 1500); });

let failures = 0;
let section = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
const scenario = (name) => { section = name; console.log(`\n— ${name}`); };

const bodyText = () => page.evaluate(() => document.body.innerText);
const has = async (t) => (await bodyText()).includes(t);
/** Screens load their code on demand, so checks wait up to 8s (needed over slow links). */
const waitHas = async (t, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await has(t)) return true;
  return has(t);
};
const expect = async (t, label = `shows "${t}"`) => log(await waitHas(t), label);
const expectNot = async (t, label = `hides "${t}"`) => log(!(await has(t)), label);

/** Click the last visible clickable whose text matches (dialogs render last, so they win). */
async function click(text, { exact = false } = {}) {
  let ok = false;
  for (const end = Date.now() + 8000; !ok && Date.now() < end; ) {
    ok = await tryClick(text, exact);
    if (!ok) await sleep(250);
  }
  if (!ok) throw new Error(`[${section}] nothing clickable with text "${text}"`);
  await sleep(450);
}
async function tryClick(text, exact) {
  return page.evaluate((t, exact) => {
    const els = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse();
    const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)));
    if (!el) return false;
    el.click();
    return true;
  }, text, exact);
}
async function isDisabled(text) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('[role="button"],button')].reverse().find((e) => e.offsetParent && e.innerText.trim() === t);
    return el ? el.getAttribute('aria-disabled') === 'true' || el.disabled === true : null;
  }, text);
}
/** Fill the nth visible input/textarea with this placeholder. */
async function fill(placeholder, text, nth = 0) {
  let tag = null;
  for (const end = Date.now() + 8000; !tag && Date.now() < end; await sleep(tag ? 0 : 250)) tag = await page.evaluate((ph, nth) => {
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
async function clickLabel(label) {
  const ok = await page.evaluate((l) => {
    const el = [...document.querySelectorAll(`[aria-label="${l}"]`)].reverse().find((e) => e.offsetParent !== null);
    el?.click();
    return !!el;
  }, label);
  if (!ok) throw new Error(`[${section}] nothing labelled "${label}"`);
  await sleep(500);
}
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-v1') ?? '{}').state ?? {});
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

const studio = () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-studio') ?? '{}').state ?? {});
const pkgNamed = async (title) => (await studio()).packages?.find((p) => p.title === title);

async function run() {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);

  // ───────────────────────────── A creator with no family
  scenario('Creator onboarding');
  await click('Curriculum Creator Studio');
  await expect('Freerange Studio');
  log(await isDisabled('Open my Studio'), 'profile needs a name');
  await fill('Maple Room Studio', 'Test Creator Co');
  await click('Open my Studio');
  await expect('Test Creator Co', 'dashboard shows the creator');
  await expect('Make a curriculum');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await expect('Test Creator Co', 'app opens straight into Studio for a creator');

  scenario('Create from scratch');
  await click('New curriculum');
  await click('Start from scratch');
  await fill('Fractions Workshop', 'Space Math');
  await fillLabel('Units', '2');
  await fillLabel('Lessons per unit', '2');
  await click('Create', { exact: true });
  await expect('saved automatically', 'editor opens');
  await fillLabel('Description', 'Rockets, orbits, and planets as a way into multiplication.');
  await click('🧮 Math');
  await click('📚 Lessons (4)');
  await expect('4. Lesson 4', 'numbered lessons');
  await click('1. Lesson 1');
  await fillLabel('Title', 'Counting rockets');
  await fillLabel('Pages (optional)', '4–9');
  await fill('Watch the video\nDo problems 1–10\nCheck your answers', 'Count the rockets\nDraw a rocket');
  await fill('What is ¼ of 12?', 'How many rockets are there?');
  await fillLabel('Answer key (one per line, in the same order)', 'Five');
  await fill('https://… (video, reading, worksheet)', 'example.com/rockets');
  await fill('Label', 'Rocket video');
  await click('Add link', { exact: true });
  await click('Save lesson');
  await expect('1. Counting rockets', 'lesson renamed');
  let p = await pkgNamed('Space Math');
  const l1 = p?.units[0].lessons[0];
  log(l1?.steps.length === 2 && l1.questions[0] === 'How many rockets are there?' && l1.answers?.[0] === 'Five' && l1.links[0].url === 'https://example.com/rockets' && l1.pages === '4–9', 'lesson details saved');
  await clickLabel('Move lesson 2 up');
  p = await pkgNamed('Space Math');
  log(p.units[0].lessons[0].title === 'Lesson 2', 'reorder lessons');
  await clickLabel('Move lesson 1 down');
  await click('📋 Paste more lessons');
  await fill('Unit 4: Decimals\nTenths\nHundredths\nMoney math', 'Unit 3: Planets\nMercury\nVenus');
  await click('Add 2 lessons');
  await expect('6. Venus', 'pasted lessons appended');

  scenario('Publish (local)');
  await click('🚀 Publish');
  await expect('Your own work: you choose the license and the price.');
  await click('CC BY', { exact: true });
  await expect('licensed under CC BY 4.0', 'credit line for an open license');
  await fillLabel('Price ($, 0 = free)', '6');
  await click('Publish to the Marketplace');
  await sleep(500);
  p = await pkgNamed('Space Math');
  log(p.status === 'published' && p.version === 1 && !!p.listingId, 'published v1');
  const mine = (await store()).myListings?.find((l) => l.packageId === p.id);
  log(mine?.price === 6 && mine.lessons === 6 && mine.outline?.length === 3 && mine.license?.kind === 'cc_by', 'listing carries price, lessons, outline, license');
  await click('View listing');
  await expect("What's inside", 'listing shows the outline');
  await expect('Counting rockets');
  await expect('License: CC BY 4.0', 'listing shows the license');
  await expect('Edit in Studio');
  await click('Edit in Studio');
  await click('📝 Details');
  await fillLabel('Title', 'Space Math!');
  await click('🚀 Publish');
  await expect('changes that aren’t published', 'unpublished changes flagged');
  await click('Publish update (v2)');
  await sleep(500);
  log((await pkgNamed('Space Math!'))?.version === 2, 'publish an update');

  scenario('Convert a book (private)');
  await page.goto(`${BASE}/studio/new`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await click('Convert a book you own');
  await fill('Math Level 4', 'Earth Science Reader');
  await fill('Chapter 1: Whole Numbers ..... 1\n  1.1 Place Value ..... 2\n  1.2 Rounding ..... 9\nChapter 2: Fractions ..... 15', 'Chapter 1: Rocks ..... 1\n  1.1 Minerals ..... 2\n  1.2 Crystals ..... 10\nChapter 2: Water ..... 20\n  2.1 Rivers ..... 21');
  await fillLabel('Last page (optional)', '30');
  await expect('Preview: 3 lessons in 2 units', 'live preview');
  await expect('Crystals · pp. 10–19', 'page ranges from the contents');
  await click('Create lesson plan');
  await click('🏠 Use');
  await expect('stays private to your family', 'book conversions are private');
  await expectNot('Publish to the Marketplace', 'no publish for book conversions');
  log((await pkgNamed('Earth Science Reader'))?.origin.kind === 'owned_book', 'origin recorded');

  scenario('Spreadsheet import');
  await page.goto(`${BASE}/studio/import?from=sheet`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await fillLabel('Curriculum title', 'Animal Science');
  await fill('Unit\tLesson\tPages\tSteps\nAnimals\tMammals\t4-9\tRead; Draw a mammal', 'Unit,Lesson,Pages,Steps\nAnimals,Mammals,4-9,Read; Draw a mammal\nAnimals,Birds,10-14,Watch birds\nPlants,Seeds,15-20,');
  await expect('Preview: 3 lessons in 2 units', 'CSV parsed');
  await click('Create lesson plan');
  log((await pkgNamed('Animal Science'))?.units[0].lessons[0].steps.join('|') === 'Read|Draw a mammal', 'steps from the sheet');

  scenario('Web import without an account');
  await page.goto(`${BASE}/studio/import?from=web`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await fill('https://…', 'example.org/course');
  await click('Load page');
  await sleep(500);
  await expect('Loading a website needs a Freerange account', 'explains why the page can’t load here');
  await click('Enter the details myself');
  await fillLabel('Course name', 'Open Garden Course');
  await fillLabel('Author or organization (optional)', 'Garden Project');
  await click('CC BY-NC-SA', { exact: true });
  await fillLabel('Course outline', 'Unit 1: Seeds\nWhat is a seed? https://example.org/garden/seed\nSprouting\nUnit 2: Soil\nSoil layers');
  await expect('Preview: 3 lessons in 2 units', 'pasted outline parsed');
  await click('Create lesson plan');
  await expect('saved automatically', 'plan created from a manual source');
  const manual = await pkgNamed('Open Garden Course (lesson plan)');
  log(manual?.origin.kind === 'open_web' && manual.origin.url === 'https://example.org/course' && manual.origin.licenseDetected === false && manual.license.kind === 'cc_by_nc_sa' && manual.units[0].lessons[0].links[0]?.url === 'https://example.org/garden/seed', 'source, license, and lesson links recorded');
  await click('🚀 Publish');
  await expect('No license was found on the source page', 'creator can still correct the license');
  await expect('I checked https://example.org/course', 'asks to confirm the source license');

  scenario('Studio → Compass');
  await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await expect('Published', 'dashboard sections');
  await expect('Private (family use only)');
  await click('Set up a family');
  await expect('Welcome to Freerange', 'no family yet → onboarding');
  await click('Explore with a demo family');
  await sleep(800);
  await expect('Family Flight Deck');
  await goTab('Today');
  await click('⚙️  Settings', { exact: true });
  await click('Switch to Studio');
  await expect('Test Creator Co', 'switch to Studio from Settings');
  await click('Switch to Compass');
  await expect('Family Flight Deck', 'switch back to Compass');

  scenario('Use a conversion in the family');
  const book = await pkgNamed('Earth Science Reader');
  await page.goto(`${BASE}/studio/${book.id}?tab=publish`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await click('Add to my family’s plan');
  await click('Add to plan', { exact: true });
  await expect('Added to your plan ✓');
  const cur = (await store()).curricula.find((k) => k.name === 'Earth Science Reader');
  log(cur?.outline?.length === 2 && cur.totalLessons === 3 && cur.outline[0].lessons[1].pages === '10–19', 'curriculum has the lesson-by-lesson plan');

  scenario('Studio edits flow into the plan');
  // Edit the conversion (a new first lesson) after one kid has finished a lesson.
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('freerange-studio'));
    const p = s.state.packages.find((x) => x.id === id);
    p.units[0].lessons.unshift({ id: 'pl-e2e-intro', title: 'Rocks all around us', steps: ['Collect three rocks'], links: [], questions: [] });
    p.updatedAt = new Date().toISOString();
    localStorage.setItem('freerange-studio', JSON.stringify(s));
    const f = JSON.parse(localStorage.getItem('freerange-v1'));
    const c = f.state.curricula.find((k) => k.packageId === id);
    c.progress[c.childIds[0]] = 1;
    localStorage.setItem('freerange-v1', JSON.stringify(f));
  }, book.id);
  await page.goto(`${BASE}/learn`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await expect('You changed this plan in Studio', 'My Curriculum notices the Studio edit');
  await click('Review update');
  await expect('3 → 4 lessons');
  await expect('＋ 1 new');
  await expect('Rocks all around us');
  await expect('counts as done', 'explains the new lesson before the kid’s spot');
  await click('Update my plan');
  await sleep(500);
  const upd = (await store()).curricula.find((k) => k.packageId === book.id);
  log(upd.totalLessons === 4 && upd.progress[upd.childIds[0]] === 2 && upd.outline[0].lessons[0].title === 'Rocks all around us', 'plan updated and the kid stays past the lesson they finished');
  await expectNot('You changed this plan in Studio', 'banner gone after updating');
  // Another edit, kept out of the plan on purpose.
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('freerange-studio'));
    const p = s.state.packages.find((x) => x.id === id);
    p.units[0].lessons[0].title = 'Rocks everywhere';
    p.updatedAt = new Date().toISOString();
    localStorage.setItem('freerange-studio', JSON.stringify(s));
  }, book.id);
  await page.goto(`${BASE}/learn`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await click('Review update');
  await expect('✏️ 1 changed');
  await click('Keep the plan as it is');
  await sleep(300);
  await expectNot('You changed this plan in Studio', 'kept the plan as it is');
  log((await store()).curricula.find((k) => k.packageId === book.id).outline[0].lessons[0].title === 'Rocks all around us', 'plan unchanged after keeping it');

  // Editing pacing details keeps the lesson plan (the conversion is the last card).
  await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.innerText.trim() === 'Edit').at(-1)?.click());
  await expect('Edit curriculum');
  await click('Save', { exact: true });
  await sleep(300);
  log(!!(await store()).curricula.find((k) => k.packageId === book.id)?.outline?.length, 'editing the curriculum keeps its lesson plan');

  scenario('Get a Library curriculum and see the lessons');
  await page.goto(`${BASE}/listing/l-lib-rays-primary-arithmetic`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await expect("What's inside");
  await expect('Counting to 10');
  await expect('License: Public domain');
  await expect('by Joseph Ray', 'listed under its original author');
  await click('Get it free', { exact: true });
  await click('Get it free', { exact: true });
  await sleep(800);
  await expect('in your library', 'plan sheet opens after claiming');
  await click('Add to plan', { exact: true });
  await expect('Added to your plan ✓');
  const NAME = "Ray's New Primary Arithmetic";
  const fw = (await store()).curricula.find((k) => k.name.startsWith(NAME));
  log(fw?.outline?.length === 13 && fw.totalLessons === 89 && fw.license?.kind === 'public_domain', 'the full plan and license come with it');
  // Find the first scheduled lesson in a kid's days.
  await page.goto(`${BASE}/today`, { waitUntil: 'networkidle0' });
  await sleep(800);
  const st = await store();
  const kidId = fw.childIds[0];
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('freerange-v1'));
    s.state.mode = { kind: 'kid', childId: id };
    localStorage.setItem('freerange-v1', JSON.stringify(s));
  }, kidId);
  await page.goto(`${BASE}/kid/${kidId}`, { waitUntil: 'networkidle0' });
  await sleep(1000);
  if (await has('How are you feeling today?')) await click('Super!');
  let found = false;
  for (let i = 0; i < 9 && !found; i++) {
    found = await page.evaluate((name) => {
      const el = [...document.querySelectorAll('[tabindex]')].reverse().find((e) => e.offsetParent && e.innerText.includes(name));
      el?.click();
      return !!el;
    }, NAME);
    if (!found) await clickLabel('Next day');
  }
  await sleep(700);
  log(found, `lesson appears in ${st.children.find((k) => k.id === kidId)?.name}'s days`);
  if (found) {
    await expect('Lesson 1 of 89: Lesson I: Counting to 10', 'mission shows the lesson title');
    await expect('Count out 1 to 10 buttons', 'mission steps come from the lesson');
    await expect('Lesson plan by Freerange', 'credit shown on the lesson');
    await click('Print worksheet');
    await click('Save & print').catch(() => {});
    await sleep(800);
    const printed = await page.evaluate(() => [...document.querySelectorAll('iframe')].at(-1)?.contentDocument?.body?.textContent ?? '');
    log(printed.includes('Write the figure for seven.') && printed.includes('public domain'), 'worksheet prints the lesson’s questions and credit');
    log(!printed.includes('jar of beans') && !printed.includes('For grown-ups'), 'kid worksheet leaves out the answers and parent notes');
    await expectNot('answer key', 'kid mode hides the answer key');
    await expectNot('jar of beans', 'kid mode hides parent notes');

    scenario('Answer key for grown-ups');
    const lessonDate = await page.evaluate((name) => {
      const s = JSON.parse(localStorage.getItem('freerange-v1'));
      s.state.mode = { kind: 'parent' };
      localStorage.setItem('freerange-v1', JSON.stringify(s));
      return s.state.tasks.filter((t) => t.title.startsWith(name)).map((t) => t.date).sort()[0];
    }, NAME);
    await page.goto(`${BASE}/today`, { waitUntil: 'networkidle0' });
    await sleep(800);
    for (let i = 0; i < 14 && !(await has(NAME)); i++) await clickLabel('Next day');
    log(await has(NAME), `lesson on the parent's day (${lessonDate})`);
    await expect('Answer key', 'day has an answer key to print');
    await page.evaluate((name) => [...document.querySelectorAll('[tabindex]')].reverse().find((e) => e.offsetParent && e.innerText.includes(name) && e.innerText.length < 200)?.click(), NAME);
    await expect('🔑 Show answer key');
    await click('🔑 Show answer key');
    await expect('seven. → 7', 'parent sees the answers');
    await expect('jar of beans', 'parent sees the notes');
    await click('Answer key');
    await sleep(800);
    const key = await page.evaluate(() => [...document.querySelectorAll('iframe')].at(-1)?.contentDocument?.body?.textContent ?? '');
    log(key.includes('Write the figure for seven.') && key.includes('For grown-ups') && key.includes('jar of beans'), 'answer key prints with answers and notes');
  }
}

try {
  await run();
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
  await shot('studio-failure').catch(() => {});
}
const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all studio scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
