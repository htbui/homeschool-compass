// Marketplace fixes from the design review (MKT-xx) that need real accounts, against
// the local Supabase stack: a coupon refusal that stays (and is announced), expense
// tagging instead of "how are you paying", honest bundle savings, bundles capped
// above the results, storefront bundles and follows, the report link away from the
// buy box, owned items in a bundle, and buying a used curriculum from a family:
// photos, "Message the seller" without a Community connection, the seller's reply,
// and "Next: arrange pickup". The device-only parts are in ux-market.mjs.
// Needs `npm run db:start` and the web build (`npx expo start --web --port 8094`), then
//   BASE_URL=http://localhost:8094 node e2e/ux-market-cloud.mjs   (and again with W=390 H=844)
// Like market-cloud.mjs, checkout's return address is pointed at the allowed dev origin.
import { readFileSync, writeFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 900);
const phone = W < 760;
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PASSWORD = 'freerange-test-1';
const OUT = new URL('./screenshots/', import.meta.url).pathname;

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 420000).unref();

let failures = 0;
let section = '';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
const scenario = (name) => { section = name; console.log(`\n— ${name} (${W}×${H})`); };

async function device(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: W, height: H });
  page.setDefaultTimeout(15000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/functions/v1/create-checkout')) {
      try {
        const body = JSON.parse(req.postData() ?? '{}');
        if (typeof body.returnUrl === 'string') body.returnUrl = body.returnUrl.replace(new URL(BASE).origin, 'http://localhost:8081');
        return req.continue({ postData: JSON.stringify(body) });
      } catch {
        return req.continue();
      }
    }
    return req.continue();
  });
  const text = () => page.evaluate(() => document.body.innerText);
  const d = {
    page,
    text,
    async has(t) { return (await text()).includes(t); },
    async waitFor(t, ms = 15000) {
      for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await d.has(t)) return true;
      return d.has(t);
    },
    async expect(t, label = `shows "${t}"`, ms) { log(await d.waitFor(t, ms), `${name}: ${label}`); },
    async click(t, { exact = false } = {}) {
      let ok = false;
      for (const end = Date.now() + 10000; !ok && Date.now() < end; ) {
        ok = await page.evaluate((t, exact) => {
          const els = [...document.querySelectorAll('[role="button"],[role="radio"],[role="checkbox"],button,a,[tabindex]')].reverse();
          const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)) && e.getAttribute('aria-disabled') !== 'true');
          el?.click();
          return !!el;
        }, t, exact);
        if (!ok) await sleep(250);
      }
      if (!ok) throw new Error(`[${section}] ${name}: nothing clickable with text "${t}"`);
      await sleep(500);
    },
    async fillName(label, value) {
      const h = await page.waitForFunction((n) => [...document.querySelectorAll('input,textarea')].filter((e) => e.offsetParent !== null && e.getAttribute('aria-label') === n).at(-1), { timeout: 8000, polling: 150 }, label);
      await h.evaluate((e) => { e.focus(); e.select?.(); });
      await page.keyboard.press('Backspace');
      if (value) await page.keyboard.type(value);
      await sleep(150);
    },
    store: () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-v1') ?? '{}').state ?? {}),
    async goto(path) { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' }); await sleep(800); },
    fits: () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  };
  return d;
}

async function familyWithAccount(name, email) {
  const d = await device(name);
  await d.goto('/');
  await d.click('Explore with a demo family');
  await d.expect('Family Flight Deck');
  await d.goto('/account');
  await d.click('Create account', { exact: true });
  await d.fillName('Email', email);
  await d.fillName('Password', PASSWORD);
  await d.click('Create account', { exact: true });
  await d.expect('☁️ Synced', 'family uploaded after sign-up', 20000);
  return d;
}

// ───────────────────────────── Fixtures: a creator with three curricula and three bundles
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const must = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
must(await sb.auth.signUp({ email: `uxmaker-${run}@example.test`, password: PASSWORD }));
const MAKER = `Marsh Maker ${run}`;
must(await sb.from('creator_profiles').insert({ name: MAKER, bio: 'Wetland science.' }));
const lesson = (id, title) => ({ id, title, steps: ['Look closely'], links: [], questions: [] });
async function publish(key, title, price) {
  const id = `pk-ux-${key}-${run}`;
  const now = new Date().toISOString();
  const content = {
    id, title, description: `${title}: hands-on wetland science.`, subjects: ['science'], gradeMin: 1, gradeMax: 8, philosophies: ['nature_forest'], parentInvolvement: 'medium',
    familyStyle: false, minutesPerLesson: 30, lessonsPerWeek: 2, format: 'digital', cover: '🦆', color: '#2F6B5E', price,
    units: [{ id: `${id}-u1`, title: 'Unit 1', lessons: [lesson(`${id}-1`, 'Reeds'), lesson(`${id}-2`, 'Ducks')] }], origin: { kind: 'original' }, license: { kind: 'all_rights_reserved' },
    status: 'draft', version: 0, createdAt: now, updatedAt: now,
  };
  must(await sb.from('packages').upsert({ id, title, origin_kind: 'original', content }));
  return must(await sb.rpc('publish_package', { pkg_id: id })).id;
}
const POND = `Marsh Life ${run}`;
const BIRDS = `Duck Math ${run}`;
const FROGS = `Frog Facts ${run}`;
const pondId = await publish('pond', POND, 20);
const birdsId = await publish('birds', BIRDS, 10);
const frogsId = await publish('frogs', FROGS, 8);
// Duck Math is on sale at $5, so Marsh + Duck separately today is $25: a $24 bundle saves 4% — not advertised.
must(await sb.rpc('set_listing_sale', { lid: birdsId, pct: 50, ends: new Date(Date.now() + 7 * 864e5).toISOString() }));
const B1 = `Marsh and ducks ${run}`;
const bundleId = must(await sb.from('bundles').insert({ title: B1, listing_ids: [pondId, birdsId], price: 24 }).select().single()).id;
must(await sb.from('bundles').insert({ title: `Marsh and frogs ${run}`, listing_ids: [pondId, frogsId], price: 22 }));
must(await sb.from('bundles').insert({ title: `Ducks and frogs ${run}`, listing_ids: [birdsId, frogsId], price: 11 }));

const png = `${OUT}ux-market-cloud-photo.png`;
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJElEQVR4nGP4z8BAEhrVMKphVMOohlENoxpGNYxqGNVAHw0AJ8n3Ad5JmB8AAAAASUVORK5CYII=', 'base64'));

try {
  // ───────────────────────────── Signed out
  scenario('Signed out (MKT-17)');
  const anon = await device('visitor');
  await anon.goto('/');
  await anon.click('Explore with a demo family');
  await anon.goto(`/listing/${pondId}`);
  await anon.expect('🚩 Sign in to report this listing', 'MKT-17 report says to sign in, on the button itself');
  await anon.click('🚩 Sign in to report this listing');
  log(await anon.page.waitForFunction(() => location.pathname === '/account', { timeout: 8000 }).then(() => true, () => false), 'MKT-17 …and goes to sign in');

  // ───────────────────────────── Browse
  scenario('Bundles above the results (MKT-19)');
  const A = await familyWithAccount('buyer', `uxbuyer-${run}@example.test`);
  await A.goto('/market');
  await A.click('All grades', { exact: true });
  await A.fillName('Search the marketplace', run);
  await A.expect(POND);
  const bundleCards = await A.page.evaluate(() => [...document.querySelectorAll('[aria-label^="Bundle: "]')].filter((e) => e.offsetParent).length);
  log(bundleCards === 2, `MKT-19 two bundles shown of three (${bundleCards})`);
  await A.expect('See all 3', 'MKT-19 the rest are a tap away');
  if (phone) {
    const row = await A.page.evaluate(() => {
      const cards = [...document.querySelectorAll('[aria-label^="Bundle: "]')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
      return cards.length === 2 ? Math.abs(cards[0].top - cards[1].top) : -1;
    });
    log(row === 0, 'MKT-19 bundles sit in one sideways row on phones');
  }
  await A.click('See all 3');
  log((await A.page.evaluate(() => [...document.querySelectorAll('[aria-label^="Bundle: "]')].filter((e) => e.offsetParent).length)) === 3, 'MKT-19 see all shows every bundle');

  scenario('Storefront (MKT-18)');
  await A.goto(`/listing/${pondId}`);
  await A.click(`🏪 More from ${MAKER}`);
  await A.expect(`🏪 ${MAKER}`);
  const follow = await A.page.evaluate((maker) => {
    const name = [...document.querySelectorAll('div')].find((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === `🏪 ${maker}`)?.getBoundingClientRect();
    const btn = [...document.querySelectorAll('[role="button"]')].find((e) => e.offsetParent && e.innerText.trim() === '＋ Follow')?.getBoundingClientRect();
    return name && btn ? { dy: Math.abs(name.top - btn.top), right: btn.right, vw: window.innerWidth } : null;
  }, MAKER);
  log(!!follow && follow.dy < 40 && follow.right <= follow.vw, `MKT-18 Follow sits on the name’s row (${follow && Math.round(follow.dy)} px apart)`);
  await A.expect('newest curricula at the top of Marketplace → Browse', 'MKT-18 says what following does');
  await A.expect('🎁 Bundles', 'MKT-18 the storefront lists its bundles');
  await A.expect(B1);
  const sellerInCards = await A.page.evaluate((maker) => [...document.querySelectorAll('[aria-label*=", from "]')].filter((e) => e.offsetParent).some((e) => e.innerText.includes(maker)), MAKER);
  log(!sellerInCards, 'MKT-18 cards on the storefront don’t repeat the creator’s name');
  await A.click('＋ Follow');
  await A.expect('✓ Following');
  await A.goto('/market');
  await A.expect('🏪 From creators you follow', 'MKT-18 followed creators show up in Browse');

  scenario('Listing and checkout (MKT-01, 13, 14, 23, 31)');
  await A.goto(`/listing/${pondId}`);
  await A.expect(`🎁 In the bundle “${B1}”`);
  await A.expect('$25 separately today', 'MKT-13 bundle compared with today’s prices');
  log(!(await A.has('save 20%')) && !(await A.has('Save 20%')), 'MKT-13 no inflated "save 20%"');
  const report = await A.page.evaluate(() => {
    const r = [...document.querySelectorAll('[role="button"]')].find((e) => e.offsetParent && e.innerText.includes('Report this listing'))?.getBoundingClientRect();
    const reviews = [...document.querySelectorAll('div')].find((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === 'Reviews')?.getBoundingClientRect();
    const buy = [...document.querySelectorAll('[role="button"]')].find((e) => e.offsetParent && e.innerText.trim() === 'Buy')?.getBoundingClientRect();
    return r && reviews && buy ? { belowReviews: r.top > reviews.top, farFromBuy: Math.abs(r.top - buy.top) > 200 } : null;
  });
  log(!!report?.belowReviews && report.farFromBuy, 'MKT-23 report sits at the bottom, away from the buy box');
  await A.click('Buy', { exact: true });
  await A.expect('Buy for $20');
  await A.fillName('Coupon code', 'NOPE');
  await A.click('Apply', { exact: true });
  await A.expect('work for this curriculum', 'MKT-01 refused coupon says why');
  await sleep(2500);
  log(await A.has('work for this curriculum'), 'MKT-01 the reason stays after the price reloads');
  const alert = await A.page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].some((e) => e.offsetParent && e.innerText.includes('work for this curriculum')));
  log(alert, 'MKT-01 the refusal is announced to screen readers');
  await A.expect('Buy for $20', 'MKT-01 price unchanged');
  await A.page.keyboard.type('X');
  await sleep(400);
  log(!(await A.has('work for this curriculum')), 'MKT-01 editing the code clears it');
  await A.expect('Track this expense as', 'MKT-14 it’s expense tagging, not a payment method');
  log(!(await A.has('How are you paying for it?')) && !(await A.has('Tax-deductible')), 'MKT-14 no "how are you paying" or "tax-deductible"');
  await A.expect('🧾 For tax records (state credit)');
  await A.expect('💳 Family budget');
  await A.click('?', { exact: true });
  await A.expect('doesn’t change how you pay', 'MKT-14 the "?" explains it only affects the tracker');
  await A.click('🏛️ ESA / state funds');
  await A.expect('Check with your program before submitting this for reimbursement.', 'MKT-31 caption for a vendor that isn’t ESA-approved');
  log(!(await A.has('tagged for ESA reimbursement')) && !(await A.has('ready to submit for ESA reimbursement')), 'MKT-31 no caption contradicting the warning');
  await A.click('💳 Family budget');
  await A.click('Buy for $20');
  await A.expect('It’s in your library', 'bought (demo payment)', 20000);
  await A.click('Later', { exact: true });

  scenario('Bundle with something owned (MKT-13, 27)');
  await A.goto(`/bundle/${bundleId}`);
  await A.expect(B1);
  const owned = await A.page.evaluate((pond) => {
    const add = [...document.querySelectorAll('[role="button"]')].find((b) => b.offsetParent && b.getAttribute('aria-label') === `Add ${pond} to plan`);
    let card = add?.parentElement;
    while (card && getComputedStyle(card).borderTopWidth === '0px') card = card.parentElement;
    return card ? { price: /\$\d/.test(card.innerText), add: card.innerText.includes(pond) && card.innerText.includes('✓ Owned') } : null;
  }, POND);
  log(!!owned && !owned.price, 'MKT-27 an owned curriculum shows "✓ Owned", not its price');
  log(!!owned?.add, 'MKT-27 its "Add to plan" is inside the card');
  await A.expect('separately today', 'MKT-13 bundle page compares with today’s prices');

  // ───────────────────────────── Used curriculum from a family
  scenario('A family sells a used curriculum (MKT-03, 08)');
  const S = await familyWithAccount('seller', `uxseller-${run}@example.test`);
  const USED = `Used science kit ${run}`;
  await S.goto('/market?view=selling');
  await S.click('List a curriculum', { exact: true });
  await S.fillName('Title', USED);
  await S.click('🔬 Science');
  await S.click('3', { exact: true });
  await S.fillName('Price ($, 0 = free)', '0');
  await S.fillName('Pickup area (optional)', 'Golden, CO');
  await S.fillName('Description', 'Microscope slides and workbook, gently used.');
  const add = await S.page.evaluateHandle(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && e.innerText.includes('Add photo')).at(-1));
  const [chooser] = await Promise.all([S.page.waitForFileChooser({ timeout: 8000 }), add.asElement().click()]);
  await chooser.accept([png]);
  await S.expect('Photos (1 of 4)');
  await S.click('Publish listing', { exact: true });
  await S.expect(USED, 'listed', 20000);
  const row = must(await sb.from('listings').select('id, photos, pickup_area, pace_known').eq('title', USED).single());
  log(row.photos.length === 1 && /^[0-9a-f-]{36}\/[\w-]+\.jpg$/.test(row.photos[0]) && row.pickup_area === 'Golden, CO' && row.pace_known === false, `MKT-03 photo uploaded and stored as a path (${row.photos[0]})`);

  scenario('Buyer messages the seller (MKT-03)');
  await A.goto(`/listing/${row.id}`);
  await A.expect(USED);
  const img = await A.page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.src).find((s) => s.includes('/listing-photos/')));
  log(!!img, 'MKT-03 the photo shows on the listing');
  if (img) log((await fetch(img)).status === 200, 'MKT-03 the photo loads for other families');
  await A.expect('📍 Pickup around Golden, CO');
  await A.click('💬 Message the seller');
  await A.expect('Only your two families can read this conversation', 'MKT-03 privacy note before sending');
  await A.click('Send', { exact: true });
  const opened = await A.page.waitForFunction(() => location.pathname.startsWith('/messages/'), { timeout: 10000 }).then(() => true, () => false);
  log(opened, 'MKT-03 sending opens the conversation');
  await A.expect(`About their listing “${USED}”`, 'MKT-03 the conversation says what it’s about');
  await A.expect('still available?');
  log(!(await A.has(`uxseller-${run}@example.test`)), 'MKT-03 no contact details shared');
  await A.expect('Block', 'MKT-03 block is available');

  await S.goto('/messages');
  await S.expect(`About “${USED}”`, 'MKT-03 the seller sees what the buyer asked about', 15000);
  await S.click(`About “${USED}”`);
  await S.expect('still available?');
  await S.expect('Report', 'MKT-03 the seller can report the message');
  await S.fillName('Message', `Yes! Library on Saturday? ${run}`);
  await S.click('Send', { exact: true });
  await sleep(1000);
  await A.goto(A.page.url().replace(BASE, ''));
  await A.expect(`Yes! Library on Saturday? ${run}`, 'MKT-03 the seller’s reply reaches the buyer', 15000);

  scenario('After getting it: arrange pickup (MKT-03)');
  await A.goto(`/listing/${row.id}`);
  await A.click('Get it free', { exact: true });
  await A.click('Get it free', { exact: true });
  await A.expect('It’s in your library', 'claimed', 15000);
  await A.click('Later', { exact: true });
  await A.expect('Next: arrange pickup or shipping', 'MKT-03 next step after getting a used curriculum');
  await A.expect('💬 Open your conversation', 'MKT-03 …links to the conversation');
  log(await A.fits(), 'listing fits the screen');
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
}

const relevant = errors.filter((e) => !/DevTools|Download the React|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR|status of 400/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all live marketplace UX scenarios passed'} (${W}px) · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
