// Studio & Community fixes from the design review (findings SC-xx), checked on the
// local-only build at desktop and phone size. The signed-in parts (publishing through
// the server, the live finder, messages, notifications) are in ux-studio_community-cloud.mjs.
//   BASE_URL=http://localhost:8082 node e2e/ux-studio_community.mjs
//   BASE_URL=http://localhost:8082 W=390 H=844 node e2e/ux-studio_community.mjs
import { ADA, BASE, bodyText, click, clickLabel, expect, expectNot, finish, goto, has, load, log, OUT, page, run, scenario, seed, sleep, W } from './compass-helpers.mjs';

const studio = () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-studio') ?? '{}').state ?? {});
const pkgNamed = async (t) => (await studio()).packages?.find((p) => p.title === t);
const shot = (name) => page.screenshot({ path: `${OUT}ux-sc-${name}-${W}.png` });

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
/** A visible button by its exact text: disabled state and box. */
const button = (text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('[role="button"]')].reverse().find((e) => e.offsetParent && e.innerText.trim() === t);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { disabled: el.getAttribute('aria-disabled') === 'true', top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height, vh: innerHeight, vw: innerWidth };
  }, text);
const byLabel = (label) =>
  page.evaluate((l) => {
    const el = [...document.querySelectorAll(`[aria-label="${l}"]`)].reverse().find((e) => e.offsetParent);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { role: el.getAttribute('role'), checked: el.getAttribute('aria-checked'), w: r.width, h: r.height };
  }, label);
/** Where text first appears on the page (to check what comes first). */
const at = async (t) => (await bodyText()).indexOf(t);

async function main() {
  // ───────────────────────────── A creator with no family (Studio only)
  scenario('Creator-only Studio');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await goto('/studio/setup');
  await fillName('Creator or shop name', `Fern Studio ${run}`);
  await click('Open my Studio');
  await expect(`Fern Studio ${run}`);
  await expect('Nothing here yet', 'SC-06 an empty Studio says what to do');
  log(!(await has('Teach and sell')), 'SC-06 no "Teach and sell" before there is anything to teach or sell');
  log(!(await has('Sales, bundles & coupons')), 'SC-06 no sales card before anything is published');

  // A book conversion: private for good.
  await goto('/studio/import?from=book');
  await fillName('Book title', `Earth Reader ${run}`);
  await fillName('Table of contents', 'Chapter 1: Rocks ..... 1\n  1.1 Igneous ..... 2\nChapter 2: Water ..... 10');
  await click('Create lesson plan');
  await expect('saved automatically');
  await expect('🔒 Private', 'SC-10 a book conversion is marked Private, not Draft');
  await click('🏠 Use');
  await expect('Set up your family to schedule this for your kids', 'SC-10 the Use tab explains why there is nothing to schedule yet');
  log(!(await has('Add to my family’s plan')), 'SC-10 no hidden-for-no-reason plan button');
  await shot('use-tab-no-family');

  await goto('/studio/import');
  await fillName('Curriculum title', `Bare Plan ${run}`);
  await click('Create', { exact: true });
  await expect('saved automatically');

  await goto('/studio');
  await expect('Continue editing', 'SC-06 the latest draft is offered first');
  const order = [await at('Continue editing'), await at('Drafts'), await at('Teach and sell'), await at('Badges')];
  log(order.every((n) => n >= 0) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3], `SC-06 continue → drafts → teach and sell → badges (${order.join(' < ')})`);
  const newBtn = await button('＋  New curriculum');
  log(!!newBtn && newBtn.h <= 60, 'SC-06 "New curriculum" is a compact header button');
  await expect('🔒 Private', 'SC-10 the Studio list marks the conversion Private');
  log((await has('All rights reserved')) && !/ · © · /.test(await bodyText()), 'SC-23 licenses read "All rights reserved", not a bare ©');
  await expect('up to 30 families', 'SC-24 co-op classes say "up to 30 families"');
  log(!(await has('5–30 families')), 'SC-24 the old "5–30" is gone');
  await click('Continue editing');
  await expect(`Bare Plan ${run}`, 'SC-06 continue editing opens the draft');

  scenario('Not found');
  await goto('/studio/no-such-plan');
  await expect('Curriculum not found');
  await expect('It may have been deleted', 'SC-33 the empty state explains why');

  // ───────────────────────────── A family that also creates
  await load({ ...seed, help: [{ id: `h-${run}`, childId: ADA, createdAt: new Date().toISOString(), note: 'stuck' }] });
  scenario('Details tab');
  await goto('/studio/setup');
  await fillName('Creator or shop name', `Maple ${run}`);
  await click('Open my Studio');
  await goto('/studio/import');
  await fillName('Curriculum title', `Space Math ${run}`);
  await fillName('Units', '1');
  await fillName('Lessons per unit', '3');
  await click('Create', { exact: true });
  await expect('saved automatically');
  const gradeChips = await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"],[role="radio"]')].filter((e) => e.offsetParent && /^(Pre-K|K|\d{1,2})$/.test(e.innerText.trim())).length);
  log(gradeChips === 0, `SC-09 no rows of grade chips (${gradeChips})`);
  await clickLabel('From: higher grade');
  await clickLabel('From: higher grade');
  await clickLabel('From: higher grade');
  await expect('Grades: 4th Grade to 4th Grade', 'SC-09 the From stepper moves the range (and To follows)');
  let p = await pkgNamed(`Space Math ${run}`);
  log(p?.gradeMin === 4 && p.gradeMax === 4, `SC-09 grade range saved (${p?.gradeMin}–${p?.gradeMax})`);
  await clickLabel('To: higher grade');
  log((await pkgNamed(`Space Math ${run}`))?.gradeMax === 5, 'SC-09 the To stepper widens the range');
  const sib = await byLabel('Siblings can do it together');
  log(sib?.role === 'switch' && sib.checked === 'false', 'SC-09 "Siblings can do it together" is its own switch');
  await clickLabel('Siblings can do it together');
  log((await pkgNamed(`Space Math ${run}`))?.familyStyle === true && (await byLabel('Siblings can do it together'))?.checked === 'true', 'SC-09 the switch turns family style on');
  const involvement = await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].filter((e) => e.offsetParent).length);
  log(involvement >= 3, `SC-09 parent involvement is a pick-one group (${involvement} radios)`);
  await expect('Lessons per week', 'SC-09 shorter "Lessons per week" label');
  log(!(await has('Suggested lessons per week')), 'SC-09 the long label is gone');
  await fillName('Description', 'Rockets, orbits, and planets as a way into multiplication.');
  await click('🧮 Math');

  scenario('Lessons tab');
  await click('📚 Lessons (3)');
  await expect('1. Lesson 1');
  const arrows = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Move lesson"]')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  log(arrows.length >= 4 && arrows.every(([w, h]) => w >= 44 && h >= 44), `SC-21 reorder arrows are 44 pt targets (${arrows.map(([w, h]) => `${Math.round(w)}×${Math.round(h)}`).slice(0, 2).join(', ')})`);
  await click('1. Lesson 1');
  await expect('Save lesson');
  const folds = await page.evaluate(() => [...document.querySelectorAll('[aria-expanded]')].filter((e) => e.offsetParent).map((e) => [e.innerText.split('\n')[1] ?? e.innerText, e.getAttribute('aria-expanded')]));
  log(folds.length >= 4 && folds.every(([, x]) => x === 'false'), `SC-08 the long lesson form is folded into sections, closed (${folds.map(([t]) => t.trim()).join(', ')})`);
  const save = await button('Save lesson');
  log(!!save && save.top >= 0 && save.bottom <= save.vh, `SC-08/SC-03 "Save lesson" is in view without scrolling (${Math.round(save?.top)}–${Math.round(save?.bottom)} of ${save?.vh})`);
  await click('Worksheet & answer key');
  await fillName('Worksheet questions (one per line, optional)', 'What is 12 ÷ 4?');
  const ph = await page.evaluate(() => [...document.querySelectorAll('textarea')].find((e) => e.offsetParent && e.getAttribute('aria-label')?.startsWith('Answer key'))?.getAttribute('placeholder'));
  log(ph?.includes('One answer per line') && ph.includes('12 ÷ 4 = 3'), `SC-27 the answer key placeholder explains itself ("${ph?.split('\n')[0]}")`);
  const saveAfter = await button('Save lesson');
  log(!!saveAfter && saveAfter.bottom <= saveAfter.vh, 'SC-08 Save stays pinned after opening a section');
  await click('Save lesson');
  await expectNot('Save lesson');

  await click('📋 Paste more lessons');
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('textarea')].filter((e) => e.offsetParent).at(-1);
    el.setAttribute('data-paste', '1');
  });
  await page.focus('[data-paste="1"]');
  await page.keyboard.type('Unit 2: Planets\nMercury\nVenus');
  await expect('2 lessons in 1 unit', 'SC-28 "2 lessons in 1 unit", not "1 units"');
  await clickLabel('Close');
  await expect('Discard the lessons you pasted?', 'SC-03 closing the paste sheet with text asks first');
  await click('Keep editing', { exact: true });
  await click('Add 2 lessons');
  await expect('5. Venus');

  scenario('Publish');
  await click('🚀 Publish');
  await click('Publish to the Marketplace');
  await expect('is live in the Marketplace', 'SC-04 publishing confirms it’s live');
  await expect(`Space Math ${run} v1 is live`);
  await shot('published');
  const upd = await button('Publish update (v2)');
  log(upd?.disabled === true, 'SC-04 "Publish update" is off right after publishing');
  await expect('No changes since v1', 'SC-04 and says why');
  log(!(await has('What’s new in this update')), 'SC-04 no release-note field without changes');
  log(!!(await button('View listing')) && (await has('Copy link')), 'SC-04 the success card offers View listing and Copy link');
  await click('📝 Details');
  await fillName('Title', `Space Math ${run}!`);
  await click('🚀 Publish');
  await expect('What’s new in this update', 'SC-04 an edit brings back the release note');
  log((await button('Publish update (v2)'))?.disabled === false, 'SC-04 an edit makes the update available');

  scenario('Promotions');
  await goto('/studio/promotions');
  await expect('Families always pay the price you set here', 'SC-25 plain promise about prices');
  log(!(await has('worked out by Freerange')), 'SC-25 no system jargon');
  await click('New coupon');
  const example = await page.evaluate(() => [...document.querySelectorAll('input')].find((e) => e.offsetParent && e.getAttribute('aria-label') === 'Last day it works (optional)')?.getAttribute('placeholder'));
  const m = example?.match(/(\d\d)\/(\d\d)\/(\d{4})/);
  const exDate = m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
  log(!!exDate && exDate > new Date(), `SC-26 the expiry example is a future date (${example})`);
  const reason = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.startsWith('Still needed:')).at(-1);
    el?.scrollIntoView({ block: 'center' });
    const r = el?.getBoundingClientRect();
    return r ? { l: r.left, r: r.right, vw: innerWidth } : null;
  });
  log(!!reason && reason.l >= 0 && reason.r <= reason.vw, 'SC-01 the coupon sheet’s "Still needed" fits on screen');
  await clickLabel('Close');

  scenario('Co-op class');
  await goto('/studio/classes');
  await click(`Space Math ${run}`);
  await fillName('Room for how many families? (up to 30)', '3');
  await click('Start the class');
  await expect('Invite code', 'class page');
  await page.browserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await click('Copy link', { exact: true });
  await expect('Copied ✓', 'SC-13 copying the invite link confirms it');
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  log(clip.includes('/coop/'), `SC-13 the link is on the clipboard (${clip})`);
  await click('Copy code', { exact: true });
  const code = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  log(/^[A-Z0-9-]{6,}$/.test(code), `SC-13 the code is on the clipboard (${code})`);
  const sw = await byLabel('Open to new families');
  log(sw?.role === 'switch' && sw.checked === 'true', 'SC-14 open/closed is a labelled switch');
  log((await button('Save settings'))?.disabled === true, 'SC-14 nothing to save yet');
  await clickLabel('Open to new families');
  await expect('open to new families', 'SC-14 the switch alone changes nothing yet');
  log((await bodyText()).includes('lessons · open to new families'), 'SC-14 class still open until Save');
  await click('Save settings', { exact: true });
  await expect('closed to new families', 'SC-14 Save applies the switch');
  await click('New invite code', { exact: true });
  await expect('Make a new invite code?');
  const styles = await page.evaluate(() => {
    const bg = (t) => { const b = [...document.querySelectorAll('[role="button"]')].reverse().find((e) => e.offsetParent && e.innerText.trim() === t); return b ? getComputedStyle(b.firstElementChild ?? b).backgroundColor : null; };
    return { code: bg('New code'), cancel: bg('Cancel') };
  });
  const endBg = await page.evaluate(() => { const b = [...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.trim() === 'End the class'); return b ? getComputedStyle(b.firstElementChild ?? b).backgroundColor : null; });
  log(!!styles.code && styles.code !== endBg, `SC-14 "New code" isn’t styled as destructive (${styles.code} vs ${endBg})`);
  await click('Cancel', { exact: true });
  const sections = await page.evaluate(() => [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === 'End the class').length);
  log(sections >= 2, 'SC-14 "End the class" has its own section');

  scenario('Spreadsheet and web import');
  await goto('/studio/import?from=sheet');
  await fillName('Curriculum title', `Sheet ${run}`);
  await fillName('Lesson rows', 'Unit,Lesson,Pages\nAnimals,Mammals,4-9\nbogus line without commas\nAnimals,Birds,10-12');
  await expect('1 row couldn’t be read (row 3)', 'SC-11 a dropped row is reported');
  await goto('/studio/import?from=web');
  await expect('a Project Gutenberg book, or an archive.org scan', 'SC-12 Gutenberg and archive.org are mentioned');
  await click('Can’t load the page? Enter the details myself');
  await expect('Your plan', 'SC-29 the plan’s title sits in its own section');
  const gap = await page.evaluate(() => {
    const leaf = (t) => [...document.querySelectorAll('div')].find((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim().startsWith(t))?.getBoundingClientRect();
    const a = leaf('Unsure or all-rights-reserved');
    const b = leaf('Your plan’s title');
    return a && b ? b.top - a.bottom : null;
  });
  log(gap !== null && gap >= 24, `SC-29 space between the license note and the plan title (${Math.round(gap)} px)`);
  const r2 = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.startsWith('Still needed:')).at(-1);
    el?.scrollIntoView({ block: 'center' });
    const r = el?.getBoundingClientRect();
    return r ? r.left >= 0 && r.right <= innerWidth : false;
  });
  log(r2, 'SC-01 the web import "Still needed" fits on screen');

  scenario('Preview field trip');
  await goto('/community');
  await click('🚌 Field trips');
  await click('Organize');
  await fillName('Title', `Fossil walk ${run}`);
  await expect('a start time', 'SC-15 a start time is required');
  await fillName('Start time', '10:00 AM');
  await fillName('Location (public meeting place)', 'Museum steps');
  await fillName('Details (optional)', 'Bring water and a sketchbook.');
  await click('Create', { exact: true });
  await expect(`Fossil walk ${run}`);
  await expect('· 10 AM', 'SC-15 the card shows the start time');
  await expect('Ages: all', 'SC-15 "Ages: all", not "Ages All ages"');
  await expect('Bring water and a sketchbook.', 'SC-15 the card shows the details');
  log(!(await has('📍 TBD')), 'SC-15 no "TBD" places');

  scenario('Notifications (this device)');
  await goto('/notifications');
  await expect('Ada needs help');
  await expect('New', 'SC-20 unread notifications are grouped under New');
  log(!(await button('Mark read')), 'SC-20 no per-row "Mark read"');
  log(!(await bodyText()).includes('●'), 'SC-20 no "●" character for screen readers to read out');
  log(!!(await page.$('[aria-label="Unread"]')), 'SC-20 the unread dot is labelled "Unread"');
  await click('Mark all read', { exact: true });
  await expect('Earlier', 'SC-20 read ones move under Earlier');

  scenario('Moderation without access');
  await page.goto(`${BASE}/moderation`, { waitUntil: 'domcontentloaded' });
  let flashed = false;
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate(() => /Open reports|Badge applications/.test(document.body.innerText))) flashed = true;
    await sleep(100);
  }
  await expect('Moderators only');
  log(!flashed, 'SC-30 the moderator screen never shows before access is confirmed');
}

await finish(main, 'Studio & Community UX');
