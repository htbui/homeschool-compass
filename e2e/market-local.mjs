// Marketplace journeys on one device with no account (local-only build): browsing
// the free & open curricula (search, subject chips, filters, sorting, empty
// state), a listing page (license, credit, outline), claiming a curriculum,
// reviewing it (stars, star filter, edit, delete), selling a used curriculum
// (form limits, edit, remove, the "used" filter), and gifts (take back, bad codes).
// Run with `EXPO_PUBLIC_FREERANGE_LOCAL_ONLY=1 npx expo start --web --port 8093`, then
// `BASE_URL=http://localhost:8093 node e2e/market-local.mjs` (and again with W=390 H=844).

import { mkdirSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8082';
const W = Number(process.env.W ?? 1280);
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 300000).unref();
const page = await browser.newPage();
await page.setViewport({ width: W, height: Number(process.env.H ?? 900) });
page.setDefaultTimeout(15000);
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
/** Screens load their code on demand, so checks wait (up to 8s) for the text. */
const waitHas = async (t, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await has(t)) return true;
  return has(t);
};
const waitGone = async (t, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (!(await has(t))) return true;
  return !(await has(t));
};
const expect = async (t, label = `shows "${t}"`) => log(await waitHas(t), label);
const expectNot = async (t, label = `hides "${t}"`) => log(await waitGone(t, 3000), label);

/** Click the last visible clickable whose text matches (dialogs render last, so they win). */
async function click(text, { exact = false } = {}) {
  let ok = false;
  for (const end = Date.now() + 8000; !ok && Date.now() < end; ) {
    ok = await page.evaluate((t, exact) => {
      const els = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse();
      const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)));
      el?.click();
      return !!el;
    }, text, exact);
    if (!ok) await sleep(200);
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
/** Fill the nth visible input/textarea with this placeholder. */
async function fill(placeholder, text, nth = 0) {
  let tag = null;
  for (const end = Date.now() + 8000; !tag && Date.now() < end; await sleep(tag ? 0 : 200)) tag = await page.evaluate((ph, nth) => {
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
    let n = labels.at(-1);
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
  await sleep(400);
}
const shot = (name) => page.screenshot({ path: `${OUT}${name}-${W}.png` });
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-v1') ?? '{}').state ?? {});
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
  await sleep(600);
};
/** "N curricula" heading in Browse. */
const resultCount = async () => {
  await waitHas(' curricul');
  const m = (await bodyText()).match(/\n(\d+) curricul(?:a|um)\n/);
  return m ? Number(m[1]) : -1;
};
/** Wait until the page has no horizontal scroll (phone layouts must fit). */
const fitsWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const AESOP = 'l-lib-aesop-for-children';
const run_ = Date.now().toString(36);

async function run() {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await go('/');
  await click('Explore with a demo family');
  await expect('Family Flight Deck');

  // ───────────────────────────── Browse
  scenario('Browse the free & open curricula');
  await go('/market');
  await expect('Free & open curricula: classics and openly licensed', 'local catalog banner');
  const mine = await resultCount();
  await click('All grades', { exact: true });
  const all = await resultCount();
  log(all >= 40, `all grades shows the whole Library (${all})`);
  log(mine > 0 && mine < all, `"My kids' grades" narrows it (${mine} of ${all})`);
  log(await fitsWidth(), 'no sideways scrolling');
  await fill('Search curricula, publishers, subjects…', `zz-nothing-${run_}`);
  await expect('Nothing matches those filters', 'empty state for a search with no results');
  await click('Clear filters');
  log((await resultCount()) === all, 'clear filters brings everything back');
  await fill('Search curricula, publishers, subjects…', '  MCGUFFEY   reader ');
  await expect('McGuffey', 'search ignores case and spacing');
  const mcg = await resultCount();
  log(mcg >= 6 && mcg < all, `search narrows to the McGuffey readers (${mcg})`);
  await fill('Search curricula, publishers, subjects…', '');
  await click('🔬 Science', { exact: true });
  const sci = await resultCount();
  await expectNot('McGuffey’s First Eclectic Reader', 'subject chip hides other subjects');
  log(sci > 0 && sci < all, `science chip (${sci})`);
  await click('All subjects', { exact: true });
  log((await resultCount()) === all, 'all subjects again');

  scenario('Filters and sorting');
  await click('⚙️ Filters');
  await click('Used, from families');
  await expect('Show 0', 'no used books without an account');
  await click('Show 0');
  await expect('⚙️ Filters (1)', 'filter count on the chip');
  await expect('Nothing matches those filters');
  await click('⚙️ Filters (1)');
  await click('Clear all');
  await click('🏛️ ESA-approved vendors only');
  await expect('Show 0', 'the free curricula aren’t ESA vendors');
  await click('🏛️ ESA-approved vendors only');
  await click('Free', { exact: true });
  await expect(`Show ${all}`, 'everything in the Library is free');
  await click('4.5★ & up');
  await expect('Show 0', 'no reviews yet, so nothing is 4.5★');
  await click('Clear all');
  await click(`Show ${all}`);
  await click('All grades', { exact: true });
  log((await resultCount()) === all, 'clear all resets the filters');
  await click('Price: high to low');
  await expect('Price: high to low');
  await click('Most reviewed');
  await click('Best match');
  await expect('Ranked for your family', 'best match explains its ranking');
  await shot('market-browse');

  // ───────────────────────────── Listing page
  scenario('Listing page');
  await go(`/listing/${AESOP}`);
  await expect('The Aesop for Children');
  await expect('by Aesop', 'listed under the original author');
  await expect('free & open');
  await expect('📜 License: Public domain', 'license card');
  await expect('in the public domain', 'credit line');
  await expect('https://www.gutenberg.org/ebooks/19994', 'credit links the source');
  await expect('not affiliated with or endorsed by its author', 'says Freerange organized it');
  await expect('No reviews yet');
  await expect('What\'s inside');
  await expect('Show all 7 units', 'outline starts collapsed');
  log(!(await has('Unit 7:')), 'later units hidden at first');
  await click('Show all 7 units');
  await expect('Unit 7:', 'outline expands');
  await click('Show less');
  log(await waitGone('Unit 7:'), 'outline collapses again');
  log(!(await has('More from')), 'no storefront for free & open curricula');
  await click('🚩 Report this listing');
  await expect('Reports go to the Freerange moderators, so they only work in the connected app', 'reports need the connected app');
  log(!/sign in/i.test(await bodyText()), 'local build never says “Sign in” about reports');
  await click('OK', { exact: true });
  log(await fitsWidth(), 'listing page fits the screen');
  await shot('market-listing');
  await go('/listing/l-does-not-exist');
  await expect('That listing isn\'t available', 'unknown listing');
  await click('Back to the marketplace');
  await expect('Marketplace');

  // ───────────────────────────── Claim
  scenario('Claim a free curriculum');
  await go(`/listing/${AESOP}`);
  const before = await store();
  await click('Get it free', { exact: true });
  await expect('Get this curriculum', 'free checkout sheet');
  log(!(await has('Coupon code')) && !(await has('How are you paying for it?')), 'no coupon or payment for free curricula');
  await click('Get it free', { exact: true });
  await expect('It’s in your library', 'claimed');
  await click('Later', { exact: true });
  await expect('✓ In your library', 'listing shows it’s owned');
  let st = await store();
  const claimed = st.purchases?.find((p) => p.listingId === AESOP);
  log(claimed?.status === 'free' && claimed.price === 0, 'purchase recorded as free');
  log((st.expenses?.length ?? 0) === (before.expenses?.length ?? 0), 'free curricula don’t add an expense');
  await go('/market?view=library');
  await expect('The Aesop for Children');
  await expect('Free', 'library shows it as free');

  // ───────────────────────────── Reviews
  scenario('Review it');
  await go(`/listing/${AESOP}`);
  await click('Write a review');
  log(await isDisabled('Post review'), 'needs stars and words');
  await clickLabel('3 stars');
  await fill("What worked, what didn't, and who it's best for.", 'Short');
  log(await isDisabled('Post review'), 'needs 10+ characters');
  await expect('a few words about your experience', 'says what’s missing');
  await fill("What worked, what didn't, and who it's best for.", `Fables the kids retold at dinner ${run_}.`);
  await expect('Shown as a verified purchase', 'verified because it was claimed');
  await click('Post review', { exact: true });
  await expect('3.0 · 1 review', 'rating summary');
  await expect('Verified purchase');
  log(!(await has('👍 Helpful')), 'no helpful button on your own review');
  await click('5★ (0)');
  await expectNot(`Fables the kids retold at dinner ${run_}`, 'star filter hides other ratings');
  await click('3★ (1)');
  await expect(`Fables the kids retold at dinner ${run_}`, 'star filter shows matching ones');
  await click('All stars');
  for (const s of ['Newest', 'Highest', 'Lowest', 'Most progress', 'Most helpful']) await click(s, { exact: true });
  await expect(`Fables the kids retold at dinner ${run_}`, 'every sort keeps the review');
  await click('Edit yours');
  await clickLabel('5 stars');
  await click('Save review', { exact: true });
  await expect('5.0 · 1 review', 'edit updates the rating');
  st = await store();
  log(st.myReviews?.length === 1 && st.myReviews[0].rating === 5, 'one review, edited in place');
  await click('Delete', { exact: true });
  await click('Delete', { exact: true });
  await expect('No reviews yet', 'review deleted');
  log(((await store()).myReviews ?? []).length === 0, 'review gone from the device');

  // ───────────────────────────── Sell
  scenario('Sell a used curriculum');
  await go('/market?view=selling');
  await expect('Nothing listed yet');
  await click('List a curriculum', { exact: true });
  log(await isDisabled('Publish listing'), 'empty form can’t be published');
  const title = `Math-U-See Beta set ${run_}`;
  await fill('Math level 3 teacher guide + workbook', title);
  await click('🧮 Math');
  await fillLabel('Price ($, 0 = free)', '25');
  await fill('120', '2500');
  await fill("Condition details, what's included, pickup or shipping.", 'Teacher guide and DVD, lightly used.');
  await expect('at most 2,000 lessons', 'lesson count limit');
  log(await isDisabled('Publish listing'), 'too many lessons can’t be published');
  await fill('120', '30');
  await fillLabel('Minutes each', '500');
  await expect('at most 480 minutes per lesson', 'minutes limit');
  await fillLabel('Minutes each', '45');
  await fillLabel('Price ($, 0 = free)', '20000');
  await expect('a price of $10,000 or less', 'price limit');
  await fillLabel('Price ($, 0 = free)', '25');
  await click('Like new');
  await click('Publish listing');
  await expect(title, 'listing published');
  st = await store();
  const listed = st.myListings?.find((l) => l.title === title);
  log(listed?.sellerKind === 'family' && listed.price === 25 && listed.lessons === 30 && listed.minutesPerLesson === 45 && listed.condition === 'like_new' && listed.seller === 'Dana M.', 'saved with first name and last initial only');
  await click('Edit', { exact: true });
  await expect('Edit listing');
  await fillLabel('Price ($, 0 = free)', '15');
  await click('Save listing');
  await expect('$15', 'price edited');
  log((await store()).myListings.find((l) => l.title === title)?.price === 15, 'edit saved');
  // It shows up for "used" browsing, and it's not buyable by its seller.
  await go('/market?used=1');
  await expect(title, '"used" view shows the family listing');
  await go(`/listing/${listed.id}`);
  await expect('This is your listing.');
  await expect('Used · Like new');
  log(!(await has('Write a review')) && !(await has('Get it free')), 'can’t buy or review your own listing');
  log(!(await has('Give as a gift')) && !(await has('Send to a friend')), 'no gifting family listings');
  await go('/market?view=selling');
  await click('Remove', { exact: true });
  await click('Remove', { exact: true });
  await expect('Nothing listed yet', 'listing removed');
  await go('/market?used=1');
  await expectNot(title, 'removed listing gone from browsing');

  // ───────────────────────────── Gifts
  scenario('Gifts');
  await go('/listing/l-lib-viking-tales');
  await click('🎁 Send to a friend');
  await fill('their@email.com', 'not-an-email');
  log(await isDisabled('Send the gift'), 'needs a real email address');
  await fill('their@email.com', `grandpa-${run_}@example.com`);
  await click('Send the gift');
  await expect('Your gift is ready');
  const gift = (await store()).localGifts?.[0];
  await click('Done');
  await go('/market?view=library');
  await expect('Gifts you sent');
  await expect(`For grandpa-${run_}@example.com`);
  await click('Take back');
  await click('Take back', { exact: true });
  await expect('Taken back', 'gift taken back');
  log((await store()).localGifts?.[0]?.status === 'cancelled', 'gift cancelled on the device');
  await fill('Gift code', gift.code);
  await click('Redeem');
  await expect('That gift code isn’t valid', 'a taken-back code stops working');
  await fill('Gift code', 'ABC');
  log(await isDisabled('Redeem'), 'too-short code can’t be redeemed');
  await go('/gift/ZZZZZ-ZZZZZ');
  await expect('That gift code isn\'t valid', 'unknown gift link');
  log(!(await store()).purchases.some((p) => p.listingId === 'l-lib-viking-tales'), 'nothing added from a dead code');
  await shot('market-gifts');
}

try {
  await run();
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
  await shot('market-local-failure').catch(() => {});
}
const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all local marketplace scenarios passed'} (${W}px) · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
