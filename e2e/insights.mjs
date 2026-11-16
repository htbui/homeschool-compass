// Studio insights, lesson versions, standards, and plan export on the web
// build (local-only server): a creator adds an easier version, a dinosaur
// theme and a standard; exports the plan as CSV (and imports it back) and
// PDF; publishes and sees the Insights tab; a family picks the dinosaur
// version for a kid, sees it in kid mode and on the worksheet, checks subject
// coverage for their state, and turns lesson sharing off.
// Run with `EXPO_PUBLIC_FREERANGE_LOCAL_ONLY=1 npx expo start --web --port 8085`,
// then `BASE_URL=http://localhost:8085 node e2e/insights.mjs`.

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
// Catch what the page downloads (CSV) and opens to print (PDF) instead of leaving the page.
await page.evaluateOnNewDocument(() => {
  window.__downloads = [];
  window.__opened = [];
  const make = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => {
    b.text?.().then((text) => window.__downloads.push({ type: b.type, text }));
    return make(b);
  };
  window.open = () => ({ document: { open() {}, write(h) { window.__opened.push(h); }, close() {} }, print() {}, onload: null });
});
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

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

  scenario('Creator adds versions and standards');
  await click('Curriculum Creator Studio');
  await fill('Maple Room Studio', 'Rock Lab');
  await click('Open my Studio');
  await click('New curriculum');
  await click('Start from scratch');
  await fill('Fractions Workshop', 'Rock Detectives');
  await fillLabel('Units', '1');
  await fillLabel('Lessons per unit', '2');
  await click('Create', { exact: true });
  await expect('saved automatically', 'editor opens');
  await fillLabel('Description', 'Counting, sorting, and measuring rocks as a way into math.');
  await click('🧮 Math');
  await click('📚 Lessons (2)');
  await click('1. Lesson 1');
  await fillLabel('Title', 'Sorting rocks');
  await fill('Watch the video\nDo problems 1–10\nCheck your answers', 'Sort ten rocks by size\nCount each pile');
  await fill('What is ¼ of 12?', 'How many piles?');
  await click('🌱 Easier', { exact: true });
  await fillLabel('Easier steps (one per line)', 'Sort five rocks');
  await click('＋ Theme');
  await fill('Dinosaurs', 'Dinosaurs');
  await fillLabel('“Dinosaurs” steps (one per line)', 'Sort dinosaur eggs by size\nCount the nests');
  await click('OA Operations & Algebraic Thinking');
  await expect('Math 1.OA', 'standard tag shows its label');
  await click('Save lesson');
  await expect('🎨 Dinosaurs', 'lesson list shows the theme');
  let p = await pkgNamed('Rock Detectives');
  const l1 = p?.units[0].lessons[0];
  log(l1?.versions?.easier?.steps?.[0] === 'Sort five rocks' && !l1.versions.harder, 'easier version saved (harder left out)');
  log(l1?.themes?.[0]?.theme === 'Dinosaurs' && l1.themes[0].steps.length === 2, 'theme saved');
  log(JSON.stringify(l1?.standards) === '["CCSS.MATH.CONTENT.1.OA"]', 'standard saved');

  scenario('Export the plan');
  await click('🚀 Publish');
  await click('Spreadsheet (CSV)');
  await sleep(500);
  const csv = (await page.evaluate(() => window.__downloads.at(-1)))?.text ?? '';
  log(csv.startsWith('Unit,Lesson,Pages,Minutes,Link,Steps,Questions,Answers,Notes,Standards,Easier steps') && csv.includes('Dinosaurs steps'), 'CSV has the importer’s columns plus versions');
  await click('PDF teacher’s guide');
  await sleep(500);
  const pdf = await page.evaluate(() => window.__opened.at(-1) ?? '');
  log(pdf.includes('Sorting rocks') && pdf.includes('🎨 Dinosaurs version') && pdf.includes('Math 1.OA'), 'PDF guide has lessons, versions, and standards');

  scenario('Publish and open Insights');
  await click('CC BY', { exact: true });
  await click('Publish to the Marketplace');
  await sleep(500);
  p = await pkgNamed('Rock Detectives');
  log(p.status === 'published', 'published');
  await click('📈 Insights');
  await expect('Only this device’s family counts, which is below the', 'explains insights need more families than this device has');
  await expect('No lesson has 5 families yet', 'nothing shown below the minimum');

  scenario('CSV imports back');
  await page.goto(`${BASE}/studio/import?from=sheet`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await fillLabel('Curriculum title', 'Rock Detectives copy');
  await fill('Unit\tLesson\tPages\tSteps\nAnimals\tMammals\t4-9\tRead; Draw a mammal', csv.trim());
  await expect('Preview: 2 lessons in 1 unit', 'CSV parsed');
  await click('Create lesson plan');
  await sleep(500);
  const copy = await pkgNamed('Rock Detectives copy');
  // Same content whatever the key order.
  const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
  const strip = (u) => JSON.stringify(sorted(u.map((x) => ({ t: x.title, l: x.lessons.map(({ id: _i, ...l }) => l) }))));
  log(!!copy && strip(copy.units) === strip(p.units), 'round trip gives the same lessons');

  scenario('Family picks the dinosaur version');
  await page.goto(`${BASE}/studio`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await click('Set up a family');
  await click('Explore with a demo family');
  await sleep(800);
  await page.goto(`${BASE}/studio/${p.id}?tab=publish`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await click('Add to my family’s plan');
  await click('Add to plan', { exact: true });
  await expect('Added to your plan ✓');
  await page.goto(`${BASE}/learn`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await expect('🌱 Easier', 'level choices on My Curriculum');
  await click('🎨 Dinosaurs', { exact: true });
  await sleep(300);
  let cur = (await store()).curricula.find((k) => k.name === 'Rock Detectives');
  const kidId = cur?.childIds[0];
  log(cur?.versionPicks?.[kidId]?.theme === 'Dinosaurs', 'pick saved for the kid');

  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('freerange-v1'));
    s.state.mode = { kind: 'kid', childId: id };
    localStorage.setItem('freerange-v1', JSON.stringify(s));
    // A grown-up set up printing on this device (kids are asked to fetch one otherwise).
    localStorage.setItem('freerange-printer', JSON.stringify({ state: { config: { mode: 'dialog', paper: 'letter', setupAt: new Date().toISOString() } }, version: 0 }));
  }, kidId);
  await page.goto(`${BASE}/kid/${kidId}`, { waitUntil: 'networkidle0' });
  await sleep(1000);
  if (await has('How are you feeling today?')) await click('Super!');
  let found = false;
  for (let i = 0; i < 9 && !found; i++) {
    found = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[tabindex]')].reverse().find((e) => e.offsetParent && e.innerText.includes('Rock Detectives'));
      el?.click();
      return !!el;
    });
    if (!found) await clickLabel('Next day');
  }
  await sleep(700);
  log(found, 'lesson appears in the kid’s days');
  if (found) {
    await expect('Sort dinosaur eggs by size', 'kid mode shows the themed steps');
    await expect('🎨 Dinosaurs version', 'kid sees which version');
    await click('Print worksheet');
    await sleep(800);
    const printed = await page.evaluate(() => [...document.querySelectorAll('iframe')].at(-1)?.contentDocument?.body?.textContent ?? '');
    log(printed.includes('Sort dinosaur eggs by size') && printed.includes('Dinosaurs version'), 'worksheet shows the themed version');
  }

  scenario('Coverage and state-required subjects');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('freerange-v1'));
    s.state.mode = { kind: 'parent' };
    s.state.family.stateCode = 'MA';
    localStorage.setItem('freerange-v1', JSON.stringify(s));
  });
  await page.goto(`${BASE}/compliance`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await expect('Subject coverage');
  await expect('1 standard tagged', 'tagged standards count toward math');
  await expect('Massachusetts asks for Art & music', 'missing required subject flagged');
  await expect('Not in your plan yet: Art & music', 'radar item');
  await click('Show 1 tagged standard');
  await expect('Math 1.OA · Operations & Algebraic Thinking');

  scenario('Turn lesson sharing off');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await sleep(800);
  await expect('never names, ages, or anything about who your kids are', 'clear wording');
  await expect('This copy of Freerange keeps everything on this device. Nothing is shared from it.', 'device-only build says nothing is shared');
  log(!(await store()).family.insightsOptOut, 'on by default');
  await click('Share anonymous lesson insights');
  await sleep(300);
  log((await store()).family.insightsOptOut === true, 'turned off');
  await click('Share anonymous lesson insights');
  await sleep(300);
  log((await store()).family.insightsOptOut === false, 'turned back on');
}

try {
  await run();
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
  await shot('insights-failure').catch(() => {});
}
const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all insights scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
