// Cloud scenarios with real accounts: two devices syncing one family, the
// live marketplace, and two families meeting in the community.
// Needs `npm run db:start` and `npm run web` (with .env.local pointing at it).
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const run = Date.now().toString(36);
const EMAIL_A = `dana-${run}@example.test`;
const EMAIL_C = `rosa-${run}@example.test`;
const PASSWORD = 'kinship-test-1';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 420000).unref();

let failures = 0;
let section = '';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
const scenario = (name) => { section = name; console.log(`\n— ${name}`); };

/** A browser "device" with its own storage, plus helpers bound to it. */
async function device(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.setDefaultTimeout(15000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`));
  const text = () => page.evaluate(() => document.body.innerText);
  const d = {
    page,
    text,
    async has(t) { return (await text()).includes(t); },
    async waitFor(t, ms = 15000) {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (await d.has(t)) return true; await sleep(300); }
      return false;
    },
    async expect(t, label = `shows "${t}"`, ms) { log(await d.waitFor(t, ms), `${name}: ${label}`); },
    async click(t, { exact = false } = {}) {
      const ok = await page.evaluate((t, exact) => {
        const els = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse();
        const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)));
        el?.click();
        return !!el;
      }, t, exact);
      if (!ok) throw new Error(`[${section}] ${name}: nothing clickable with text "${t}"`);
      await sleep(500);
    },
    /** Click a button inside the smallest card containing `cardText`. */
    async clickIn(cardText, buttonText) {
      const ok = await page.evaluate((cardText, buttonText) => {
        const cards = [...document.querySelectorAll('div')].filter((d) => d.offsetParent && d.innerText?.includes(cardText) && d.innerText.includes(buttonText));
        const card = cards.sort((a, b) => a.innerText.length - b.innerText.length)[0];
        const btn = card && [...card.querySelectorAll('[role="button"],[tabindex]')].find((b) => b.innerText.includes(buttonText));
        btn?.click();
        return !!btn;
      }, cardText, buttonText);
      if (!ok) throw new Error(`[${section}] ${name}: no "${buttonText}" in card "${cardText}"`);
      await sleep(600);
    },
    async fillLabel(label, value) {
      const tag = await page.evaluate((label) => {
        const l = [...document.querySelectorAll('div,span')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === label).at(-1);
        let n = l;
        for (let i = 0; i < 4 && n; i++) {
          const input = n.parentElement?.querySelector('input,textarea');
          if (input) { const t = `x${Math.random().toString(36).slice(2)}`; input.setAttribute('data-e2e', t); return t; }
          n = n.parentElement;
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
    store: () => page.evaluate(() => JSON.parse(localStorage.getItem('kinship-v1') ?? '{}').state ?? {}),
    account: () => page.evaluate(() => JSON.parse(localStorage.getItem('kinship-account') ?? '{}').state ?? {}),
    async goto(path) { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' }); await sleep(800); },
    async tab(label) {
      const ok = await page.evaluate((label) => {
        const t = [...document.querySelectorAll('[role="tab"],a[href]')].find((e) => e.offsetParent && e.innerText.trim().split('\n').at(-1).trim() === label);
        t?.click();
        return !!t;
      }, label);
      if (!ok) throw new Error(`[${section}] ${name}: no tab ${label}`);
      await sleep(700);
    },
    async waitStore(pred, ms = 15000) {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (pred(await d.store())) return true; await sleep(400); }
      return false;
    },
  };
  return d;
}

async function signUpOrIn(d, email, mode) {
  await d.goto('/account');
  if (mode === 'up') await d.click('Create account', { exact: true });
  await d.fillLabel('Email', email);
  await d.fillLabel('Password', PASSWORD);
  await d.click(mode === 'up' ? 'Create account' : 'Sign in', { exact: true });
}

try {
  // ───────────────────────────── Device A: demo family, then create an account
  scenario('Account + first sync');
  const A = await device('phone');
  await A.goto('/');
  await A.click('demo family');
  await sleep(1200);
  await signUpOrIn(A, EMAIL_A, 'up');
  await A.expect('☁️ Synced', 'family uploaded after sign-up', 20000);
  const accA = await A.account();
  log(!!accA.familyId && accA.version >= 1, 'device A linked to a cloud family');

  // ───────────────────────────── Device B: sign in on a fresh device
  scenario('Second device');
  const B = await device('tablet');
  await B.goto('/');
  await B.click('Already use Kinship? Sign in');
  await B.fillLabel('Email', EMAIL_A);
  await B.fillLabel('Password', PASSWORD);
  await B.click('Sign in', { exact: true });
  log(await B.waitStore((s) => s.family?.familyName === 'The Miller Crew'), 'family downloaded to the new device');
  log((await B.store()).children?.length === 3, 'children came along');
  await B.click('Go to Today');
  await B.expect('Family Flight Deck');

  // ───────────────────────────── Live sync both ways
  scenario('Realtime sync');
  // Add today's missions for Leo (the weekly rhythm has none on weekends).
  for (const title of ['Lego / Sensory Play', 'Outdoor Free Play']) {
    await B.click('➕  Task', { exact: true });
    await B.fillLabel('Title', title);
    await B.click('Save', { exact: true });
    await sleep(600);
  }
  // Kid finishes a mission on the tablet → the parent's phone sees it.
  await B.click('Kid mode');
  await B.click('Leo');
  await B.click('Happy');
  await B.click('Lego / Sensory Play');
  await B.click("I'm done!");
  await B.click('Mark complete');
  await sleep(2500);
  log(await A.waitStore((s) => s.tasks?.some((t) => t.title === 'Lego / Sensory Play' && t.childId === 'leo' && t.status === 'done' && t.date === new Date().toLocaleDateString('en-CA'))), 'task completed on tablet shows done on phone');
  await B.click('for help');
  await B.click('OK', { exact: true });
  log(await A.waitStore((s) => s.help?.some((h) => h.childId === 'leo' && !h.resolvedAt)), 'help request reaches the parent phone');
  // Parent renames the family on the phone → tablet updates.
  await A.goto('/settings');
  await A.fillLabel('Family name', 'The Miller-Park Crew');
  log(await B.waitStore((s) => s.family?.familyName === 'The Miller-Park Crew'), 'settings change on phone reaches tablet');
  log((await B.store()).mode?.kind === 'kid', 'tablet stays in kid mode (mode is per device)');

  // Both devices edit at once while one is offline → merge, nothing lost.
  scenario('Offline edits merge');
  // The tablet is still on Leo's day (client-side routing works offline).
  await B.page.setOfflineMode(true);
  await B.click('Outdoor Free Play');
  await B.click("I'm done!");
  await B.click('Mark complete');
  await sleep(2500);
  await A.fillLabel('Family name', 'The Millers');
  await sleep(2500);
  await B.page.setOfflineMode(false);
  // Coming back online (or to the foreground) triggers a sync.
  await B.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(500);
  const outdoorDone = (s) => s.tasks?.some((t) => t.title === 'Outdoor Free Play' && t.childId === 'leo' && t.status === 'done');
  log(await A.waitStore(outdoorDone, 70000), 'offline tablet edit reaches the phone');
  log(await B.waitStore((s) => s.family?.familyName === 'The Millers', 70000), 'phone edit made meanwhile reaches the tablet');
  log(outdoorDone(await B.store()) && (await A.store()).family?.familyName === 'The Millers', 'both edits survive the merge');

  // ───────────────────────────── Live marketplace
  scenario('Live marketplace');
  await A.goto('/market');
  log(!(await A.has('Sample catalog')), 'live catalog (no sample banner)');
  await A.click('All grades', { exact: true });
  await A.goto('/listing/l-pinecone-chem');
  await A.expect('Kitchen Chemistry');
  await A.click('Buy', { exact: true });
  await A.expect('secure checkout page', 'live checkout copy');
  await A.click('🧾 Tax-deductible');
  await A.click('Buy for $29');
  await A.expect('in your library', 'purchase completed (local demo payments)', 20000);
  await A.click('Add to plan', { exact: true });
  await A.expect('Added to your plan ✓');
  log(await B.waitStore((s) => s.curricula?.some((k) => k.name.includes('Kitchen Chemistry'))), 'new curriculum syncs to the tablet');
  log((await A.store()).expenses?.some((e) => e.description.includes('Kitchen Chemistry') && e.fundingSource === 'tax'), 'expense recorded');
  await A.goto('/listing/l-pinecone-chem');
  await A.click('Write a review');
  await A.page.evaluate(() => document.querySelector('[aria-label="5 stars"]').click());
  await A.fillLabel('Your review', 'Our kitchen became a lab. Kids loved every experiment.');
  await A.click('Post review', { exact: true });
  await A.expect('Verified purchase', 'server marked the review verified', 15000);

  // ───────────────────────────── Second family meets the first
  scenario('Community');
  const C = await device('other-family');
  await C.goto('/');
  await C.click('demo family');
  await sleep(1000);
  await C.goto('/settings');
  await C.fillLabel('Family name', 'The Riveras');
  await signUpOrIn(C, EMAIL_C, 'up');
  await C.expect('☁️ Synced', 'second family uploaded', 20000);
  // The other family sees the review the first family wrote.
  await C.goto('/listing/l-pinecone-chem');
  await C.expect('Our kitchen became a lab', 'review visible to other families');
  // Both join the community.
  for (const [d, display] of [[A, `Dana ${run}`], [C, `Rosa ${run}`]]) {
    await d.goto('/community');
    await d.expect('Join your local homeschool community');
    await d.fillLabel('Display name', display);
    await d.fillLabel('How connected families can reach you (optional)', `${display.split(' ')[0].toLowerCase()}-${run}@example.test`);
    await d.click('Join the community');
    await d.expect('Family finder');
  }
  await C.expect(`Dana ${run}`, 'family finder shows the nearby family');
  log(!(await C.has(`dana-${run}@example.test`)), 'contact hidden before connecting');
  // Click "Request to connect" on this run's family card specifically.
  await C.page.evaluate((name) => {
    const card = [...document.querySelectorAll('div')].filter((d) => d.innerText?.startsWith(name) && d.innerText.includes('Request to connect')).at(-1);
    [...card.querySelectorAll('[role="button"],[tabindex]')].find((b) => b.innerText.includes('Request to connect')).click();
  }, `Dana ${run}`);
  await sleep(500);
  await C.click('Send request');
  await C.expect('Request sent');
  await A.goto('/community');
  await A.expect('Connection requests (1)');
  await A.click('Accept', { exact: true });
  await A.expect(`rosa-${run}@example.test`, 'contact shared after accepting');
  // Co-op: A starts one, C asks to join, A approves.
  await A.click('🏫 Co-ops');
  await A.click('Start one');
  await A.fillLabel('Name', `Nature Co-op ${run}`);
  await A.click('Create', { exact: true });
  await A.expect(`Nature Co-op ${run}`);
  await C.goto('/community');
  await C.click('🏫 Co-ops');
  await C.expect(`Nature Co-op ${run}`, 'co-op visible nearby');
  await C.clickIn(`Nature Co-op ${run}`, 'Request to join');
  await C.expect('Requested · cancel');
  await A.goto('/community');
  await A.click('🏫 Co-ops');
  await A.expect('Asking to join');
  await A.clickIn(`Nature Co-op ${run}`, 'Approve');
  await A.expect(`Members: Dana ${run}, Rosa ${run}`, 'organizer approved the request');
  // Field trip with carpool matching.
  await A.click('🚌 Field trips');
  await A.click('Organize');
  await A.fillLabel('Title', `Museum day ${run}`);
  await A.fillLabel('Location (public meeting place)', 'Science museum entrance');
  await A.click('Create', { exact: true });
  await A.expect(`Museum day ${run}`);
  await A.clickIn(`Museum day ${run}`, 'Join carpool matching');
  await C.goto('/community');
  await C.click('🚌 Field trips');
  await C.expect(`Museum day ${run}`, 'field trip visible to the other family');
  await C.clickIn(`Museum day ${run}`, 'RSVP');
  await C.clickIn(`Museum day ${run}`, 'Join carpool matching');
  await C.expect(`Carpool with: Dana ${run}`, 'carpool match shown');

  // ───────────────────────────── Sign out keeps data; erase stays local
  scenario('Sign out');
  await B.goto('/account');
  await B.click('Sign out', { exact: true });
  await B.expect('Sign in to Kinship');
  log(!!(await B.store()).family, 'data kept on the device after sign-out');
  const before = (await A.account()).version;
  await A.goto('/account');
  await A.expect('☁️ Synced');
  log(before > 1, `workspace has been versioned (${before})`);
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
}

const relevant = errors.filter((e) => !/DevTools|Download the React|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all cloud scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
