// Live marketplace journeys with real accounts against the local Supabase stack:
// a creator's storefront and follows, paid checkout with coupons (bad, expired,
// used up), the purchase landing in the library and the expense tracker,
// verified reviews with helpful votes and a report, a paid gift claimed by
// another family, and a bundle that skips what the family already has.
// Needs `npm run db:start` and the web build: `npx expo start --web --port 8094`, then
// `BASE_URL=http://localhost:8094 node e2e/market-cloud.mjs` (and again with W=390 H=844).
//
// The checkout function only sends buyers back to allowed origins
// (CHECKOUT_RETURN_ORIGINS, http://localhost:8081 locally), so when the app runs on
// another port this test points the return address at :8081. Demo payments
// complete without leaving the page, so the address is never visited.
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 900);
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PASSWORD = 'freerange-test-1';
const EMAIL_A = `buyer-${run}@example.test`;
const EMAIL_B = `friend-${run}@example.test`;

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

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
  await page.setViewport({ width: W, height: H });
  page.setDefaultTimeout(15000);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`));
  // Send checkout's return address to the allowed dev origin (see the header).
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
    async waitGone(t, ms = 8000) {
      for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (!(await d.has(t))) return true;
      return !(await d.has(t));
    },
    async expect(t, label = `shows "${t}"`, ms) { log(await d.waitFor(t, ms), `${name}: ${label}`); },
    async click(t, { exact = false } = {}) {
      let ok = false;
      for (const end = Date.now() + 10000; !ok && Date.now() < end; ) {
        ok = await page.evaluate((t, exact) => {
          const els = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse();
          const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)));
          el?.click();
          return !!el;
        }, t, exact);
        if (!ok) await sleep(250);
      }
      if (!ok) throw new Error(`[${section}] ${name}: nothing clickable with text "${t}"`);
      await sleep(500);
    },
    async clickLabel(label) {
      const ok = await page.evaluate((l) => {
        const el = [...document.querySelectorAll(`[aria-label="${l}"]`)].reverse().find((e) => e.offsetParent !== null);
        el?.click();
        return !!el;
      }, label);
      if (!ok) throw new Error(`[${section}] ${name}: nothing labelled "${label}"`);
      await sleep(400);
    },
    async fill(placeholder, value) {
      let tag = null;
      for (const end = Date.now() + 8000; !tag && Date.now() < end; await sleep(tag ? 0 : 250)) tag = await page.evaluate((ph) => {
        const el = [...document.querySelectorAll('input,textarea')].filter((e) => e.offsetParent !== null && (e.getAttribute('placeholder') ?? '') === ph).at(-1);
        if (!el) return null;
        const t = `f${Math.random().toString(36).slice(2)}`;
        el.setAttribute('data-e2e', t);
        return t;
      }, placeholder);
      if (!tag) throw new Error(`[${section}] ${name}: no input with placeholder "${placeholder}"`);
      const h = await page.$(`[data-e2e="${tag}"]`);
      await h.evaluate((e) => { e.focus(); e.select?.(); });
      await page.keyboard.press('Backspace');
      if (value) await page.keyboard.type(value);
      await sleep(150);
    },
    async fillLabel(label, value) {
      const tag = await page.evaluate((label) => {
        let n = [...document.querySelectorAll('div,span')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === label).at(-1);
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
    store: () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-v1') ?? '{}').state ?? {}),
    async goto(path) { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' }); await sleep(700); },
    async waitStore(pred, ms = 15000) {
      for (const end = Date.now() + ms; Date.now() < end; await sleep(400)) if (pred(await d.store())) return true;
      return false;
    },
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
  await d.fillLabel('Email', email);
  await d.fillLabel('Password', PASSWORD);
  await d.click('Create account', { exact: true });
  await d.expect('☁️ Synced', 'family uploaded after sign-up', 20000);
  return d;
}

// ───────────────────────────── Fixtures: a creator with two curricula, a bundle, and coupons
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const must = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
must(await sb.auth.signUp({ email: `maker-${run}@example.test`, password: PASSWORD }));
const MAKER = `Pond Maker ${run}`;
must(await sb.from('creator_profiles').insert({ name: MAKER, bio: 'Hands-on science for small naturalists.' }));
const lesson = (id, title) => ({ id, title, steps: ['Look closely'], links: [], questions: [] });
async function publish(key, title, price) {
  const id = `pk-${key}-${run}`;
  const now = new Date().toISOString();
  const content = {
    id, title, description: `${title}: a hands-on plan for young naturalists.`, subjects: ['science'], gradeMin: 1, gradeMax: 8, philosophies: ['nature_forest'], parentInvolvement: 'medium',
    familyStyle: false, minutesPerLesson: 30, lessonsPerWeek: 2, format: 'digital', cover: '🐸', color: '#2F6B5E', price,
    units: [{ id: `${id}-u1`, title: 'Unit 1', lessons: [lesson(`${id}-1`, 'Frog eggs'), lesson(`${id}-2`, 'Tadpoles')] }], origin: { kind: 'original' }, license: { kind: 'all_rights_reserved' },
    status: 'draft', version: 0, createdAt: now, updatedAt: now,
  };
  must(await sb.from('packages').upsert({ id, title, origin_kind: 'original', content }));
  return must(await sb.rpc('publish_package', { pkg_id: id })).id;
}
const POND = `Pond Life ${run}`;
const BIRDS = `Bird Math ${run}`;
const pondId = await publish('pond', POND, 20);
const birdsId = await publish('birds', BIRDS, 10);
must(await sb.rpc('set_listing_sale', { lid: birdsId, pct: 50, ends: new Date(Date.now() + 7 * 864e5).toISOString() }));
const bundleId = must(await sb.from('bundles').insert({ title: `Pond and birds ${run}`, listing_ids: [pondId, birdsId], price: 24 }).select().single()).id;
const CODE = `E2E${run}`.toUpperCase().slice(0, 20);
const OLD = `OLD${run}`.toUpperCase().slice(0, 20);
must(await sb.from('coupons').insert({ code: CODE, kind: 'percent', amount: 10, max_uses: 1 }));
must(await sb.from('coupons').insert({ code: OLD, kind: 'percent', amount: 50, expires_at: new Date(Date.now() - 864e5).toISOString() }));

try {
  // ───────────────────────────── Storefront
  scenario('Live catalog and storefront');
  const A = await familyWithAccount('buyer', EMAIL_A);
  await A.goto('/market');
  log(!(await A.has('Free & open curricula: classics and openly licensed')), 'buyer: live catalog (no local-only banner)');
  await A.click('All grades', { exact: true });
  await A.fill('Search curricula, publishers, subjects…', run);
  await A.expect(POND, 'creator’s new curriculum is in the catalog');
  await A.expect(BIRDS);
  await A.expect('$5', 'sale price shows in the catalog');
  log(await A.fits(), 'buyer: catalog fits the screen');
  await A.goto(`/listing/${pondId}`);
  await A.expect('Studio creator');
  await A.click(`🏪 More from ${MAKER}`);
  await A.expect(`🏪 ${MAKER}`, 'storefront opens');
  await A.expect('Hands-on science for small naturalists.');
  await A.expect('2 curricula');
  await A.click('＋ Follow');
  await A.expect('✓ Following', 'follows the creator');
  await A.goto('/market?view=library');
  await A.expect('Creators you follow');
  await A.expect(`🏪 ${MAKER}`, 'followed creator listed in the library');

  // ───────────────────────────── Paid checkout with coupons
  scenario('Paid checkout with a coupon');
  await A.goto(`/listing/${pondId}`);
  await A.click('Buy', { exact: true });
  await A.expect('secure checkout page', 'live checkout copy');
  await A.expect('Buy for $20');
  await A.fill('Coupon code', 'NOPE-NOT-REAL');
  await A.click('Apply', { exact: true });
  await A.expect('work for this curriculum', 'unknown coupon refused');
  await A.fill('Coupon code', OLD);
  await A.click('Apply', { exact: true });
  await A.expect('has expired', 'expired coupon refused');
  await A.expect('Buy for $20', 'price unchanged by refused coupons');
  await A.fill('Coupon code', CODE.toLowerCase());
  await A.click('Apply', { exact: true });
  await A.expect(`✓ Coupon ${CODE}: −$2`, 'coupon applied by the server');
  await A.click('🧾 Tax-deductible');
  await A.click('Buy for $18');
  await A.expect('It’s in your library', 'purchase completed (demo payments)', 20000);
  await A.click('Later', { exact: true });
  await A.expect('✓ In your library (demo purchase)');
  const stA = await A.store();
  const bought = stA.purchases?.find((p) => p.listingId === pondId);
  log(bought?.status === 'paid' && bought.price === 18 && bought.listPrice === 20 && bought.fundingSource === 'tax' && bought.demo === true, 'purchase recorded at the server’s price');
  const exp = stA.expenses?.filter((e) => e.description === POND) ?? [];
  log(exp.length === 1 && exp[0].amount === 18 && exp[0].fundingSource === 'tax' && exp[0].category === 'curriculum', 'one expense, tagged tax-deductible');
  await A.goto('/market?view=library');
  await A.expect('tax-deductible · in your expenses', 'library says it’s in expenses');
  await A.expect('saved $2', 'library shows the saving');
  await A.goto('/records/expenses');
  await A.expect(POND, 'expense tracker lists the purchase');
  // Reloading (which refreshes purchases from the server) doesn't add it twice.
  await A.goto('/market?view=library');
  await sleep(1500);
  log(((await A.store()).expenses ?? []).filter((e) => e.description === POND).length === 1, 'no duplicate expense after refreshing');

  scenario('Verified review');
  await A.goto(`/listing/${pondId}`);
  await A.click('Write a review');
  await A.clickLabel('4 stars');
  await A.fillLabel('Your review', `Tadpoles all over the kitchen, in the best way ${run}.`);
  await A.click('Post review', { exact: true });
  await A.expect('Verified purchase', 'server marked the review verified', 15000);
  await A.expect('4.0 · 1 review');

  // ───────────────────────────── A second family
  scenario('Another family: votes, a used-up coupon, a report');
  const B = await familyWithAccount('friend', EMAIL_B);
  await B.goto(`/listing/${pondId}`);
  await B.expect(`Tadpoles all over the kitchen, in the best way ${run}.`, 'sees the other family’s review');
  await B.expect('✓ Verified purchase');
  await B.click('👍 Helpful');
  await B.expect('👍 Helpful (1) ✓', 'helpful vote counted by the server');
  await B.click('Report', { exact: true });
  await B.click('📣 Spam or a scam');
  await B.click('Send report');
  await B.expect('Thanks, we got it.', 'review reported');
  await B.click('Done', { exact: true });
  await B.click('Buy', { exact: true });
  await B.fill('Coupon code', CODE);
  await B.click('Apply', { exact: true });
  await B.expect('has been used up', 'a one-use coupon can’t be used again');
  await B.click('Cancel', { exact: true });
  log(!(await B.store()).purchases?.some((p) => p.listingId === pondId), 'nothing bought');

  // ───────────────────────────── Gift
  scenario('Paid gift to another family');
  await A.goto(`/listing/${birdsId}`);
  await A.expect('50% off until', 'sale on the listing');
  await A.click('🎁 Give as a gift');
  await A.fill('their@email.com', EMAIL_B);
  await A.fill('Happy homeschooling!', `For your bird lovers ${run}`);
  await A.click('Buy the gift for $5');
  await A.expect('Your gift is ready', 'gift bought', 20000);
  await A.expect('You paid $5 (demo — no card charged)');
  await A.click('Done', { exact: true });
  const stA2 = await A.store();
  log(!stA2.purchases?.some((p) => p.listingId === birdsId), 'the giver doesn’t get a copy');
  log(stA2.expenses?.some((e) => e.description.startsWith(`Gift: ${BIRDS}`) && e.amount === 5 && e.fundingSource === 'out_of_pocket'), 'gift is an out-of-pocket expense for the giver');
  await A.goto('/market?view=library');
  await A.expect('Gifts you sent');
  await A.expect('Not claimed yet');
  log(!(await A.has('Take back')), 'paid gifts can’t be taken back');
  await B.goto('/market?view=library');
  await B.expect('Waiting for you', 'gift waits for the recipient', 15000);
  await B.expect(`“For your bird lovers ${run}”`);
  const expensesBefore = ((await B.store()).expenses ?? []).length;
  await B.click('Claim it');
  await B.expect('is in your library, a gift from', 'gift claimed');
  const giftP = (await B.store()).purchases?.find((p) => p.listingId === birdsId);
  log(!!giftP?.giftFrom && giftP.price === 0 && giftP.status === 'free', 'recipient’s copy is a free gift');
  log(((await B.store()).expenses ?? []).length === expensesBefore, 'no expense for the recipient');
  await A.goto('/market?view=library');
  await A.expect('✓ Claimed', 'giver sees it claimed', 15000);

  // ───────────────────────────── Bundle
  scenario('Bundle skips what you have');
  await B.goto(`/bundle/${bundleId}`);
  await B.expect(`Pond and birds ${run}`);
  await B.expect('you already have 1', 'bundle knows about the gift');
  await B.click('Buy the bundle');
  await B.expect('You already have 1 of these');
  await B.expect('Buy for $20', 'charges only for Pond Life');
  await B.click('Buy for $20');
  await B.expect('1 curriculum is in your library', 'bundle bought', 20000);
  const stB = await B.store();
  const pondB = stB.purchases?.find((p) => p.listingId === pondId);
  log(pondB?.bundleId === bundleId && pondB.price === 20 && stB.purchases.filter((p) => p.listingId === birdsId).length === 1, 'only the missing curriculum was bought, as part of the bundle');
  log(stB.expenses?.some((e) => e.description === POND && e.amount === 20), 'bundle purchase in the expense tracker');
  await B.goto(`/bundle/${bundleId}`);
  await B.expect('✓ You have everything in this bundle');
  log(await B.fits(), 'friend: bundle page fits the screen');
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
}

// Refused coupons and used-up codes come back from the server as 400s, on purpose.
const relevant = errors.filter((e) => !/DevTools|Download the React|ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR|status of 400/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all live marketplace scenarios passed'} (${W}px) · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
