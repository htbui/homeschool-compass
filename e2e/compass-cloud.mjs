// Compass with accounts: a family's devices and a second parent staying in sync
// (invites, "which family?" on a device that already has one, kid mode per
// device, concurrent offline edits, removing a child, erase + sign back in).
// Needs the local Supabase stack and the cloud web build:
// `npx expo start --web --port 8092`, then `BASE_URL=http://localhost:8092 node e2e/compass-cloud.mjs`
// (W=390 H=844 for phone size).
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 900);
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PASSWORD = 'freerange-test-1';
const EMAIL = `compass-pat-${run}@example.test`;
const EMAIL_PARTNER = `compass-sam-${run}@example.test`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 480000).unref();

let failures = 0;
let section = '';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
const scenario = (name) => { section = name; console.log(`\n— ${name} (${W}×${H})`); };

// ───────────────────────────── Seed (dates from today; every day is a school day)
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return key(d); };
const TODAY = day(0);
const TOMORROW = day(1);
const ALL = [0, 1, 2, 3, 4, 5, 6];
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - 20); return key(d); };
const ADA = `ada-${run}`;
const BEN = `ben-${run}`;
const block = (p) => ({ subject: 'other', mode: 'solo', durationMin: 30, days: ALL, icon: '⭐', steps: [], ...p });
const family = (name, children, blocks) => ({
  family: { familyName: name, parentName: 'Pat Lee', parentPin: '2468', stateCode: 'CO', zip: '80202', values: [], interests: [], schoolYearStart: day(-60), schoolYearEnd: day(200), schoolDays: ALL, createdAt: `${day(-7)}T09:00:00.000Z` },
  children, blocks, tasks: [], help: [], moods: [], evidence: [], hoursLogs: [], curricula: [], expenses: [], esaAnnualAward: 0,
  noi: { schoolYear: '2026–2027', parentName: 'Pat Lee', address: '', district: '', superintendent: '', signature: '', checklist: {} },
  purchases: [], myListings: [], myReviews: [], helpfulVotes: [], localGifts: [], followedCreators: [], mode: { kind: 'parent' },
});
const kid = (id, name, age, avatar) => ({ id, name, birthdate: yearsAgo(age), grade: '', avatar, color: '#3D9970', learningDifferences: [], passions: [], soloToleranceMin: 20, sparks: 0 });
const FAMILY = `Cloud Crew ${run}`;
const seed = family(FAMILY, [kid(ADA, 'Ada', 9, '🦉'), kid(BEN, 'Ben', 7, '🦖')], [
  block({ id: 'b-read', title: 'Silent reading', subject: 'reading', childIds: [ADA], start: '09:00' }),
  block({ id: 'b-math', title: 'Math page', subject: 'math', childIds: [ADA], start: '10:00' }),
  block({ id: 'b-art', title: 'Art corner', subject: 'art', childIds: [ADA], start: '11:00' }),
  block({ id: 'b-ben', title: 'Lego time', subject: 'free_play', childIds: [BEN], start: '09:00' }),
]);

/** A browser "device" with its own storage, plus helpers bound to it. */
async function device(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: W, height: H });
  page.setDefaultTimeout(15000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`));
  const text = () => page.evaluate(() => document.body.innerText);
  const d = {
    page,
    async waitFor(t, ms = 15000) {
      for (const end = Date.now() + ms; Date.now() < end; await sleep(300)) if ((await text()).includes(t)) return true;
      return false;
    },
    async expect(t, label = `shows "${t}"`, ms) { log(await d.waitFor(t, ms), `${name}: ${label}`); },
    async click(t, { exact = false } = {}) {
      for (const end = Date.now() + 8000; Date.now() < end; await sleep(300)) {
        const ok = await page.evaluate((t, exact) => {
          const el = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse().find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)) && e.getAttribute('aria-disabled') !== 'true');
          el?.click();
          return !!el;
        }, t, exact);
        if (ok) return sleep(500);
      }
      throw new Error(`[${section}] ${name}: nothing clickable with text "${t}"`);
    },
    async fillLabel(label, value) {
      const tag = await page.evaluate((label) => {
        const l = [...document.querySelectorAll('div,span')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === label).at(-1);
        for (let n = l, i = 0; n && i < 4; i++, n = n.parentElement) {
          const input = n.parentElement?.querySelector('input,textarea');
          if (input) { const t = `x${Math.random().toString(36).slice(2)}`; input.setAttribute('data-e2e', t); return t; }
        }
        return null;
      }, label);
      if (!tag) throw new Error(`[${section}] ${name}: no input for "${label}"`);
      const h = await page.$(`[data-e2e="${tag}"]`);
      await h.evaluate((e) => { e.focus(); e.select?.(); });
      await page.keyboard.press('Backspace');
      await page.keyboard.type(value);
      await sleep(150);
    },
    async pin(digits) { for (const c of digits) await d.click(c, { exact: true }); await sleep(300); },
    store: () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-v1') ?? '{}').state ?? {}),
    account: () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-account') ?? '{}').state ?? {}),
    async goto(path) { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' }); await sleep(800); },
    async waitStore(pred, ms = 20000) {
      for (const end = Date.now() + ms; Date.now() < end; await sleep(400)) if (pred(await d.store())) return true;
      return false;
    },
    async seed(state) {
      await page.goto(BASE, { waitUntil: 'networkidle0' });
      await page.evaluate((state) => {
        localStorage.clear();
        localStorage.setItem('freerange-v1', JSON.stringify({ state, version: 0 }));
        localStorage.setItem('freerange-printer', JSON.stringify({ state: { config: { mode: 'dialog', paper: 'letter', setupAt: new Date().toISOString() } }, version: 0 }));
      }, state);
      await d.goto('/');
    },
    /** Kid mode for one kid, through the picker and the mood check. */
    async kidMode(kidName) {
      await d.goto('/today');
      await d.click('Kid mode');
      await d.click(kidName);
      await d.click('Okay');
    },
  };
  return d;
}

async function account(d, email, mode) {
  await d.goto('/account');
  if (mode === 'up') await d.click('Create account', { exact: true });
  await d.fillLabel('Email', email);
  await d.fillLabel('Password', PASSWORD);
  await d.click(mode === 'up' ? 'Create account' : 'Sign in', { exact: true });
}

const todays = (s, childId, title) => s.tasks?.find((t) => t.childId === childId && t.title === title && t.date === TODAY);

try {
  scenario('First device: a local family moves to the cloud');
  const A = await device('parent-phone');
  await A.seed(seed);
  await A.expect('Family Flight Deck');
  await account(A, EMAIL, 'up');
  await A.expect('☁️ Synced', 'family uploaded after sign-up', 20000);
  const accA = await A.account();
  log(!!accA.familyId && accA.version >= 1, 'linked to a cloud family');

  scenario('Second parent joins with an invite code');
  await A.click('Create invite code');
  await A.expect('Works once, for 7 days.');
  const code = await A.page.evaluate(() => document.body.innerText.match(/\b[A-HJ-NP-Z2-9]{8}\b/)?.[0]);
  log(!!code, `invite code shown (${code})`);
  const C = await device('partner-tablet');
  await C.goto('/');
  await account(C, EMAIL_PARTNER, 'up');
  await C.expect('Join a family');
  await C.fillLabel('Invite code', code.toLowerCase());
  await C.click('Join family', { exact: true });
  log(await C.waitStore((s) => s.family?.familyName === FAMILY), 'partner device downloads the family');
  log((await C.account()).familyId === accA.familyId, 'same family id');
  await C.goto('/account');
  await C.fillLabel('Invite code', 'AAAAAAAA').catch(() => {});
  log(!(await C.page.evaluate(() => document.body.innerText.includes('Join a family'))), 'no “join” once in a family');

  scenario('A device that already has its own family asks which one to use');
  const D = await device('old-laptop');
  await D.seed(family(`Laptop Family ${run}`, [kid(`zed-${run}`, 'Zed', 8, '🐙')], []));
  await account(D, EMAIL, 'in');
  await D.expect('Which family should this device use?');
  await D.expect(`this device has “Laptop Family ${run}”`);
  log((await D.store()).family.familyName === `Laptop Family ${run}`, 'nothing replaced before the parent chooses');
  await D.click("Use my account's family");
  log(await D.waitStore((s) => s.family?.familyName === FAMILY && s.children.length === 2), 'chose the account’s family');
  log(!(await A.store()).children.some((k) => k.name === 'Zed'), 'the laptop’s old family never reached the account');

  scenario('Kid mode is per device; kid work and help reach the parent');
  await C.kidMode('Ada');
  await C.expect('Your missions today');
  await C.click('Silent reading');
  await C.click("I'm done!");
  await C.click('😕 Tricky');
  await C.click('Mark complete');
  await sleep(2200);
  log(await A.waitStore((s) => todays(s, ADA, 'Silent reading')?.status === 'done' && todays(s, ADA, 'Silent reading')?.selfAssessment === 1), 'tricky mission done on the tablet shows on the phone');
  await C.click('for help');
  await C.click('OK', { exact: true });
  log(await A.waitStore((s) => s.help?.some((h) => h.childId === ADA && !h.resolvedAt)), 'help request reaches the phone');
  log((await A.store()).mode?.kind === 'parent' && (await C.store()).mode?.kind === 'kid', 'phone stays parent, tablet stays kid');
  await A.goto('/today');
  await A.expect('Help queue (1 waiting)');
  await A.click('On my way ✓');
  log(await C.waitStore((s) => s.help?.every((h) => h.resolvedAt)), 'resolving on the phone clears it on the tablet');
  await C.expect('Ask Pat for help', 'kid can ask again');

  scenario('Concurrent offline edits merge');
  await C.page.setOfflineMode(true);
  await C.click('Math page');
  await C.click("I'm done!");
  await C.click('Mark complete');
  await sleep(1500);
  // Meanwhile the parent bumps what's left of Ada's day and renames the family.
  await A.goto('/today');
  await A.click('Bump remaining');
  await A.click('Next school day');
  await A.expect('Bumped');
  await A.goto('/settings');
  await A.fillLabel('Family name', `${FAMILY}!`);
  await sleep(2500);
  await C.page.setOfflineMode(false);
  await C.page.evaluate(() => window.dispatchEvent(new Event('online')));
  const merged = (s) => s.family?.familyName === `${FAMILY}!` && todays(s, ADA, 'Math page')?.status === 'done';
  log(await A.waitStore(merged, 70000), 'phone has the tablet’s offline work and its own rename');
  log(await C.waitStore(merged, 70000), 'tablet has both too');
  const sA = await A.store();
  const art = sA.tasks.find((t) => t.childId === ADA && t.title === 'Art corner' && t.bumpedFrom === TODAY);
  log(art?.date === TOMORROW, 'the bumped Art corner stayed bumped');
  log(sA.tasks.filter((t) => t.childId === ADA && t.title === 'Math page' && (t.date === TODAY || t.bumpedFrom === TODAY)).length === 1, 'no duplicate Math page after the merge');

  scenario('Removing a child reaches every device');
  await C.click('Switch kid');
  await C.click('Ben');
  await C.click('Okay');
  await C.click('for help');
  await C.click('OK', { exact: true });
  log(await A.waitStore((s) => s.help?.some((h) => h.childId === BEN && !h.resolvedAt)), 'Ben’s help request reaches the phone');
  await A.goto('/settings');
  await A.click('Ben');
  await A.click('Remove Ben');
  await A.click('Remove', { exact: true });
  log(await D.waitStore((s) => s.children?.length === 1 && !s.help?.some((h) => h.childId === BEN)), 'laptop: Ben and his help request are gone');
  await A.goto('/today');
  await A.expect('No one needs you right now.', 'no nameless request left in the queue');

  scenario('Erase this device, then sign back in');
  await D.goto('/settings');
  await D.click('Erase everything');
  await D.click('Erase', { exact: true });
  await D.expect('Welcome to Freerange', 'laptop erased and signed out');
  await sleep(1500);
  log((await A.store()).family?.familyName === `${FAMILY}!`, 'erasing one device does not erase the family');
  await D.click('Already use Freerange? Sign in');
  await D.fillLabel('Email', EMAIL);
  await D.fillLabel('Password', PASSWORD);
  await D.click('Sign in', { exact: true });
  log(await D.waitStore((s) => s.family?.familyName === `${FAMILY}!` && s.children?.length === 1), 'signing back in restores the family');
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
}
const relevant = errors.filter((e) => !/DevTools|Download the React|Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError|WebSocket/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all Compass cloud scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
