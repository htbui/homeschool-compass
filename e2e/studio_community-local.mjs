// Studio & Community on the web build (local-only server), at desktop and
// phone size: creator profile checks, a chapter-only book split by pages, a
// spreadsheet with versions, answers and standards, the license rules on the
// Publish tab (no-derivatives, non-commercial, unsure sources), the Insights
// tab without an account, and kid mode never reaching parent areas.
// Run with `EXPO_PUBLIC_FREERANGE_LOCAL_ONLY=1 npx expo start --web --port 8095`,
// then `BASE_URL=http://localhost:8095 node e2e/studio_community-local.mjs`
// (and again with `W=390 H=844` for phone size).

import { mkdirSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8095';
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 900);
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 300000).unref();
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
page.setDefaultTimeout(15000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
// Exports open a print window or a download on the web; close stray tabs.
browser.on('targetcreated', async (t) => { const p = await t.page().catch(() => null); if (p && p !== page) setTimeout(() => p.close().catch(() => {}), 1500); });

let failures = 0;
let section = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
const scenario = (name) => { section = name; console.log(`\n— ${name} (${W}×${H})`); };

const bodyText = () => page.evaluate(() => document.body.innerText);
const has = async (t) => (await bodyText()).includes(t);
const waitHas = async (t, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await has(t)) return true;
  return has(t);
};
const expect = async (t, label = `shows "${t}"`) => log(await waitHas(t), label);
const expectNot = async (t, label = `hides "${t}"`) => log(!(await has(t)), label);
/** Wait until a condition on the page's stores holds. */
const waitFor = async (fn, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await fn()) return true;
  return fn();
};

async function click(text, { exact = false } = {}) {
  let ok = false;
  for (const end = Date.now() + 8000; !ok && Date.now() < end; ) {
    ok = await page.evaluate((t, exact) => {
      const els = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse();
      const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)));
      if (!el) return false;
      el.click();
      return true;
    }, text, exact);
    if (!ok) await sleep(250);
  }
  if (!ok) throw new Error(`[${section}] nothing clickable with text "${text}"`);
  await sleep(400);
}
async function isDisabled(text) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('[role="button"],button')].reverse().find((e) => e.offsetParent && e.innerText.trim() === t);
    return el ? el.getAttribute('aria-disabled') === 'true' || el.disabled === true : null;
  }, text);
}
async function typeInto(tag, text) {
  const h = await page.$(`[data-e2e="${tag}"]`);
  await h.evaluate((e) => { e.focus(); e.select?.(); });
  await page.keyboard.press('Backspace');
  if (text) {
    // Multi-line text: type line by line (Enter in a textarea is a line break).
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i) await page.keyboard.down('Shift'), await page.keyboard.press('Enter'), await page.keyboard.up('Shift');
      await page.keyboard.type(lines[i]);
    }
  }
  await sleep(150);
}
/** Fill the input that follows a label's text. */
async function fillLabel(label, text) {
  let tag = null;
  for (const end = Date.now() + 8000; !tag && Date.now() < end; await sleep(tag ? 0 : 250)) tag = await page.evaluate((label) => {
    const labels = [...document.querySelectorAll('div,span')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === label);
    let n = labels.at(-1);
    for (let i = 0; i < 4 && n; i++) {
      const input = n.parentElement?.querySelector('input,textarea');
      if (input) { const t = `x${Math.random().toString(36).slice(2)}`; input.setAttribute('data-e2e', t); return t; }
      n = n.parentElement;
    }
    return null;
  }, label);
  if (!tag) throw new Error(`[${section}] no input for label "${label}"`);
  await typeInto(tag, text);
}
/** Paste text into the input with a label (fast, keeps tabs and line breaks exactly). */
async function pasteLabel(label, text) {
  const ok = await page.evaluate((label, text) => {
    const labels = [...document.querySelectorAll('div,span')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === label);
    let n = labels.at(-1);
    for (let i = 0; i < 4 && n; i++) {
      const input = n.parentElement?.querySelector('input,textarea');
      if (input) {
        const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      n = n.parentElement;
    }
    return false;
  }, label, text);
  if (!ok) throw new Error(`[${section}] no input for label "${label}"`);
  await sleep(300);
}
const shot = (name) => page.screenshot({ path: `${OUT}${name}-${W}.png` });
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-v1') ?? '{}').state ?? {});
const studio = () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-studio') ?? '{}').state ?? {});
const pkgNamed = async (title) => (await studio()).packages?.find((p) => p.title === title);
const goto = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' }); await sleep(700); };
const noSideScroll = async (label) => log(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: no sideways scrolling`);

async function main() {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);

  // ───────────────────────────── Setup and profile
  scenario('Creator profile');
  await click('Curriculum Creator Studio');
  await expect('Freerange Studio');
  await fillLabel('Creator or shop name', 'X');
  log(await isDisabled('Open my Studio'), 'a one-letter name isn’t enough');
  await fillLabel('Creator or shop name', `Maple Room ${run}`);
  await fillLabel('Website (optional)', 'not a site');
  await expect('Enter a web address, like example.com', 'explains a bad website');
  log(await isDisabled('Open my Studio'), 'a bad website blocks saving');
  await fillLabel('Website (optional)', 'mapleroom.example');
  log((await isDisabled('Open my Studio')) === false, 'a good name and website can be saved');
  await click('Open my Studio');
  await expect(`Maple Room ${run}`, 'dashboard shows the creator');
  log((await studio()).profile?.website === 'https://mapleroom.example/', 'website saved as a full address');
  await noSideScroll('Studio dashboard');

  // ───────────────────────────── Table of contents import
  scenario('Book with chapters only');
  await goto('/studio/import?from=book');
  await fillLabel('Book title', `Earth Book ${run}`);
  await fillLabel('Publisher (optional)', 'Fernwood Press');
  await pasteLabel('Table of contents', 'Chapter 1: Rocks ..... 1\nChapter 2: Water ..... 11');
  await expect('2 chapters had no lessons listed', 'warns that chapters became single lessons');
  await fillLabel('Pages per lesson (optional)', '5');
  await fillLabel('Last page (optional)', '20');
  await expect('Preview: 4 lessons in 2 units', 'chapters split by pages per lesson');
  await expect('Chapter 1: Rocks (1 of 2) · pp. 1–5', 'page ranges in each part');
  await expectNot('had no lessons listed', 'warning gone once pages per lesson is set');
  await click('Create lesson plan');
  await expect('saved automatically', 'editor opens');
  const book = await pkgNamed(`Earth Book ${run}`);
  log(book?.origin.kind === 'owned_book' && book.origin.publisher === 'Fernwood Press' && book.license.kind === 'all_rights_reserved' && book.units[1].lessons[1].pages === '16–20', 'book origin, rights, and last range recorded');
  await click('🏠 Use');
  await expect('stays private to your family', 'conversions stay private');
  await expect('Fernwood Press — all rights reserved');
  await expectNot('Publish to the Marketplace', 'no way to publish a conversion');

  // ───────────────────────────── Spreadsheet import with versions
  scenario('Spreadsheet with versions, answers and standards');
  await goto('/studio/import?from=sheet');
  await fillLabel('Curriculum title', `Dino Math ${run}`);
  await pasteLabel('Lesson rows', [
    'Unit\tLesson\tMinutes\tSteps\tQuestions\tAnswers\tEasier steps\tDinosaurs questions\tDinosaurs answers\tStandards',
    'Counting\tCount to 20\t25\tCount beans; Write the numbers\tWhat comes after 9?;What comes after 19?\t10;-\tCount 10 beans\tHow many T. rex teeth?\t60\tCCSS.MATH.CONTENT.K.CC',
    'Counting\tSkip counting\t\tCount by 2s\t\t\t\t\t\t',
  ].join('\n'));
  await expect('Preview: 2 lessons in 1 unit', 'rows parsed');
  await click('Create lesson plan');
  await expect('saved automatically');
  const dino = await pkgNamed(`Dino Math ${run}`);
  const first = dino?.units[0].lessons[0];
  log(first?.minutes === 25 && first.steps.length === 2 && first.answers?.join('|') === '10', 'steps, minutes and answers (blank kept as blank)');
  log(first?.versions?.easier?.steps[0] === 'Count 10 beans' && first.themes?.[0]?.theme === 'Dinosaurs' && first.themes[0].answers?.[0] === '60', 'easier and themed versions with their answers');
  log(first?.standards?.[0] === 'CCSS.MATH.CONTENT.K.CC', 'standards tag');
  await click('1. Count to 20');
  await expect('🌱 Easier ✓', 'lesson editor shows the easier version');
  await expect('🎨 Dinosaurs ✓', 'lesson editor shows the theme');
  await expect('Math K.CC · Counting & Cardinality', 'standards read as labels');
  await click('Save lesson');
  await click('🚀 Publish');
  await expect('Your own work: you choose the license and the price.');
  await expect('Before publishing, add:', 'lists what’s missing');
  await expect('a description (20+ characters)');
  log(await isDisabled('Publish to the Marketplace'), 'can’t publish with things missing');

  // ───────────────────────────── License rules for an online source
  scenario('Publish rules for a source without a detected license');
  await goto('/studio/import?from=web');
  await fillLabel('Course page', 'open.example.org/pond');
  await click('Can’t load the page? Enter the details myself');
  await fillLabel('Course name', `Open Pond ${run}`);
  await click('CC BY-ND', { exact: true });
  await pasteLabel('Course outline', 'Unit 1: Frogs\nFrog life cycle\nTadpoles\nUnit 2: Water\nTesting pond water');
  await expect('Preview: 3 lessons in 2 units');
  await click('Create lesson plan');
  await expect('saved automatically');
  await click('📝 Details');
  await fillLabel('Description', 'Pond science for the whole family, from frogs to water testing.');
  await click('🔬 Science');
  await click('🚀 Publish');
  await expect('No license was found on the source page', 'license can be corrected by the creator');
  await expect('CC BY-ND doesn’t allow adapted versions to be shared', 'no-derivatives sources stay private');
  log(await isDisabled('Publish to the Marketplace'), 'publish blocked for a no-derivatives source');
  await expectNot('I checked https://open.example.org/pond', 'no license confirmation for a license that forbids it');
  await click('CC BY-NC', { exact: true });
  await expect('Confirm the source’s license before publishing.', 'asks to confirm the license');
  await expect('The source is non-commercial, so this must be free.', 'price locked to free');
  log(await isDisabled('Publish to the Marketplace'), 'publish waits for the confirmation');
  await click('I checked https://open.example.org/pond');
  await expect('non-commercial, so it must be free', 'note explains the non-commercial rule');
  await expect('Adapted from “Open Pond', 'credit line names the source');
  await click('Publish to the Marketplace');
  const pond = await waitFor(async () => (await pkgNamed(`Open Pond ${run} (lesson plan)`))?.status === 'published');
  log(pond, 'published');
  const pondPkg = await pkgNamed(`Open Pond ${run} (lesson plan)`);
  const listing = (await store()).myListings?.find((l) => l.packageId === pondPkg?.id);
  log(listing?.price === 0 && listing.license?.kind === 'cc_by_nc' && /open\.example\.org\/pond/.test(listing.attribution ?? ''), 'listing is free, keeps the license, credits the source');
  // Changing the license after publishing needs a new confirmation.
  await click('Not sure', { exact: true });
  await expect('We couldn’t find a license on the source page', 'unsure sources can’t publish');
  log((await pkgNamed(`Open Pond ${run} (lesson plan)`))?.licenseConfirmed === false, 'changing the license clears the confirmation');
  await click('CC BY-NC', { exact: true });
  await click('I checked https://open.example.org/pond');

  scenario('Insights without an account');
  await click('📈 Insights');
  await expect('Anonymous and added up across families', 'explains insights are anonymous');
  await expect('Only this device’s family counts, which is below the', 'local-only: below the family minimum');
  await noSideScroll('Insights tab');

  scenario('Export');
  await click('🚀 Publish');
  await click('Spreadsheet (CSV)');
  await click('PDF teacher’s guide');
  await sleep(600);
  await expectNot('Error', 'exports run without an error');

  scenario('Delete a draft');
  await goto('/studio');
  await expect(`Dino Math ${run}`);
  const dinoId = (await pkgNamed(`Dino Math ${run}`))?.id;
  await goto(`/studio/${dinoId}?tab=publish`);
  await click('Delete curriculum');
  await expect(`Delete “Dino Math ${run}”?`, 'asks before deleting');
  await click('Delete', { exact: true });
  log(await waitFor(async () => !(await pkgNamed(`Dino Math ${run}`))), 'draft deleted');

  // ───────────────────────────── Kid mode never reaches parent areas
  scenario('Kid mode stays in kid mode');
  await goto('/studio');
  await click('Set up a family');
  await click('Explore with a demo family');
  await sleep(800);
  await expect('Family Flight Deck');
  const kidId = (await store()).children?.[0]?.id;
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('freerange-v1'));
    s.state.mode = { kind: 'kid', childId: id };
    localStorage.setItem('freerange-v1', JSON.stringify(s));
  }, kidId);
  for (const path of ['/community', '/messages', '/messages/some-family', '/notifications', '/studio', '/studio/import?from=web', '/coop/ABCD2345']) {
    await goto(path);
    const at = new URL(page.url()).pathname;
    log(at.startsWith('/kid'), `${path} sends a kid back to kid mode (at ${at})`);
    await expectNot('Family finder', `${path}: no family finder`);
    await expectNot('Freerange Studio', `${path}: no Studio`);
  }
  await shot('studio-community-kid');
}

try {
  await main();
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
  await shot('studio-community-local-failure').catch(() => {});
}
const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all studio & community (local) scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
