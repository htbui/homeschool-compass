// Studio & Community UX review (findings SC-xx), signed in on the local Supabase stack:
// Gutenberg/archive.org import wording (fetch-page answered from fixtures), publishing
// through the server with no empty update, the live family finder (report, block,
// decline and block, member since, no duplicates, count, Verified card first), the
// blocked-families list, messages (⋯ menu, long-press report, blocked banner),
// notifications grouping, and the moderation access check.
// Needs `npm run db:start` and the cloud web build:
//   BASE_URL=http://localhost:8081 node e2e/ux-studio_community-cloud.mjs   (W=390 H=844 for phone size)
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 900);
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PASSWORD = 'freerange-test-1';
const fixture = (name) => readFileSync(new URL(`../src/lib/__tests__/fixtures/${name}`, import.meta.url), 'utf8');

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
});
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 600000).unref();

let failures = 0;
let section = '';
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
const scenario = (name) => { section = name; console.log(`\n— ${name} (${W}×${H})`); };


const PAGES = new Map();
const page = (url, html, finalUrl = url) => PAGES.set(url, { status: 200, body: { url: finalUrl, html } });
page('https://www.gutenberg.org/cache/epub/2290/pg2290-images.html', fixture('gutenberg-book.html'));
page('https://archive.org/metadata/nosuchscan000', '{}');
const asked = [];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

/** Where the thing labelled `label` sits, and how big it is. */
const box = (d, label) =>
  d.page.evaluate((l) => {
    const el = [...document.querySelectorAll(`[aria-label="${l}"]`)].reverse().find((e) => e.offsetParent);
    const r = el?.getBoundingClientRect();
    return r ? { w: r.width, h: r.height } : null;
  }, label);
const at = async (d, t) => (await d.page.evaluate(() => document.body.innerText)).indexOf(t);

async function device(name, { fakeFetch = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: W, height: H });
  p.setDefaultTimeout(15000);
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d|Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`${name}: PAGEERROR ${e.message}`));
  if (fakeFetch) {
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (!r.url().includes('/functions/v1/fetch-page')) return r.continue();
      if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: CORS });
      const url = JSON.parse(r.postData() ?? '{}').url;
      asked.push(url);
      const hit = PAGES.get(url) ?? { status: 502, body: { error: 'Couldn’t load that page.' } };
      return r.respond({ status: hit.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(hit.body) });
    });
  }
  const text = () => p.evaluate(() => document.body.innerText);
  const d = {
    page: p,
    async has(t) { return (await text()).includes(t); },
    async waitFor(t, ms = 12000) {
      for (const end = Date.now() + ms; Date.now() < end; await sleep(300)) if (await d.has(t)) return true;
      return d.has(t);
    },
    async expect(t, label = `shows "${t}"`, ms) { log(await d.waitFor(t, ms), `${name}: ${label}`); },
    async expectNot(t, label = `hides "${t}"`) { log(!(await d.has(t)), `${name}: ${label}`); },
    async click(t, { exact = false } = {}) {
      let ok = false;
      for (const end = Date.now() + 8000; !ok && Date.now() < end; ) {
        ok = await p.evaluate((t, exact) => {
          const el = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse().find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)));
          el?.click();
          return !!el;
        }, t, exact);
        if (!ok) await sleep(300);
      }
      if (!ok) throw new Error(`[${section}] ${name}: nothing clickable with text "${t}"`);
      await sleep(500);
    },
    /** The finder shows 10 families at a time: tap "Show more" until this text is on screen. */
    async reveal(t) {
      for (let i = 0; i < 12 && !(await d.has(t)); i++) {
        const more = await p.evaluate(() => {
          const b = [...document.querySelectorAll('[role="button"]')].reverse().find((e) => e.offsetParent && e.innerText.trim().startsWith('Show more ('));
          b?.click();
          return !!b;
        });
        if (!more) break;
        await sleep(400);
      }
    },
    /** Click a button inside the smallest card containing `cardText`. */
    async clickIn(cardText, buttonText) {
      await d.reveal(cardText);
      let ok = false;
      for (const end = Date.now() + 8000; !ok && Date.now() < end; ) {
        ok = await p.evaluate((cardText, buttonText) => {
          const cards = [...document.querySelectorAll('div')].filter((x) => x.offsetParent && x.innerText?.includes(cardText) && x.innerText.includes(buttonText));
          const card = cards.sort((a, b) => a.innerText.length - b.innerText.length)[0];
          const btn = card && [...card.querySelectorAll('[role="button"],[tabindex]')].find((b) => b.innerText.includes(buttonText));
          btn?.click();
          return !!btn;
        }, cardText, buttonText);
        if (!ok) await sleep(300);
      }
      if (!ok) throw new Error(`[${section}] ${name}: no "${buttonText}" in card "${cardText}"`);
      await sleep(600);
    },
    async disabledIn(cardText, buttonText) {
      return p.evaluate((cardText, buttonText) => {
        const cards = [...document.querySelectorAll('div')].filter((x) => x.offsetParent && x.innerText?.includes(cardText) && x.innerText.includes(buttonText));
        const card = cards.sort((a, b) => a.innerText.length - b.innerText.length)[0];
        const btn = card && [...card.querySelectorAll('[role="button"],[tabindex]')].find((b) => b.innerText.trim() === buttonText);
        return btn ? btn.getAttribute('aria-disabled') === 'true' : null;
      }, cardText, buttonText);
    },
    async clickLabel(label) {
      const ok = await p.waitForFunction((l) => {
        const el = [...document.querySelectorAll(`[aria-label="${l}"]`)].reverse().find((e) => e.offsetParent !== null);
        el?.click();
        return !!el;
      }, { timeout: 8000, polling: 200 }, label).then(() => true, () => false);
      if (!ok) throw new Error(`[${section}] ${name}: nothing labelled "${label}"`);
      await sleep(500);
    },
    async isDisabled(t) {
      return p.evaluate((t) => {
        const el = [...document.querySelectorAll('[role="button"],button')].reverse().find((e) => e.offsetParent && e.innerText.trim() === t);
        return el ? el.getAttribute('aria-disabled') === 'true' : null;
      }, t);
    },
    /** Set an input (found by its label) to exactly this text. */
    async fillLabel(label, value) {
      let ok = false;
      for (const end = Date.now() + 8000; !ok && Date.now() < end; ) {
        ok = await p.evaluate((label, value) => {
          const l = [...document.querySelectorAll('div,span')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === label).at(-1);
          let n = l;
          for (let i = 0; i < 4 && n; i++) {
            const input = n.parentElement?.querySelector('input,textarea');
            if (input) {
              const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
              input.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
            n = n.parentElement;
          }
          return false;
        }, label, value);
        if (!ok) await sleep(300);
      }
      if (!ok) throw new Error(`[${section}] ${name}: no input for "${label}"`);
      await sleep(250);
    },
    async type(selector, value) {
      await p.waitForSelector(selector);
      await p.type(selector, value);
      await sleep(200);
    },
    store: () => p.evaluate(() => JSON.parse(localStorage.getItem('freerange-v1') ?? '{}').state ?? {}),
    studio: () => p.evaluate(() => JSON.parse(localStorage.getItem('freerange-studio') ?? '{}').state ?? {}),
    async goto(path) { await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' }); await sleep(800); },
  };
  return d;
}

async function signUp(d, email) {
  await d.goto('/account');
  await d.click('Create account', { exact: true });
  await d.fillLabel('Email', email);
  await d.fillLabel('Password', PASSWORD);
  await d.click('Create account', { exact: true });
}

/** Load a course address in Studio's web import. */
async function load(S, url) {
  await S.goto('/studio/import?from=web');
  await S.fillLabel('Course page', url);
  await S.click('Load page');
}

try {
  // ───────────────────────────── Creator: web import wording and publishing
  scenario('Creator');
  const S = await device('creator', { fakeFetch: true });
  await signUp(S, `uxsc-creator-${run}@example.test`);
  await S.expect('No family on this account yet', 'creator account without a family', 20000);
  await S.goto('/studio');
  await S.fillLabel('Creator or shop name', `Comet Studio ${run}`);
  await S.click('Open my Studio');
  await S.expect(`Comet Studio ${run}`);

  scenario('SC-12 Gutenberg and archive.org');
  await load(S, 'https://www.gutenberg.org/ebooks/2290');
  await S.expect('📖 ', 'SC-12 a Gutenberg book gets the book icon');
  await S.expect('License found: Public domain. Your plan keeps this license.', 'SC-12 the license is named once');
  await S.expectNot('Public domain — Public domain', 'SC-12 no repeated license name');
  log(!(await S.has('🌐 ')), 'creator: SC-12 no web-page icon for a book');
  await load(S, 'https://archive.org/details/nosuchscan000');
  await S.expect('We couldn’t find details for this scan', 'SC-12 an empty scan record is explained');
  const focused = await S.page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  log(focused === 'Book or course name', `creator: SC-12 the name field is ready to type in (${focused})`);

  scenario('SC-04 publishing through the server');
  await S.goto('/studio/import');
  await S.fillLabel('Curriculum title', `Comet Counting ${run}`);
  await S.fillLabel('Units', '1');
  await S.fillLabel('Lessons per unit', '2');
  await S.click('Create', { exact: true });
  await S.expect('saved automatically');
  await S.fillLabel('Description', 'Counting comets, meteors and the stars between them.');
  await S.click('🧮 Math');
  await S.click('🚀 Publish');
  await sleep(1800); // the draft saves to the account before publishing
  await S.click('Publish to the Marketplace');
  await S.expect(`Comet Counting ${run} v1 is live in the Marketplace`, 'SC-04 the server publish is confirmed', 15000);
  log((await S.isDisabled('Publish update (v2)')) === true, 'creator: SC-04 no empty v2 right after publishing');
  await S.expect('No changes since v1', 'SC-04 says why');
  await S.expectNot('What’s new in this update', 'SC-04 no release note without changes');
  await S.page.reload({ waitUntil: 'networkidle0' });
  await sleep(2500);
  await S.click('🚀 Publish');
  log((await S.isDisabled('Publish update (v2)')) === true, 'creator: SC-04 still nothing to publish after reloading from the account');
  await S.expectNot('changes that aren’t published', 'SC-04 not flagged as changed');

  // ───────────────────────────── Three families
  scenario('Families');
  const A = await device('ana');
  const B = await device('ben');
  const C = await device('cara');
  for (const [d, nm] of [[A, 'Ana'], [B, 'Ben'], [C, 'Cara']]) {
    await d.goto('/');
    await d.click('demo family');
    await sleep(1000);
    await signUp(d, `uxsc-${nm.toLowerCase()}-${run}@example.test`);
    await d.expect('☁️ Synced', 'family uploaded', 20000);
    await d.goto('/community');
    await d.expect('Join your local homeschool community');
    await d.fillLabel('Display name', `${nm} ${run}`);
    await d.fillLabel('How connected families can reach you (optional)', `${nm.toLowerCase()}-${run}@example.test`);
    await d.click('Join the community');
    await d.expect('Family finder');
  }

  scenario('SC-31 / SC-16 / SC-05 the finder');
  await A.goto('/community');
  await A.expect(`Shown to others as Ana ${run}`, 'SC-31 says it’s the name others see');
  await A.expectNot('Signed in as', 'SC-31 not "Signed in as"');
  await A.expect('families within 25 mi', 'SC-16 the finder counts families nearby');
  await A.expect('On Freerange since', 'SC-05 cards say how long a family has been here');
  const verifiedFirst = (await at(A, 'Get a Verified badge')) >= 0 && (await at(A, 'Get a Verified badge')) < (await at(A, 'Family finder'));
  log(verifiedFirst, 'ana: SC-16 the Verified card comes first until the family is verified');
  await A.reveal(`Ben ${run}`);
  const menu = await box(A, `More for Ben ${run}`);
  log(!!menu && menu.w >= 44 && menu.h >= 44, `ana: SC-05 each finder card has a ⋯ menu (44 pt: ${menu && `${Math.round(menu.w)}×${Math.round(menu.h)}`})`);
  await A.clickLabel(`More for Ben ${run}`);
  await A.click(`🚩 Report Ben ${run}`);
  await A.expect('Report this family', 'SC-05 report a family from the finder');
  await A.expect('never your messages', 'SC-05 says what moderators see');
  await A.click('📣 Spam or a scam');
  await A.click('Send report', { exact: true });
  await A.expect('Thanks, we got it.', 'SC-05 the report is sent');
  await A.click('Done', { exact: true });

  // Connect Ana and Cara: the finder then leaves Cara out (she's under "Your connections").
  await A.clickIn(`Cara ${run}`, 'Request to connect');
  await A.click('Send request');
  await C.goto('/community');
  await C.expect('Connection requests (1)');
  await C.click('Accept', { exact: true });
  await A.goto('/community');
  await A.expect('Your connections');
  await A.reveal(`no such family ${run}`); // every page of the finder
  const caraCards = await A.page.evaluate((n) => [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === n).length, `Cara ${run}`);
  log(caraCards === 1, `ana: SC-16 a connected family shows once, not again in the finder (${caraCards})`);

  scenario('SC-05 a request: report it, or decline and block');
  await B.goto('/community');
  await B.clickIn(`Ana ${run}`, 'Request to connect');
  await B.fillLabel('Note (optional)', `send me your address ${run}`);
  await B.click('Send request');
  await A.goto('/community');
  await A.expect('Connection requests (1)');
  await A.expect('Decline and block', 'SC-05 requests offer Decline and block');
  await A.clickLabel(`More for Ben ${run}`);
  await A.click(`🚩 Report Ben ${run}`);
  const prefilled = await A.page.evaluate(() => [...document.querySelectorAll('textarea')].filter((e) => e.offsetParent).map((e) => e.value).join('|'));
  log(prefilled.includes(`send me your address ${run}`), 'ana: SC-05 the report carries their note');
  await A.clickLabel('Close');
  await A.click('Discard', { exact: true }).catch(() => {});
  await A.click('Decline and block');
  await A.click('Block', { exact: true });
  await A.expectNot('Connection requests (1)', 'SC-05 the request is gone');
  await sleep(1000);
  await A.reveal(`Ben ${run}`);
  log(!(await A.has(`Ben ${run}`)), 'ana: SC-05 a blocked family leaves the finder');
  await A.goto('/messages');
  await A.expect('Blocked families', 'SC-05 blocked families are listed in Messages');
  await A.expect(`Ben ${run}`);
  await A.clickLabel(`Unblock Ben ${run}`);
  await sleep(1200);
  await A.expectNot('Blocked families', 'SC-05 and can be unblocked there');

  scenario('SC-20 / SC-32 / SC-18 / SC-19 messages');
  await A.goto('/messages');
  log(await A.has('Meetup safety tips'), 'ana: SC-32 tips offered while unread');
  await A.click('Meetup safety tips');
  await A.click('Got it', { exact: true });
  await A.goto('/messages');
  await A.expectNot('Meetup safety tips', 'SC-32 the tips button goes once they’re read');
  await A.clickIn(`Cara ${run}`, 'Message');
  await A.type(`textarea[placeholder="Message Cara ${run}"]`, `Park on Monday? ${run}`);
  await A.click('Send', { exact: true });
  await A.expect(`Park on Monday? ${run}`);

  await C.goto('/notifications');
  await C.expect(`new message from Ana ${run}`, 'SC-20 a message notification', 15000);
  await C.expect('New', 'SC-20 grouped under New');
  log((await C.isDisabled('Mark read')) === null, 'cara: SC-20 no per-row "Mark read"');
  log(!!(await C.page.$('[aria-label="Unread"]')), 'cara: SC-20 the unread dot is labelled');
  await C.goto('/messages');
  await C.click(`Ana ${run}`);
  await C.expect(`Park on Monday? ${run}`);
  log((await C.isDisabled('Report')) === null, 'cara: SC-19 no "Report" link under every message');
  const more = await box(C, `More for Ana ${run}`);
  log(!!more && more.w >= 44 && more.h >= 44, 'cara: SC-18 the ⋯ menu is a 44 pt target');
  await C.clickLabel(`More for Ana ${run}`);
  await C.click('🚩 Report a message…');
  await C.expect('Which message?', 'SC-19 the menu reports a chosen message');
  await C.click(`Park on Monday? ${run}`);
  await C.expect('Report this message');
  await C.clickLabel('Close');
  // Long-press a bubble to report it.
  const bubble = await C.page.evaluate((t) => {
    const el = [...document.querySelectorAll('[aria-describedby],[tabindex],div')].filter((e) => e.offsetParent && e.innerText?.startsWith(t)).sort((a, b) => a.innerText.length - b.innerText.length)[0];
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, `Park on Monday? ${run}`);
  if (bubble) {
    await C.page.mouse.move(bubble.x, bubble.y);
    await C.page.mouse.down();
    await sleep(900);
    await C.page.mouse.up();
  }
  await C.expect('Report this message', 'SC-19 long-pressing a message offers Report');
  await C.clickLabel('Close');
  await C.clickLabel(`More for Ana ${run}`);
  await C.click(`⛔ Block Ana ${run}`);
  await C.click('Block', { exact: true });
  await C.expect(`You blocked Ana ${run}. They can’t message you or see you in the finder.`, 'SC-18 a clear blocked banner');
  await C.expectNot('Planning a first meetup', 'SC-18 no meetup banner once blocked');
  await C.click('Unblock', { exact: true });
  await C.expectNot(`You blocked Ana ${run}`, 'SC-18 Unblock from the banner');

  scenario('SC-30 moderation for a non-moderator');
  await C.page.goto(`${BASE}/moderation`, { waitUntil: 'domcontentloaded' });
  let flashed = false;
  for (let i = 0; i < 30; i++) {
    if (await C.page.evaluate(() => /Open reports|Badge applications/.test(document.body.innerText))) flashed = true;
    await sleep(100);
  }
  await C.expect('Moderators only');
  log(!flashed, 'cara: SC-30 nothing of the moderator screen shows while access is checked');
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
}
const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all studio & community UX (cloud) scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
