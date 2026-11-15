// Co-op classes, gifts, and creator promotions on the web build (local-only
// server): a creator puts a curriculum on sale, makes a bundle and a coupon;
// a family sends and redeems a gift; a teacher runs a co-op class that the
// family joins, reports progress to, and takes an update from.
// Run with `npm run web:local`, then `BASE_URL=http://localhost:8082 node e2e/coop_gifts.mjs`.

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
const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
  await sleep(900);
};
const lesson = (id, title) => ({ id, title, steps: ['Read', 'Talk about it'], links: [], questions: [] });
const pkg = (id, title, price, lessons) => ({
  id, title, description: `${title}: a hands-on plan for young naturalists.`, subjects: ['science'], gradeMin: 1, gradeMax: 5, philosophies: [], parentInvolvement: 'medium',
  familyStyle: false, minutesPerLesson: 30, lessonsPerWeek: 2, format: 'digital', cover: '🐸', color: '#2F6B5E', price,
  units: [{ id: `${id}-u1`, title: 'Unit 1', lessons }], origin: { kind: 'original' }, license: { kind: 'all_rights_reserved' }, status: 'draft', version: 0,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

async function run() {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await go('/');
  await click('Explore with a demo family');
  await expect('Family Flight Deck');
  // A creator profile and two Studio curricula on the same device.
  await page.evaluate((pkgs) => {
    localStorage.setItem('freerange-studio', JSON.stringify({ state: { active: false, profile: { name: 'Pond Teacher', bio: '', createdAt: new Date().toISOString() }, packages: pkgs, bundles: [], coupons: [], classes: [] }, version: 0 }));
  }, [pkg('pk-pond', 'Pond Life', 20, [lesson('p1', 'Frog eggs'), lesson('p2', 'Tadpoles'), lesson('p3', 'Frogs')]), pkg('pk-birds', 'Bird Math', 10, [lesson('b1', 'Counting birds'), lesson('b2', 'Bird graphs')])]);

  scenario('Publish two curricula');
  for (const [id, price] of [['pk-pond', '20'], ['pk-birds', '10']]) {
    await go(`/studio/${id}?tab=publish`);
    await fillLabel('Price ($, 0 = free)', price);
    await click('Publish to the Marketplace');
    await sleep(500);
  }
  const listed = (await store()).myListings ?? [];
  log(listed.length === 2 && listed.some((l) => l.title === 'Pond Life' && l.price === 20), 'both are listed');
  const pondId = listed.find((l) => l.title === 'Pond Life')?.id;
  const birdsId = listed.find((l) => l.title === 'Bird Math')?.id;

  scenario('Sale');
  await go('/studio');
  await click('Sales, bundles & coupons');
  await expect('Take 5–90% off');
  // Bird Math's card comes first (newest listing first).
  await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].find((e) => e.offsetParent && e.innerText.trim() === 'Put on sale')?.click());
  await expect('Sale: Bird Math');
  await sleep(500);
  await fillLabel('Percent off', '25');
  await expect('Families pay $7.50 instead of $10', 'previews the sale price');
  await click('Start the sale');
  await sleep(500);
  const onSale = (await store()).myListings.find((l) => l.id === birdsId);
  log(onSale?.salePercent === 25 && !!onSale.saleEndsAt, 'sale saved on the listing');
  await expect('Save 25%', 'Studio shows the saving');

  scenario('Bundle');
  await click('New bundle');
  await fillLabel('Bundle name', 'Pond and birds year');
  await click('🐸 Pond Life · $20');
  await click('🐸 Bird Math · $10');
  await fill('49.99', '30');
  await expect('a price under $30', 'bundle must cost less than buying separately');
  await fill('49.99', '24');
  await click('Save bundle');
  await sleep(600);
  const bundles = (await studio()).bundles ?? [];
  log(bundles.length === 1 && bundles[0].price === 24 && bundles[0].listingIds.length === 2, 'bundle saved');

  scenario('Coupon');
  await click('New coupon');
  await fill('SPRING25', 'spring10');
  await fillLabel('Percent off', '10');
  await click('Create coupon');
  await sleep(500);
  await expect('SPRING10', 'coupon listed in upper case');
  await expect('10% off · Everything in your shop', 'storewide coupon');

  log((await studio()).coupons?.[0]?.code === 'SPRING10', 'coupon saved');
  await shot('cg-promotions');

  scenario('Marketplace shows the deals');
  await go('/market');
  await click('All grades');
  await expect('🎁 Bundles', 'bundle section');
  await expect('Pond and birds year');
  await expect('Save 20%', 'bundle saving (24 instead of 30)');
  await shot('cg-market-bundles');
  await expect('$7.50', 'sale price in the catalog');
  await go(`/listing/${birdsId}`);
  await expect('25% off until', 'sale on the listing page');
  await expect('In the bundle “Pond and birds year”', 'listing links to its bundle');
  await click('In the bundle');
  await expect('$30 if bought separately');
  await expect('This is your bundle.', 'creators can’t buy their own bundle');

  scenario('Send a free curriculum as a gift');
  await go('/listing/l-lib-rays-primary-arithmetic');
  await click('🎁 Send to a friend');
  await expect('Who’s it for?');
  log(await isDisabled('Send the gift'), 'needs a recipient');
  await fill('their@email.com', 'grandma@example.com');
  await fill('Happy homeschooling!', 'For the twins!');
  await click('Send the gift');
  await expect('Your gift is ready', 'gift created');
  await expect('Their one-time gift code');
  await shot('cg-gift-ready');
  const gift = (await store()).localGifts?.[0];
  log(gift?.status === 'ready' && gift.code?.length === 10 && gift.recipientLabel === 'grandma@example.com' && gift.note === 'For the twins!', 'gift recorded with a code and note');
  await click('Done');
  await go('/market?view=library');
  await expect('Gifts you sent');
  await expect('Not claimed yet', 'giver sees the status');
  await expect('For grandma@example.com');

  scenario('Redeem the gift code');
  await fill('Gift code', `${gift.code.slice(0, 5).toLowerCase()}-${gift.code.slice(5)}`);
  await click('Redeem');
  await expect('is in your library, a gift from', 'claimed');
  const got = (await store()).purchases.find((p) => p.listingId === 'l-lib-rays-primary-arithmetic');
  log(!!got?.giftFrom && got.price === 0, 'purchase marked as a gift');
  await expect('✓ Claimed', 'status updates to claimed');
  await go(`/gift/${gift.code}`);
  await expect('already been claimed', 'a code works once');

  scenario('Start a co-op class');
  await go('/studio/classes');
  await expect('No classes yet');
  await click('🐸 Pond Life', { exact: true });
  await fillLabel('Room for how many families? (up to 30)', '12');
  await click('Start the class');
  await expect('Invite code', 'class page');
  await expect('No families yet');
  let cls = (await studio()).classes?.[0];
  log(cls?.maxFamilies === 12 && cls.code?.length === 8 && cls.releases?.length === 1, 'class saved with a code and version 1');

  scenario('Family joins with the code');
  await go('/learn');
  await click('＋  Add', { exact: true });
  await click('Join a co-op class');
  await fill('ABCD2345', cls.code.toLowerCase());
  await click('Find the class');
  await expect('Pond Teacher', 'class preview');
  await expect('Show my kids’ first names to the teacher');
  await shot('cg-join-class');
  await click('Join the class');
  await expect('You’re in Pond Teacher’s class', 'plan sheet after joining');
  await click('Add to plan', { exact: true });
  await expect('Added to your plan ✓');
  let cur = (await store()).curricula.find((k) => k.coopClassId === cls.id);
  log(cur?.totalLessons === 3 && cur.outline?.[0]?.lessons.length === 3 && cur.packageVersion === 1 && !cur.listingId, 'curriculum has the class plan');

  scenario('Progress reaches the teacher (no names)');
  await page.evaluate((cid) => {
    const s = JSON.parse(localStorage.getItem('freerange-v1'));
    const c = s.state.curricula.find((k) => k.coopClassId === cid);
    c.progress = { ...c.progress, [c.childIds[0]]: 1 };
    localStorage.setItem('freerange-v1', JSON.stringify(s));
  }, cls.id);
  await go('/learn');
  await expect('Co-op class with Pond Teacher');
  await sleep(2500);
  cls = (await studio()).classes[0];
  const member = cls.members[0];
  log(member?.progress?.[0]?.done === 1 && !member.progress[0].name, `progress reported without names (${JSON.stringify(member?.progress)})`);
  await click('Show the teacher first names');
  await sleep(2500);
  cls = (await studio()).classes[0];
  log(!!cls.members[0].progress[0].name, 'names shared after opting in');

  scenario('Teacher sends an update');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('freerange-studio'));
    const p = s.state.packages.find((x) => x.id === 'pk-pond');
    p.units[0].lessons.push({ id: 'p4', title: 'Pond plants', steps: ['Look closely'], links: [], questions: [] });
    p.updatedAt = new Date().toISOString();
    localStorage.setItem('freerange-studio', JSON.stringify(s));
  });
  await go(`/studio/class/${cls.id}`);
  await expect('Roster');
  await expect('1 / 3 lessons', 'roster shows lessons done');
  await shot('cg-class-roster');
  await expect('You’ve changed “Pond Life” since version 1');
  await fill('Added two lessons on frogs', 'A lesson on pond plants');
  await click('Send version 2 to the class');
  await sleep(600);
  cls = (await studio()).classes[0];
  log(cls.version === 2 && cls.releases.length === 2 && cls.releases[1].note === 'A lesson on pond plants', 'version 2 sent');
  await go('/learn');
  await expect('Update available: version 2', 'family sees the update');
  await click('Review update');
  await expect('A lesson on pond plants', 'teacher’s note');
  await expect('3 → 4 lessons');
  await click('Update my plan');
  await sleep(500);
  cur = (await store()).curricula.find((k) => k.coopClassId === cls.id);
  log(cur.totalLessons === 4 && cur.packageVersion === 2 && cur.progress[cur.childIds[0]] === 1, 'plan updated, kid keeps their place');

  scenario('Teacher removes the family');
  await go(`/studio/class/${cls.id}`);
  await click('Remove', { exact: true });
  await click('Remove', { exact: true });
  await sleep(500);
  await expect('No families yet', 'roster empty after removing');
  await go('/learn');
  await sleep(2500);
  await expect('class has ended (or you were removed)', 'family sees the class ended');
  log((await store()).curricula.find((k) => k.coopClassId === cls.id)?.coopEnded === true, 'curriculum marked as ended');
}

try {
  await run();
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
  await shot('coop-gifts-failure').catch(() => {});
}
const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all co-op, gift, and promotion scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
