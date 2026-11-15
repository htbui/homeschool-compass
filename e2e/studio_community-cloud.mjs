// Studio & Community with real accounts on the local Supabase stack:
//  - Studio web import, one source of each kind (a course page, Project
//    Gutenberg, an archive.org scan, YouTube, Pressbooks, LibreTexts,
//    Wikibooks, schema.org data, nested lists, a script-built site, a
//    no-derivatives page, and the server's rate limit). The fetch-page
//    function's answers are served from the unit-test fixtures, so the real
//    screens and parsers run against known pages without the internet.
//  - Publishing a non-commercial adaptation through the server, and a co-op
//    class that a family joins with a hand-typed code.
//  - Two families: a declined request, connecting, messaging, blocking,
//    kid mode, and a full field trip.
// Needs `npm run db:start` and `npx expo start --web --port 8096` (with .env.local).
// Run with `BASE_URL=http://localhost:8096 node e2e/studio_community-cloud.mjs` (W=390 H=844 for phone size).
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8096';
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

// ───────────────────────────── fetch-page, answered from fixtures

/** Address the app asks fetch-page for → what the function would return. */
const PAGES = new Map();
const page = (url, html, finalUrl = url) => PAGES.set(url, { status: 200, body: { url: finalUrl, html } });
page('https://garden.example.org/backyard/', fixture('generic-course.html'));
page('https://www.gutenberg.org/cache/epub/2290/pg2290-images.html', fixture('gutenberg-book.html'));
page('https://archive.org/metadata/raysnewprimaryar00rayj', fixture('archive-scan.json'));
page('https://www.youtube.com/playlist?list=PL3EED4C1D684D3ADF', fixture('youtube-playlist.html'));
page('https://open.oregonstate.education/anatomy2e/', fixture('pressbooks-toc.html'));
page('https://math.libretexts.org/Bookshelves/PreAlgebra/Prealgebra_1e_(OpenStax)', fixture('libretexts-book.html'));
page('https://commons.libretexts.org/api/v1/commons/book/math-4969/licensereport', fixture('libretexts-licensereport.json'));
page('https://en.wikibooks.org/wiki/Arithmetic', fixture('wikibooks-main.html'));
page('https://en.wikibooks.org/wiki/Arithmetic/Printable_version', fixture('wikibooks-print.html'));
page(`https://sky.example.org/weather-${run}`, fixture('jsonld-course.html'));
page('https://hist.example.org/outline', fixture('nested-outline.html'));
page('https://app.example.org/course/1', fixture('script-built.html'));
page('https://nd.example.org/course', fixture('generic-course.html').replace('by-nc-sa/4.0', 'by-nd/4.0').replace('Attribution-NonCommercial-ShareAlike', 'Attribution-NoDerivatives'));
PAGES.set('https://busy.example.org/', { status: 429, body: { error: 'That’s a lot of pages in a minute. Try again in 30 seconds.' } });
const asked = [];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

/** A browser "device" with its own storage, plus helpers bound to it. */
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
    /** Click a button inside the smallest card containing `cardText`. */
    async clickIn(cardText, buttonText) {
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
  // ───────────────────────────── Creator
  scenario('Creator account');
  const S = await device('creator', { fakeFetch: true });
  await signUp(S, `sc-creator-${run}@example.test`);
  await S.expect('No family on this account yet', 'creator account without a family', 20000);
  await S.goto('/studio');
  await S.fillLabel('Creator or shop name', `Sky Studio ${run}`);
  await S.click('Open my Studio');
  await S.expect(`Sky Studio ${run}`, 'creator profile saved');

  // ───────────────────────────── Web import, every kind of source
  scenario('Web import: a course page');
  await load(S, 'garden.example.org/backyard/');
  await S.expect('License found: CC BY-NC-SA 4.0', 'license from the page footer');
  await S.expect('It’s non-commercial, so your plan must be free.');
  await S.expect('Preview: 5 lessons in 2 units', 'units from headings, lessons from links and items');
  await S.expect('Seed worksheet', 'file links on Dropbox are kept');
  await S.expect('Some sections without lessons were left out.');
  await S.expectNot('Our other course', 'sidebar links are not lessons');

  scenario('Web import: Project Gutenberg');
  await load(S, 'https://www.gutenberg.org/ebooks/2290');
  await S.expect('License found: Public domain', 'US public domain from the book’s header');
  await S.expect('Preview: 4 lessons in 1 unit', 'one lesson per chapter');
  await S.expect('CHAPTER I. Jenny Wren Arrives');
  await S.expect('This looks like a whole book on one page');
  log(asked.at(-1) === 'https://www.gutenberg.org/cache/epub/2290/pg2290-images.html', 'creator: the book page loads the whole book');
  await S.click('Create lesson plan');
  await S.expect('saved automatically');
  const gb = (await S.studio()).packages.find((p) => p.origin?.url === 'https://www.gutenberg.org/ebooks/2290');
  log(gb?.license.kind === 'public_domain' && gb.origin.author === 'Thornton W. Burgess' && gb.units[0].lessons[0].links[0].url.endsWith('#CHAPTER_I'), 'creator: source address, author and chapter links kept');

  scenario('Web import: an archive.org scan');
  await load(S, 'https://archive.org/details/raysnewprimaryar00rayj/page/n5/mode/2up');
  await S.expect('📜 Scanned book', 'scans ask for the contents');
  await S.expect('archive.org lists this 1877 scan as not in copyright.');
  log(asked.at(-1) === 'https://archive.org/metadata/raysnewprimaryar00rayj', 'creator: reads the scan’s record');
  await S.fillLabel('Course outline', 'Chapter 1 .... 1\n  Counting .... 3\n  Adding .... 9');
  await S.fillLabel('Scan page that shows printed page 1 (optional)', '7');
  await S.expect('Preview: 2 lessons in 1 unit');
  log(!(await S.isDisabled('Create lesson plan')), 'creator: public domain chosen, nothing missing');
  await S.click('Create lesson plan');
  await S.expect('saved automatically');
  const scan = (await S.studio()).packages.find((p) => p.origin?.url?.startsWith('https://archive.org/details/raysnewprimaryar00rayj'));
  log(scan?.origin.title === "Ray's new primary arithmetic for young learners" && scan.license.kind === 'public_domain' && scan.units[0].lessons[0].links[0]?.url === 'https://archive.org/details/raysnewprimaryar00rayj/page/n9/mode/1up', 'creator: lessons link to the scan page where they start');

  scenario('Web import: a YouTube playlist');
  await load(S, 'https://www.youtube.com/watch?v=QnQe0xW_JY4&list=PL3EED4C1D684D3ADF&index=2');
  await S.expect('Crash Course Biology Preview', 'one lesson per video');
  await S.expect('check their license', 'warns that videos carry their own licenses');
  await S.expect('No license found on this page.');
  log(asked.at(-1) === 'https://www.youtube.com/playlist?list=PL3EED4C1D684D3ADF', 'creator: a watched video loads its whole playlist');
  log(await S.isDisabled('Create lesson plan'), 'creator: a license must be chosen first');
  await S.click('Not sure', { exact: true });
  log(!(await S.isDisabled('Create lesson plan')), 'creator: “Not sure” is enough for a private plan');

  scenario('Web import: Pressbooks');
  await load(S, 'https://open.oregonstate.education/anatomy2e/');
  await S.expect('📖 Anatomy & Physiology 2e', 'read as a textbook');
  await S.expect('License found: CC BY-NC-SA 4.0', 'the book’s own license, not an image credit');
  await S.expect('1.1 How Structure Determines Function');
  await S.expect('chapters can carry their own licenses');

  scenario('Web import: LibreTexts');
  await load(S, 'https://math.libretexts.org/Bookshelves/PreAlgebra/Prealgebra_1e_(OpenStax)');
  await S.expect('Preview: 8 lessons in 2 units', 'outline read from LibreTexts', 15000);
  await S.expect('License found: CC BY 4.0');
  await S.expect('This book’s pages use different licenses');
  log(asked.slice(-2).join(' ') === 'https://math.libretexts.org/Bookshelves/PreAlgebra/Prealgebra_1e_(OpenStax) https://commons.libretexts.org/api/v1/commons/book/math-4969/licensereport', 'creator: book page, then its public outline');
  await S.expect('https://math.libretexts.org/Bookshelves/PreAlgebra/Prealgebra_1e_(OpenStax)', 'the book’s address stays the source');

  scenario('Web import: Wikibooks');
  await load(S, 'https://en.wikibooks.org/wiki/Arithmetic');
  await S.expect('License found: CC BY-SA 4.0');
  await S.expect('Load the printable version', 'offers the print version');
  await S.click('Load the printable version');
  await S.expect('Definition of Arithmetic', 'sections of the print version become lessons', 15000);
  log(asked.at(-1) === 'https://en.wikibooks.org/wiki/Arithmetic/Printable_version', 'creator: loaded the print version');

  scenario('Web import: nested lists and script-built sites');
  await load(S, 'https://hist.example.org/outline');
  await S.expect('Preview: 6 lessons in 3 units', 'outer items are units');
  await S.expectNot('Courses', 'menus are not lessons');
  await S.expect('No license found on this page.');
  await load(S, 'https://app.example.org/course/1');
  await S.expect('builds its pages with scripts', 'explains how to copy the outline instead');
  await S.fillLabel('Or paste the course outline (optional)', 'Unit 1\nLesson one https://app.example.org/l/1');
  await S.expect('Preview: 1 lesson in 1 unit', 'a pasted outline fills in');

  scenario('Web import: a no-derivatives source, a failing site, and the rate limit');
  await load(S, 'https://nd.example.org/course');
  await S.expect('License found: CC BY-ND 4.0');
  await S.expect('It doesn’t allow sharing adapted versions, so your plan will be for your family only.');
  await load(S, 'https://busy.example.org/');
  await S.expect('That’s a lot of pages in a minute. Try again in 30 seconds.', 'the server’s rate limit is explained');
  await S.click('Enter the details myself');
  await S.expect('Course name', 'falls back to entering the details');
  await load(S, 'https://gone.example.org/');
  await S.expect('Couldn’t load that page.', 'a failed fetch is explained');

  // ───────────────────────────── Publish an NC adaptation through the server
  scenario('Publish a schema.org course (non-commercial)');
  await load(S, `https://sky.example.org/weather-${run}`);
  await S.expect('License found: CC BY-NC-SA 4.0', 'a license named in the page’s data, every condition kept');
  await S.expect('Preview: 4 lessons in 3 units');
  await S.fillLabel('Your plan’s title', `Weather Watch ${run}`);
  await S.click('Create lesson plan');
  await S.expect('saved automatically');
  await S.click('📝 Details');
  await S.fillLabel('Description', 'Clouds, wind and a weather journal for curious kids.');
  await S.click('🔬 Science');
  await S.click('🚀 Publish');
  await S.expect('can’t be changed', 'license from the source is locked');
  await S.expect('The source is non-commercial, so this must be free.');
  await S.click('I checked');
  await sleep(1800); // the draft saves to the account before publishing
  await S.click('Publish to the Marketplace');
  log(await S.waitFor('Published v1', 15000), 'creator: published through the server');
  const weather = (await S.studio()).packages.find((p) => p.title === `Weather Watch ${run}`);
  log(weather?.price === 0 && weather.license.kind === 'cc_by_nc_sa' && !!weather.listingId, 'creator: free, with the source’s license');

  // ───────────────────────────── Families
  scenario('Two families join the community');
  const A = await device('ana');
  const C = await device('cara');
  for (const [d, nm] of [[A, 'Ana'], [C, 'Cara']]) {
    await d.goto('/');
    await d.click('demo family');
    await sleep(1000);
    await signUp(d, `sc-${nm.toLowerCase()}-${run}@example.test`);
    await d.expect('☁️ Synced', 'family uploaded', 20000);
    await d.goto('/community');
    await d.expect('Join your local homeschool community');
    await d.fillLabel('Display name', `${nm} ${run}`);
    await d.fillLabel('How connected families can reach you (optional)', `${nm.toLowerCase()}-${run}@example.test`);
    await d.click('Join the community');
    await d.expect('Family finder');
  }

  scenario('A declined request shares nothing');
  await C.expect(`Ana ${run}`, 'finder shows the other family');
  await C.clickIn(`Ana ${run}`, 'Request to connect');
  await C.click('Send request');
  await C.expect('Request sent');
  await A.goto('/community');
  await A.expect('Connection requests (1)');
  await A.clickIn(`Cara ${run}`, 'Decline');
  await sleep(800);
  await A.expectNot('Connection requests (1)', 'request answered');
  await C.goto('/community');
  await C.expectNot(`ana-${run}@example.test`, 'no contact after a decline');
  // Asking again after a "no" doesn't break: it says the request is still with them.
  await C.clickIn(`Ana ${run}`, 'Request to connect');
  await C.click('Send request');
  await sleep(1200);
  await C.expect('You already asked this family to connect.', 'asking again after a decline is explained');
  await C.expectNot('duplicate key', 'no database error shown');

  scenario('Connecting shares contacts; messages; blocking');
  await A.goto('/community');
  await A.clickIn(`Cara ${run}`, 'Request to connect');
  await A.click('Send request');
  await C.goto('/community');
  await C.expect('Connection requests (1)', 'the other way round works');
  await C.click('Accept', { exact: true });
  await C.expect(`ana-${run}@example.test`, 'contact shared after accepting');
  await A.goto('/messages');
  await A.clickIn(`Cara ${run}`, 'Message');
  await A.expect('Only your two families can read this conversation');
  await A.type(`textarea[placeholder="Message Cara ${run}"]`, `Library on Friday? ${run}`);
  await A.click('Send', { exact: true });
  await A.expect(`Library on Friday? ${run}`, 'message sent');
  await C.goto('/messages');
  await C.click(`Ana ${run}`);
  await C.expect(`Library on Friday? ${run}`, 'message received');
  await C.click('Block', { exact: true });
  await C.click('Block', { exact: true }).catch(() => {}); // confirm, when asked
  await C.expect('Unblock', 'blocked');
  await A.goto('/messages');
  await A.click(`Cara ${run}`);
  await A.expect(`You can message Cara ${run} while you’re connected.`, 'can no longer message the family that blocked her');
  log((await A.isDisabled('Send')) === null, 'ana: no message box once blocked');
  await C.expect(`You blocked Ana ${run}. Unblock to message again.`, 'the blocker is told how to undo it');
  await C.goto('/community');
  await C.expectNot(`ana-${run}@example.test`, 'blocking ends the connection');

  scenario('Kid mode never shows messages or community');
  const kid = (await A.store()).children?.[0]?.id;
  await A.page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('freerange-v1'));
    s.state.mode = { kind: 'kid', childId: id };
    localStorage.setItem('freerange-v1', JSON.stringify(s));
  }, kid);
  for (const path of ['/messages', '/community', '/notifications', '/studio']) {
    await A.goto(path);
    log(new URL(A.page.url()).pathname.startsWith('/kid'), `ana: ${path} in kid mode goes back to the kid’s day`);
  }
  await A.expectNot(`Cara ${run}`, 'no family names in kid mode');
  await A.page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('freerange-v1'));
    s.state.mode = { kind: 'parent' };
    localStorage.setItem('freerange-v1', JSON.stringify(s));
  });

  scenario('A full field trip');
  await A.goto('/community');
  await A.click('🚌 Field trips');
  await A.click('Organize');
  await A.fillLabel('Title', `Tiny tour ${run}`);
  await A.fillLabel('Location (public meeting place)', 'Library steps');
  await A.fillLabel('Capacity (families)', '1');
  await A.click('Create', { exact: true });
  await A.expect(`Tiny tour ${run}`, 'trip created');
  await A.expect(`Ana ${run}`, 'host shown by community name');
  await C.goto('/community');
  await C.click('🚌 Field trips');
  await C.expect(`Tiny tour ${run}`, 'trip visible nearby');
  log((await C.disabledIn(`Tiny tour ${run}`, 'RSVP')) === true, 'cara: RSVP is closed once the trip is full');

  // ───────────────────────────── Co-op class
  scenario('Co-op class with a typed code');
  await S.goto('/studio/classes');
  await S.click(`Weather Watch ${run}`);
  await S.fillLabel('Room for how many families? (up to 30)', '2');
  await S.click('Start the class');
  await S.expect('Invite code', 'class page', 15000);
  const code = await S.page.evaluate(() => document.body.innerText.match(/\b[A-HJ-NP-Z2-9]{8}\b/)?.[0]);
  log(!!code, `creator: class has an invite code (${code})`);
  const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`;
  await C.goto(`/coop/${typed}`);
  await C.expect(`Weather Watch ${run}`, 'a lower-case code with a dash finds the class', 15000);
  await C.fillLabel('How the teacher sees your family', `The Caras ${run}`);
  await C.click('Join the class');
  await C.expect('You’re in', 'joined');
  await S.page.reload({ waitUntil: 'networkidle0' });
  await sleep(1000);
  await S.expect(`The Caras ${run}`, 'teacher sees the family in the roster', 15000);
  await S.expectNot('Maya', 'no kids’ names unless the family shares them');
  await S.clickIn(`The Caras ${run}`, 'Remove');
  await S.click('Remove', { exact: true });
  await S.expect('No families yet', 'teacher removed the family', 15000);
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
}
const relevant = errors.filter((e) => !/DevTools|Download the React/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all studio & community (cloud) scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
