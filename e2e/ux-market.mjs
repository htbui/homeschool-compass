// Marketplace fixes from the design review (MKT-xx), checked in the DOM on the
// local-only build: a shorter Browse header, Filters with counts and a pinned
// "Show N", empty states that say why, one-tap free claims straight into Add to
// plan, the "lessons already linked" finish, listing cards and stars for screen
// readers, the license card's real link, a two-step sell form with photos and
// inline number errors, gift codes you can copy, a gift page that says what the
// gift is, a grouped My library, and dark-mode contrast. The live-account parts
// (coupons, ESA tagging, storefronts, bundles, messaging a seller) are in
// ux-market-cloud.mjs. Run against the local-only server, at desktop and phone size:
//   BASE_URL=http://localhost:8082 node e2e/ux-market.mjs
//   BASE_URL=http://localhost:8082 W=390 H=844 node e2e/ux-market.mjs
import { writeFileSync } from 'node:fs';

import { BASE, bodyText, browser, click, clickLabel, expect, expectNot, fill, finish, goto, has, load, log, OUT, page, run, scenario, seed, sleep, store, W } from './compass-helpers.mjs';

const phone = W < 760;
const shot = (name) => page.screenshot({ path: `${OUT}ux-market-${name}-${W}.png` });
const AESOP = 'l-lib-aesop-for-children';

/** Type into the last visible input with this accessible name. */
async function fillName(name, text) {
  const h = await page.waitForFunction(
    (n) => [...document.querySelectorAll('input,textarea')].filter((e) => e.offsetParent !== null && e.getAttribute('aria-label') === n).at(-1),
    { timeout: 5000, polling: 100 },
    name,
  );
  await h.evaluate((e) => { e.focus(); e.select?.(); });
  await page.keyboard.press('Backspace');
  if (text) await page.keyboard.type(text);
  await sleep(150);
}
/** The bounding box of the last visible element whose text (or label) matches. */
const box = (text, { exact = true, selector = '[role="button"],[role="radio"],[role="checkbox"],a' } = {}) =>
  page.evaluate((t, exact, sel) => {
    const el = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent && (exact ? e.innerText.trim() === t : e.innerText.includes(t))).at(-1);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, vh: window.innerHeight, vw: window.innerWidth };
  }, text, exact, selector);
const inView = (b) => !!b && b.top >= 0 && b.bottom <= b.vh + 1 && b.left >= -1 && b.right <= b.vw + 1;
const resultCount = async () => {
  await expect(' curricul', 'results heading');
  const m = (await bodyText()).match(/\n(\d+) curricul(?:a|um)\n/);
  return m ? Number(m[1]) : -1;
};
/** Contrast of a text color on a background (both "rgb(…)" strings). */
const contrast = (fg, bg) => {
  const lum = (s) => {
    const [r, g, b] = s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

async function main() {
  await browser.defaultBrowserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await load(seed);

  // ───────────────────────────── Browse
  scenario('Browse header (MKT-04, 21, 22, 29)');
  await goto('/market');
  await expect('Free & open classics, organized into lesson plans.', 'MKT-04 one-line tagline for the free catalog');
  await expect('Showing free & open curricula', 'MKT-04 one-line note about the catalog');
  log(!(await has('Curricula from publishers and used books from other families')), 'MKT-04 no tagline promising what isn’t there');
  const firstCard = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="button"][aria-label*=", by "]')].find((e) => e.offsetParent);
    return el ? el.getBoundingClientRect().top + (el.closest('[style*="overflow"]')?.scrollTop ?? 0) : -1;
  });
  const top1 = await firstCard();
  log(top1 > 0 && (!phone || top1 < 500), `MKT-04 first result starts ${Math.round(top1)} px down (was ~580 on phones)`);
  await clickLabel('Hide this note');
  await expectNot('Showing free & open curricula', 'MKT-04 the note can be dismissed');
  await goto('/market');
  await sleep(500);
  log(!(await has('Showing free & open curricula')), 'MKT-04 dismissal is remembered');
  const top2 = await firstCard();
  log(top2 > 0 && top2 < top1, `MKT-04 results move up without the note (${Math.round(top2)} px)`);
  log((await page.$$('[role="radio"]')).length >= 2, 'MKT-04 grade choice is a pick-one');
  await expect('Sort: Best match ▾', 'MKT-04 sort folded into one chip');
  log(!(await has('Price: high to low')), 'MKT-04 sort options aren’t a row of chips');
  log(!(await has('No reviews yet')), 'MKT-21 cards don’t say "No reviews yet"');
  await expect('📖 Free online text', 'MKT-22 classics are free online texts');
  log(!(await has('💻 Online course')), 'MKT-22 not "Online course"');
  await click('Sort: Best match ▾');
  await expect('Sort by');
  log(!(await has('Top rated')) && !(await has('Most reviewed')), 'MKT-21 rating sorts hidden until there are reviews');
  await click('Price: low to high', { exact: true });
  await expect('Sort: Price: low to high ▾', 'picking a sort closes the sheet and shows it on the chip');
  await click('Sort: Price: low to high ▾');
  await click('Best match', { exact: true });
  if (!phone) {
    const clamp = await page.evaluate(() => {
      const card = [...document.querySelectorAll('[role="button"][aria-label*=", by "]')].find((e) => e.offsetParent);
      const title = card && [...card.querySelectorAll('div')].find((d) => getComputedStyle(d).webkitLineClamp && getComputedStyle(d).webkitLineClamp !== 'none');
      return title ? getComputedStyle(title).webkitLineClamp : null;
    });
    log(clamp === '3', `MKT-29 card titles get 3 lines (${clamp})`);
    const cols = await page.evaluate(() => new Set([...document.querySelectorAll('[role="button"][aria-label*=", by "]')].filter((e) => e.offsetParent).slice(0, 6).map((e) => Math.round(e.getBoundingClientRect().left))).size);
    log(cols === 2, `MKT-29 two columns at ${W} px (3 only from 1400 px) — ${cols}`);
  }
  await shot('browse');

  scenario('Cards and controls for screen readers (MKT-16)');
  const labels = await page.evaluate(() => [...document.querySelectorAll('[role="button"][aria-label*=", by "]')].filter((e) => e.offsetParent).map((e) => e.getAttribute('aria-label')));
  log(labels.length > 3 && labels.every((l) => /, by .+, (free|\$[\d.]+), (grades? |kindergarten|pre-K)/.test(l)), `MKT-16 listing cards read as one sentence ("${labels[0]}")`);
  const tablist = await page.$('[role="tablist"] [role="tab"][aria-selected="true"]');
  log(!!tablist, 'MKT-16 Browse / My library / Selling is a tablist');

  scenario('Filters (MKT-05)');
  await click('⚙️ Filters');
  await expect('Show ');
  const show = await box('curricula', { exact: false });
  log(inView(show), `MKT-05 "Show N curricula" is on screen without scrolling (${show && Math.round(show.bottom)} of ${show?.vh})`);
  log(!!show && show.right - show.left > (phone ? 180 : 250), 'MKT-05 "Show N" is a wide primary button');
  await expect('Free (', 'MKT-05 options show counts');
  log(!(await has('4.5★ & up')), 'MKT-05 Rating group hidden while nothing has a review');
  const dim = await page.evaluate(() => [...document.querySelectorAll('[role="radio"],[role="checkbox"]')].filter((e) => e.offsetParent && /\(0\)$/.test(e.innerText.trim())).map((e) => Number(getComputedStyle(e.parentElement).opacity)));
  log(dim.length > 0 && dim.every((o) => o < 1), `MKT-05 options that would show nothing are dimmed (${dim.length})`);
  await click('Used, from families (0)');
  await expect('Show 0 curricula', 'MKT-05 count updates before closing');
  await click('Clear all', { exact: true });
  await click('Show ', { exact: false });
  await click('All grades', { exact: true });
  const all = await resultCount();

  scenario('Empty results say why (MKT-06)');
  await fill('Search curricula, publishers, subjects…', `xyzzy${run}`);
  await expect(`No curricula match “xyzzy${run}”`, 'MKT-06 names the search');
  await expect('Clear search', 'MKT-06 offers to clear the search');
  log(!(await has('Search all grades')), 'MKT-06 no "search all grades" when all grades are already on');
  log(!(await has('Ranked for your family')), 'MKT-06 no ranking subtitle over 0 results');
  log(!(await has('Nothing matches those filters')), 'MKT-06 doesn’t blame filters for a search');
  await click('Clear search', { exact: true });
  log((await resultCount()) === all, 'MKT-06 clear search brings everything back');
  // Ada is in 4th grade and Ben in kindergarten: the American Yawp is high school.
  await click("👧 My kids' grades", { exact: true });
  await fill('Search curricula, publishers, subjects…', 'Yawp');
  await expect('Search all grades', 'MKT-06 offers all grades when the kids’ grades hide the match');
  await click('Search all grades', { exact: true });
  await expect('The American Yawp', 'MKT-06 search all grades finds it');
  await fill('Search curricula, publishers, subjects…', '');

  // ───────────────────────────── Listing page
  scenario('Listing page (MKT-17, 20, 23, 28)');
  await goto(`/listing/${AESOP}`);
  await expect('The Aesop for Children');
  await expect('📜 Public domain', 'MKT-20 license card names the license once');
  log(!(await has('Public domain — Public domain')), 'MKT-20 no "Public domain — Public domain"');
  const link = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => a.offsetParent).map((a) => ({ text: a.innerText.trim(), href: a.href, target: a.target })).find((a) => a.text.startsWith('Read the free full text')));
  log(link?.href === 'https://www.gutenberg.org/ebooks/19994' && link.target === '_blank', `MKT-20 "Read the free full text" is a real link (${link?.href})`);
  log(!(await bodyText()).includes('Free full text: https://'), 'MKT-20 no bare address in the credit line');
  log(!(await has('Report this listing')), 'MKT-17 no report button in the device-only build (it could never be sent)');
  log(!(await has('More from')), 'MKT-17 no storefront link to a dead end');
  const header = await page.evaluate(() => [...document.querySelectorAll('[role="heading"]')].filter((e) => e.offsetParent).map((e) => e.innerText.trim()));
  log(header.filter((h) => h === 'The Aesop for Children').length === 1, `MKT-28 the title appears once as a heading (${header.join(' | ')})`);
  if (!phone) {
    const stuck = await page.evaluate(async () => {
      const btn = [...document.querySelectorAll('[role="button"]')].find((e) => e.offsetParent && e.innerText.trim() === 'Get it free');
      let s = btn?.parentElement;
      while (s && !(s.scrollHeight > s.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      if (!s) return null;
      s.scrollTop = 1200;
      await new Promise((r) => setTimeout(r, 300));
      const r = btn.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight, scrolled: s.scrollTop };
    });
    log(!!stuck && stuck.scrolled > 500 && stuck.top >= 0 && stuck.bottom <= stuck.vh, `MKT-28 buy box stays on screen while scrolling (button at ${stuck && Math.round(stuck.top)} px after ${stuck?.scrolled} px)`);
  }

  scenario('Free claim in one tap (MKT-09, 10, 30)');
  await goto(`/listing/${AESOP}`);
  await click('Get it free', { exact: true });
  await expect('It’s in your library', 'MKT-09 one tap claims it');
  log(!(await has('Get this curriculum')), 'MKT-09 no second "Get it free" confirm sheet');
  await expect('Add to your plan', 'MKT-09 Add to plan opens as the next step');
  const addBtn = await box('Add to plan');
  log(inView(addBtn), `MKT-09 "Add to plan" is on screen without scrolling (${addBtn && Math.round(addBtn.bottom)} of ${addBtn?.vh})`);
  log(!(await has('(outside grade range)')), 'MKT-30 a family-style book doesn’t flag siblings');
  await expect('Add Ada too?', 'MKT-30 suggests adding the sibling');
  log(!/✓ \d{1,2}:\d{2} [AP]M/.test(await bodyText()), 'MKT-30 no "✓ 8:30 AM" echo under the time');
  await click('Add Ada too?');
  await expect('Taught together as one family block.', 'MKT-30 both kids in one family block');
  await click('Add to plan', { exact: true });
  await expect('Added to your plan ✓');
  await expect('✓ Every lesson links to the free text', 'MKT-10 says the lessons already link to the text');
  log(!(await has('Where do the lessons live?')), 'MKT-10 doesn’t ask for links it already has');
  const finishBtn = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && /See today’s plan|See the rhythm/.test(e.innerText)).map((e) => ({ t: e.innerText.trim(), bg: getComputedStyle(e.firstElementChild ?? e).backgroundColor })));
  log(finishBtn.length === 2 && finishBtn.find((b) => b.t === 'See today’s plan')?.bg !== finishBtn.find((b) => b.t === 'See the rhythm')?.bg, 'MKT-10 "See today’s plan" is the clear finish');
  await click('Add your own link or file');
  await expect('Your own links and files');
  const up = await box('📄 Upload PDF or image');
  const card = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && e.innerText.trim() === '📄 Upload PDF or image').at(-1);
    let c = el?.parentElement;
    while (c && !(getComputedStyle(c).borderTopWidth !== '0px' && getComputedStyle(c).borderRadius !== '0px')) c = c.parentElement;
    const r = c?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right } : null;
  });
  log(!!up && !!card && up.left >= card.left - 1 && up.right <= card.right + 1, `MKT-10 the upload button stays inside its card (${up && Math.round(up.left)}–${up && Math.round(up.right)} in ${card && Math.round(card.left)}–${card && Math.round(card.right)})`);
  await click('See today’s plan', { exact: true });
  log(await page.waitForFunction(() => location.pathname === '/today', { timeout: 5000 }).then(() => true, () => false), 'MKT-10 "See today’s plan" goes to Today');

  scenario('Reviews (MKT-16, 24, 25)');
  await goto(`/listing/${AESOP}`);
  await click('Write a review');
  const stars = await page.evaluate(() => {
    const g = [...document.querySelectorAll('[role="radiogroup"]')].find((e) => e.offsetParent && e.getAttribute('aria-label') === 'Your rating');
    return g ? [...g.querySelectorAll('[role="radio"]')].map((r) => ({ label: r.getAttribute('aria-label'), checked: r.getAttribute('aria-checked'), h: r.getBoundingClientRect().height })) : [];
  });
  log(stars.length === 5 && stars.every((s) => s.checked === 'false' && s.h >= 44), 'MKT-16 stars are a radio group of 44 px targets');
  await expect('🦖 Ben · Kindergarten', 'MKT-25 "Used with" names the child');
  const pre = await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].filter((e) => e.offsetParent && e.getAttribute('aria-checked') === 'true').map((e) => e.innerText.trim()));
  log(pre.includes('🦉 Ada · 4th Grade') || pre.includes('🦖 Ben · Kindergarten'), `MKT-25 the child with it in their plan is picked (${pre.join(', ')})`);
  await clickLabel('4 stars');
  log(await page.evaluate(() => document.querySelector('[role="radio"][aria-label="4 stars"]')?.getAttribute('aria-checked')) === 'true', 'MKT-16 the chosen star is checked');
  await fillName('Your review', `Fables at dinner every night ${run}.`);
  await click('Post review', { exact: true });
  await expect('4.0 · 1 review');
  await expect('used with', 'MKT-25 the review shows the grade');
  log(!(await bodyText()).includes('used with Ben') && !(await bodyText()).includes('used with Ada'), 'MKT-25 never the child’s name');
  log(!(await has('Most helpful')) && !(await has('All stars')), 'MKT-24 no sort or star filters for one review');

  // ───────────────────────────── My library
  scenario('My library (MKT-32)');
  await goto(`/listing/l-lib-viking-tales`);
  await click('Get it free', { exact: true });
  await click('Later', { exact: true });
  await goto('/market?view=library');
  await expect('My library', 'MKT-32 its own short header');
  log(!(await has('Showing free & open curricula')) && !(await has('Free & open classics, organized')), 'MKT-32 no Marketplace tagline or note');
  await expect('Not started (1)', 'MKT-32 "Not started" group');
  await expect('In your plan (1)', 'MKT-32 "In your plan" group');
  const order = (await bodyText()).indexOf('Viking Tales') < (await bodyText()).indexOf('In your plan (1)');
  log(order, 'MKT-32 Viking Tales (not started) is listed before the plan');

  // ───────────────────────────── Selling
  scenario('Sell sheet (MKT-07, 08, 26)');
  await goto('/market?view=selling');
  await click('List a curriculum', { exact: true });
  await expect('Step 1 of 2 · What is it?', 'MKT-08 step 1 asks what it is');
  log(!(await has('Lessons per week')), 'MKT-08 lesson numbers aren’t on the first step');
  const pickedGrades = await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"]')].filter((e) => e.offsetParent && /^(Pre-K|K|\d{1,2})$/.test(e.innerText.trim()) && e.getAttribute('aria-checked') === 'true').length);
  log(pickedGrades === 0, 'MKT-08 no grades pre-selected');
  await expect('the grades it’s for', 'MKT-08 grades are listed as still needed');
  const layout = await page.evaluate(() => {
    const reason = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.startsWith('Still needed:')).at(-1)?.getBoundingClientRect();
    const cancel = [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && e.innerText.trim() === 'Cancel').at(-1)?.getBoundingClientRect();
    return reason && cancel ? { r: reason.right <= window.innerWidth && reason.left >= 0, c: cancel.width > 0 && cancel.right <= window.innerWidth, inView: cancel.bottom <= window.innerHeight } : null;
  });
  log(!!layout?.r && !!layout.c, 'MKT-07 the reason fits and Cancel stays');
  log(!!layout?.inView, 'MKT-07 the sheet’s buttons are pinned on screen');
  await fillName('Title', `Beta workbook ${run}`);
  await click('🧮 Math');
  await click('2', { exact: true });
  await click('4', { exact: true });
  await expect('Grades: 2nd Grade – 4th Grade', 'MKT-08 two taps make a range');
  await fillName('Price ($, 0 = free)', '12');
  await fillName('Pickup area (optional)', 'Lakewood, CO');
  await click('📦 I can ship it');
  await fillName('Description', 'Lightly used, a few pencil marks.');
  // A photo of the item (MKT-03).
  const png = `${OUT}ux-market-photo.png`;
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJElEQVR4nGP4z8BAEhrVMKphVMOohlENoxpGNYxqGNVAHw0AJ8n3Ad5JmB8AAAAASUVORK5CYII=', 'base64'));
  const addPhoto = await page.evaluateHandle(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && e.innerText.includes('Add photo')).at(-1));
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 8000 }), addPhoto.asElement().click()]);
  await chooser.accept([png]);
  await expect('Photos (1 of 4)', 'MKT-03 a photo was added');
  log(!!(await page.$('img[src^="data:image"], [aria-label="Photo 1"]')), 'MKT-03 the photo shows in the form');
  await click('Lesson details ›');
  await expect('Step 2 of 2 · Help families schedule it (optional)', 'MKT-08 step 2 is optional');
  await expect('🌲 Nature-based', 'MKT-26 teaching styles use the same labels as Filters');
  log(!(await has('Nature / Forest School')) && !(await has('Traditional / School-at-Home')), 'MKT-26 no second set of style names');
  await fillName('Lessons', 'abc');
  await expect('Enter a number, e.g. 120', 'MKT-08 inline error on a number field');
  await fillName('Lessons', '');
  await expectNot('Enter a number, e.g. 120');
  await click('Publish listing', { exact: true });
  await expect(`Beta workbook ${run}`, 'MKT-08 publishes without lesson numbers');
  const mine = (await store()).myListings.find((l) => l.title === `Beta workbook ${run}`);
  log(mine?.paceUnknown === true && mine.gradeMin === 2 && mine.gradeMax === 4 && mine.pickupArea === 'Lakewood, CO' && mine.ships === true && mine.photos?.length === 1, 'MKT-08 saved: grades, pickup area, shipping, photo, no lesson numbers');
  await goto(`/listing/${mine.id}`);
  await expect('The seller didn’t add lesson details', 'MKT-08 buyers are told they’ll set the pace');
  await expect('📍 Pickup around Lakewood, CO', 'MKT-08 pickup area on the listing');
  await expect('📦 The seller can ship it');
  log(!!(await page.$('[aria-label="Photo 1 of 1"]')), 'MKT-03 the photo is at the top of the listing');
  await shot('sell-listing');

  // ───────────────────────────── Gifts
  scenario('Gift codes (MKT-11, 12)');
  await goto('/listing/l-lib-burgess-bird-book');
  await click('🎁 Send to a friend');
  await fill('their@email.com', `gran-${run}@example.com`);
  await click('Send the gift');
  await expect('Your gift is ready');
  await expect(`For gran-${run}@example.com`, 'MKT-11 the recipient’s email is shown');
  const mail = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => a.offsetParent && a.href.startsWith('mailto:'))?.href);
  log(!!mail && mail.startsWith(`mailto:gran-${run}@example.com`) && mail.includes('gift'), 'MKT-11 a mail link with the code ready to send');
  await click('🔗 Copy link');
  await expect('Copied ✓', 'MKT-11 copy link says it’s copied');
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  const gift = (await store()).localGifts?.[0];
  log(clip.includes(`/gift/${gift.code}`), `MKT-11 the link is on the clipboard (${clip.slice(0, 60)})`);
  await click('📋 Copy code');
  await expect('Code copied.');
  await click('Done', { exact: true });
  await goto(`/gift/${gift.code}`);
  await expect('A gift from', 'MKT-12 the gift page says who it’s from');
  await expect('The Burgess Bird Book', 'MKT-12 …and what it is');
  await expect('What’s inside', 'MKT-12 a peek inside');
  await expect('📖 Free online text');
  log(/\b\d+ lessons\b/.test(await bodyText()), 'MKT-12 lesson count shown');
  await click('Claim my gift');
  await expect('It’s in your library.');
  await goto(`/gift/${gift.code}`);
  await expect('It’s in your library.', 'MKT-12 re-opening a gift you claimed says it’s yours');
  await expect('Add it to your plan', 'MKT-12 …with the next step');
  await goto('/gift/ZZZZZ-ZZZZZ');
  await expect('Go to my library', 'MKT-12 a bad code still offers a way on');
  await expect('Browse free curricula');

  // ───────────────────────────── Deep links (MKT-02, already shared; checked here for the marketplace routes)
  scenario('Deep links (MKT-02)');
  for (const path of [`/listing/${AESOP}`, '/bundle/nope', '/creator/nope', '/gift/ZZZZZ-ZZZZZ']) {
    await goto(path);
    const ok = await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Back to Marketplace"]')].some((e) => e.offsetParent), { timeout: 8000 }).then(() => true, () => false);
    log(ok, `MKT-02 ${path} opened from a link has "‹ Marketplace"`);
  }

  // ───────────────────────────── Dark mode (MKT-15)
  scenario('Dark mode contrast (MKT-15)');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await goto('/market');
  await expect('All grades');
  const chip = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="radio"],[role="checkbox"]')].find((e) => e.offsetParent && e.getAttribute('aria-checked') === 'true');
    const pill = el?.firstElementChild;
    const text = pill?.querySelector('div') ?? pill;
    return pill ? { fg: getComputedStyle(text).color, bg: getComputedStyle(pill).backgroundColor, t: el.innerText.trim() } : null;
  });
  const ratio = chip ? contrast(chip.fg, chip.bg) : 0;
  log(ratio >= 4.5, `MKT-15 selected chip "${chip?.t}" text contrast ${ratio.toFixed(2)}:1 in dark mode`);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
}

await finish(main, 'marketplace UX');
