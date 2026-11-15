// Shared browser helpers and a seeded family for the Compass e2e journeys
// (compass-kid.mjs, compass-records.mjs). All dates are computed from today and
// every day is a school day, so the rhythm always fills today, yesterday and tomorrow.
import { mkdirSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

export const BASE = process.env.BASE_URL ?? 'http://localhost:8082';
export const W = Number(process.env.W ?? 1280);
export const H = Number(process.env.H ?? 900);
export const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

export const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 300000).unref();
export const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
page.setDefaultTimeout(15000);
export const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

let failures = 0;
let section = '';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
export const scenario = (name) => { section = name; console.log(`\n— ${name} (${W}×${H})`); };
export const bodyText = () => page.evaluate(() => document.body.innerText);
export const has = async (t) => (await bodyText()).includes(t);
/** Wait (up to 5 s) for text to appear, then record the result. */
export async function expect(t, label = `shows "${t}"`) {
  const ok = await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 5000, polling: 100 }, t).then(() => true, () => false);
  log(ok, label);
}
export async function expectNot(t, label = `hides "${t}"`) {
  const ok = await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout: 3000, polling: 100 }, t).then(() => true, () => false);
  log(ok, label);
}
/** Click the last visible clickable whose text matches (dialogs render last, so they win). Waits up to 5 s for it. */
export async function click(text, { exact = false } = {}) {
  const tryClick = () => page.evaluate((t, exact) => {
    const els = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse();
    const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)) && e.getAttribute('aria-disabled') !== 'true');
    el?.click();
    return !!el;
  }, text, exact);
  for (let i = 0; i < 25; i++) {
    if (await tryClick()) return sleep(350);
    await sleep(200);
  }
  throw new Error(`[${section}] nothing clickable with text "${text}"`);
}
export async function clickLabel(label) {
  const found = await page.waitForFunction((l) => {
    const el = [...document.querySelectorAll(`[aria-label="${l}"]`)].reverse().find((e) => e.offsetParent !== null);
    el?.click();
    return !!el;
  }, { timeout: 5000, polling: 100 }, label).then(() => true, () => false);
  if (!found) throw new Error(`[${section}] nothing labelled "${label}"`);
  await sleep(400);
}
/** Type into the last visible input/textarea with this placeholder. */
export async function fill(placeholder, text) {
  const tag = await page.evaluate((ph) => {
    const el = [...document.querySelectorAll('input,textarea')].filter((e) => e.offsetParent !== null && (e.getAttribute('placeholder') ?? '') === ph).at(-1);
    if (!el) return null;
    const t = `f${Math.random().toString(36).slice(2)}`;
    el.setAttribute('data-e2e', t);
    return t;
  }, placeholder);
  if (!tag) throw new Error(`[${section}] no input with placeholder "${placeholder}"`);
  const h = await page.$(`[data-e2e="${tag}"]`);
  await h.evaluate((e) => { e.focus(); e.select?.(); });
  await page.keyboard.press('Backspace');
  if (text) await page.keyboard.type(text);
  await sleep(150);
}
export const pin = async (digits) => { for (const d of digits) await click(d, { exact: true }); await sleep(300); };
export const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-v1') ?? '{}').state ?? {});
export const goTab = async (name) => {
  const ok = await page.evaluate((name) => {
    const tab = [...document.querySelectorAll('[role="tab"],a[href]')].find((e) => e.offsetParent && e.innerText.trim().split('\n').at(-1).trim() === name);
    tab?.click();
    return !!tab;
  }, name);
  if (!ok) throw new Error(`[${section}] no tab "${name}"`);
  await sleep(600);
};
export const printed = () => page.evaluate(() => [...document.querySelectorAll('iframe')].at(-1)?.contentDocument?.body?.textContent ?? '');
export const goto = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' }); await sleep(900); };
/** Open the kid's mission card whose first line contains this title. */
export const openMission = (title) => page.evaluate((title) => {
  const el = [...document.querySelectorAll('[tabindex]')].reverse().find((e) => e.offsetParent && e.innerText.split('\n').some((l) => l.includes(title)) && /min/.test(e.innerText) && e.innerText.length < 200);
  el?.click();
  return !!el;
}, title);

// ───────────────────────────── Seed (all dates relative to today)
export const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return key(d); };
export const TODAY = day(0);
export const YESTERDAY = day(-1);
export const TOMORROW = day(1);
export const run = Date.now().toString(36);
export const ALL = [0, 1, 2, 3, 4, 5, 6];
export const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 20); return key(d); };
export const ADA = `ada-${run}`;
export const BEN = `ben-${run}`;
export const lessons = Array.from({ length: 30 }, (_, i) => ({ id: `l${i + 1}`, title: `Halves ${i + 1}`, steps: ['Fold the paper', 'Shade one half'], links: [], questions: [`What is half of ${2 * (i + 1)}?`], answers: [`ANSWER-${i + 1}`], notes: `NOTE-${i + 1}` }));
export const block = (p) => ({ subject: 'other', mode: 'solo', durationMin: 30, days: ALL, icon: '⭐', steps: [], ...p });
export const seed = {
  family: { familyName: `Compass Crew ${run}`, parentName: 'Pat Lee', parentPin: '2468', stateCode: 'CO', zip: '80202', values: [], interests: [], schoolYearStart: day(-60), schoolYearEnd: day(200), schoolDays: ALL, createdAt: `${day(-7)}T09:00:00.000Z` },
  children: [
    { id: ADA, name: 'Ada', birthdate: yearsAgo(9), grade: '4th Grade', avatar: '🦉', color: '#3D9970', learningDifferences: [], passions: [], soloToleranceMin: 25, sparks: 50, pin: '1357' },
    { id: BEN, name: 'Ben', birthdate: yearsAgo(5), grade: 'Kindergarten', avatar: '🦖', color: '#E07A5F', learningDifferences: [], passions: [], soloToleranceMin: 10, sparks: 0 },
  ],
  blocks: [
    block({ id: 'b-frac', title: 'Fraction practice', subject: 'math', childIds: [ADA], start: '08:00', curriculumId: 'c-frac', icon: '🧮' }),
    block({ id: 'b-write', title: 'Writing with Pat', subject: 'writing', childIds: [ADA], mode: 'parent', start: '09:00', icon: '✏️', steps: ['Outline', 'Draft'] }),
    block({ id: 'b-read', title: 'Silent reading', subject: 'reading', childIds: [ADA], start: '10:00', icon: '📖', steps: ['Read 20 minutes'] }),
    block({ id: 'b-phon', title: 'Phonics with Pat', subject: 'phonics', childIds: [BEN], mode: 'parent', start: '09:00', icon: '🔤', steps: ['Letter sounds'] }),
    block({ id: 'b-lego', title: 'Lego time', subject: 'free_play', childIds: [BEN], start: '10:00', icon: '🧱' }),
  ],
  curricula: [{ id: 'c-frac', name: 'Fraction Forest', subject: 'math', childIds: [ADA], totalLessons: 30, lessonsDone: 0, progress: { [ADA]: 0 }, startDate: day(-60), targetEndDate: day(200), schoolDays: ALL, model: 'modular', outline: [{ id: 'u1', title: 'Halves', lessons }] }],
  // Yesterday: Ada finished reading but not writing.
  tasks: [
    { id: `y-read-${run}`, blockId: 'b-read', childId: ADA, date: YESTERDAY, title: 'Silent reading', subject: 'reading', mode: 'solo', start: '10:00', durationMin: 30, icon: '📖', steps: [], status: 'done', completedAt: `${YESTERDAY}T10:30:00` },
    { id: `y-write-${run}`, blockId: 'b-write', childId: ADA, date: YESTERDAY, title: 'Writing with Pat', subject: 'writing', mode: 'parent', start: '09:00', durationMin: 30, icon: '✏️', steps: [], status: 'todo' },
  ],
  help: [], moods: [], evidence: [], hoursLogs: [], expenses: [], esaAnnualAward: 0,
  noi: { schoolYear: '2026–2027', parentName: 'Pat Lee', address: '', district: '', superintendent: '', signature: '', checklist: {} },
  purchases: [], myListings: [], myReviews: [], helpfulVotes: [], localGifts: [], followedCreators: [],
  mode: { kind: 'parent' },
};

export async function load(state) {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((state) => {
    localStorage.clear();
    localStorage.setItem('freerange-v1', JSON.stringify({ state, version: 0 }));
    // Printing is already set up on this "device", so prints go straight to the dialog.
    localStorage.setItem('freerange-printer', JSON.stringify({ state: { config: { mode: 'dialog', paper: 'letter', setupAt: new Date().toISOString() } }, version: 0 }));
  }, state);
  await goto('/');
}


/** Run the journeys, report, and exit non-zero on any failure or console error. */
export async function finish(journeys, name) {
  try {
    await journeys();
  } catch (e) {
    failures++;
    console.log(`FAIL [${section}] ${e.message}`);
    await page.screenshot({ path: `${OUT}compass-${W}-failure.png` }).catch(() => {});
  }
  const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
  console.log(`\n${failures ? `❌ ${failures} failure(s)` : `✅ all ${name} scenarios passed`} · console errors: ${relevant.length}`);
  for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
  await browser.close();
  process.exit(failures || relevant.length ? 1 : 0);
}
