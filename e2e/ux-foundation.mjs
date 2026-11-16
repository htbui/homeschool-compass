// The shared UI foundations from the design review, checked in the DOM on the
// local-only build: inputs have accessible names and "e.g." placeholders; the
// "Still needed" line fits on a phone without pushing Cancel away; deep links get
// a back button that goes somewhere; chips and tabs announce their role and state
// and have 44 px hit boxes; deleting a task or lesson asks first; closing the
// lesson sheet with edits asks before discarding; and the device-only build never
// says "Sign in". Run against the local-only server, at desktop and phone size:
//   BASE_URL=http://localhost:8082 node e2e/ux-foundation.mjs
//   BASE_URL=http://localhost:8082 W=390 H=844 node e2e/ux-foundation.mjs
import { ADA, bodyText, click, clickLabel, expect, expectNot, finish, goto, has, load, log, OUT, page, run, scenario, seed, sleep, store, TODAY, W } from './compass-helpers.mjs';

const studio = () => page.evaluate(() => JSON.parse(localStorage.getItem('freerange-studio') ?? '{}').state ?? {});
const shot = (name) => page.screenshot({ path: `${OUT}ux-${name}-${W}.png` });

/** Visible inputs/textareas without an accessible name (aria-label or aria-labelledby). */
const unnamedInputs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('input,textarea')]
      .filter((e) => e.offsetParent !== null && e.type !== 'hidden')
      .filter((e) => !(e.getAttribute('aria-label') ?? '').trim() && !(e.getAttribute('aria-labelledby') ?? '').trim())
      .map((e) => e.outerHTML.slice(0, 120)),
  );
const visibleInputCount = () => page.evaluate(() => [...document.querySelectorAll('input,textarea')].filter((e) => e.offsetParent !== null).length);

async function expectNamedInputs(where) {
  await sleep(300);
  const n = await visibleInputCount();
  const bad = await unnamedInputs();
  log(n > 0 && bad.length === 0, `${where}: all ${n} inputs have accessible names${bad.length ? ` (unnamed: ${bad.join(' | ')})` : ''}`);
}

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

/** The header back button's label ("Back to Marketplace") and where it lands. */
async function backFrom(path, fallbackPath, label) {
  await goto(path);
  const name = `Back to ${label}`;
  const found = await page.waitForFunction((n) => [...document.querySelectorAll('[aria-label]')].some((e) => e.offsetParent && e.getAttribute('aria-label') === n), { timeout: 8000, polling: 100 }, name).then(() => true, () => false);
  log(found, `${path}: opened from a link, shows "‹ ${label}"`);
  if (!found) return;
  const box = await page.evaluate((n) => {
    const r = [...document.querySelectorAll('[aria-label]')].find((e) => e.offsetParent && e.getAttribute('aria-label') === n).getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left };
  }, name);
  log(box.h >= 44 && box.w >= 44 && box.left >= 0, `${path}: back button is a 44 px target on screen (${Math.round(box.w)}×${Math.round(box.h)})`);
  await clickLabel(name);
  const landed = await page.waitForFunction((p) => location.pathname === p, { timeout: 8000, polling: 100 }, fallbackPath).then(() => true, () => false);
  log(landed, `${path}: back goes to ${fallbackPath} (at ${await page.evaluate(() => location.pathname)})`);
}

/** Roles, states and hit-box heights of the controls matching a selector. */
const controls = (selector) =>
  page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).map((e) => ({
    text: e.innerText.trim().slice(0, 30),
    role: e.getAttribute('role'),
    checked: e.getAttribute('aria-checked'),
    selected: e.getAttribute('aria-selected'),
    h: e.getBoundingClientRect().height,
  })), selector);

async function main() {
  // ───────────────────────────── Accessible names and example placeholders
  scenario('Inputs are named (onboarding)');
  await page.goto(`${process.env.BASE_URL ?? 'http://localhost:8082'}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await goto('/onboarding/family');
  await expect('Family name');
  await expectNamedInputs('Family step');
  const ph = await page.evaluate(() => [...document.querySelectorAll('input')].filter((e) => e.offsetParent).map((e) => e.getAttribute('placeholder') ?? ''));
  log(ph.includes('e.g. The Miller Crew') && ph.includes('e.g. Dana Miller'), 'example names read as examples ("e.g. …")');
  const colors = await page.evaluate(() => {
    const el = [...document.querySelectorAll('input')].find((e) => e.offsetParent && e.getAttribute('placeholder')?.startsWith('e.g.'));
    return { placeholder: getComputedStyle(el, '::placeholder').color, text: getComputedStyle(el).color };
  });
  log(colors.placeholder !== colors.text, `placeholder color (${colors.placeholder}) differs from typed text (${colors.text})`);
  const described = await page.evaluate(() => [...document.querySelectorAll('input[aria-describedby]')].every((e) => document.getElementById(e.getAttribute('aria-describedby'))));
  log(described, 'hints are linked with aria-describedby');
  await fillName('Family name', `UX Crew ${run}`);
  log(await page.evaluate(() => [...document.querySelectorAll('input')].find((e) => e.getAttribute('aria-label') === 'Family name')?.value.startsWith('UX Crew')), 'the field can be found and filled by its name');

  await load(seed);
  scenario('Inputs are named (add child, NOI, hours)');
  await goto('/onboarding/kids');
  await click('Add a child');
  await expect('Birthdate');
  await expectNamedInputs('Add a child sheet');
  await clickLabel('Close');
  await goto('/records/noi');
  await expect('Home address');
  await expectNamedInputs('Notice of Intent');
  const addr = await page.evaluate(() => [...document.querySelectorAll('textarea,input')].find((e) => e.getAttribute('aria-label') === 'Home address')?.getAttribute('placeholder'));
  log(addr?.startsWith('e.g. '), `empty address shows an example, not a value ("${addr}")`);
  await goto('/records/hours');
  await expectNamedInputs('Hours');

  // ───────────────────────────── Disabled reason fits on a phone
  scenario('"Still needed" stays on screen');
  await goto('/market?view=selling');
  await click('List a curriculum', { exact: true });
  await expect('Still needed:', 'the sell sheet says what’s missing');
  const layout = await page.evaluate(() => {
    const reason = [...document.querySelectorAll('div')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.startsWith('Still needed:')).at(-1);
    const cancel = [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && e.innerText.trim() === 'Cancel').at(-1);
    const publish = [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && e.innerText.trim() === 'Publish listing').at(-1);
    reason?.scrollIntoView({ block: 'center' });
    const r = reason?.getBoundingClientRect();
    const c = cancel?.getBoundingClientRect();
    const p = publish?.getBoundingClientRect();
    return r && c && p ? { r: { l: r.left, r: r.right, t: r.top }, c: { l: c.left, r: c.right, b: c.bottom, w: c.width }, p: { b: p.bottom }, vw: window.innerWidth, full: reason.scrollWidth <= reason.clientWidth + 1 } : null;
  });
  log(!!layout, 'found the reason, Cancel and Publish');
  if (layout) {
    log(layout.r.l >= 0 && layout.r.r <= layout.vw, `the reason is fully inside the screen (${Math.round(layout.r.l)}–${Math.round(layout.r.r)} of ${layout.vw})`);
    log(layout.full, 'the reason isn’t clipped');
    log(layout.c.w > 0 && layout.c.l >= 0 && layout.c.r <= layout.vw, 'Cancel stays visible next to the disabled button');
    log(layout.r.t >= Math.max(layout.c.b, layout.p.b) - 1, 'the reason sits on its own line under the buttons');
  }
  await shot('still-needed');
  await click('Cancel', { exact: true });

  // ───────────────────────────── Deep links get a way out
  scenario('Back from deep links');
  // Studio pages need a creator profile (otherwise they send you to set one up).
  await goto('/studio/setup');
  await fillName('Creator or shop name', `UX Studio ${run}`);
  await click('Open my Studio');
  await expect(`UX Studio ${run}`);
  await backFrom('/listing/l-lib-viking-tales', '/market', 'Marketplace');
  await backFrom('/gift/ZZZZZ-ZZZZZ', '/market', 'Marketplace');
  await backFrom('/bundle/no-such-bundle', '/market', 'Marketplace');
  await backFrom('/creator/someone-else', '/market', 'Marketplace');
  await backFrom('/studio/badge', '/studio', 'Studio');
  await backFrom('/studio', '/today', 'Today');
  await backFrom('/account', '/settings', 'Settings');
  await backFrom('/records/noi', '/compliance', 'Compass');
  await backFrom('/notifications', '/today', 'Today');
  // Opened from inside the app, it's a normal back.
  await goto('/compliance');
  await click('Notice of Intent');
  await expect('Back', 'pushed screen shows a back button');
  await clickLabel('Back');
  log(await page.waitForFunction(() => location.pathname === '/compliance', { timeout: 5000 }).then(() => true, () => false), 'back returns to the screen it came from');

  // ───────────────────────────── Roles, states and touch targets
  scenario('Chips and tabs');
  await goto('/market');
  await expect('Browse');
  const tabs = await controls('[role="tab"]');
  log(tabs.length >= 3 && (await page.$('[role="tablist"]')) !== null, `market tabs are a tablist with ${tabs.length} tabs`);
  const perList = await page.evaluate(() => [...document.querySelectorAll('[role="tablist"]')].filter((e) => e.offsetParent).map((l) => [...l.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('aria-selected'))));
  log(perList.length > 0 && perList.every((l) => l.filter((x) => x === 'true').length === 1 && l.every((x) => x === 'true' || x === 'false')), `each tablist has exactly one aria-selected tab (${perList.map((l) => l.join('/')).join(' · ')})`);
  log(tabs.every((t) => t.h >= 44), `tabs are ≥ 44 px tall (${tabs.map((t) => Math.round(t.h)).join(', ')})`);
  const chips = await controls('[role="checkbox"],[role="radio"]');
  log(chips.length > 3, `filter chips are checkboxes/radios (${chips.length})`);
  log(chips.every((c) => c.checked === 'true' || c.checked === 'false'), 'every chip says whether it’s checked');
  log(chips.every((c) => c.h >= 44), `chips are ≥ 44 px tall (min ${Math.round(Math.min(...chips.map((c) => c.h)))})`);
  const before = chips.find((c) => c.checked === 'false');
  if (before) {
    await click(before.text, { exact: true });
    const after = (await controls('[role="checkbox"],[role="radio"]')).find((c) => c.text === before.text);
    log(after?.checked === 'true', `tapping "${before.text}" checks it`);
    await click(before.text, { exact: true });
  }
  await goto('/today');
  await expect('Task');
  const small = await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && /^＋\s+Task$/.test(e.innerText.trim())).map((e) => e.getBoundingClientRect().height));
  log(small.length === 1 && small[0] >= 44, `small "＋ Task" button has a 44 px hit box (${small.map(Math.round)})`);
  const cards = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Fraction practice"]')].filter((e) => e.offsetParent).map((e) => e.getAttribute('role')));
  log(cards.length > 0 && cards.every((r) => r === 'button'), 'tappable task cards are buttons for screen readers');

  // ───────────────────────────── Deleting asks first
  scenario('Delete a task asks first');
  await click('Fraction practice');
  await click('More…', { exact: true }); // Delete is tucked under More (C-07)
  await expect('Delete task');
  await click('Delete task', { exact: true });
  await expect('Delete “Fraction practice”', 'asks before deleting the task');
  await click('Cancel', { exact: true });
  await expectNot('Delete “Fraction practice”', 'cancel closes the question');
  log((await store()).tasks.some((t) => t.date === TODAY && t.blockId === 'b-frac' && t.childId === ADA), 'cancel keeps the task');
  await click('Delete task', { exact: true });
  await click('Delete', { exact: true });
  await sleep(400);
  log(!(await store()).tasks.some((t) => t.date === TODAY && t.blockId === 'b-frac'), 'confirming deletes it');

  scenario('Lesson sheet: discard and delete');
  await goto('/studio/import');
  await fillName('Curriculum title', `UX Lessons ${run}`);
  await fillName('Units', '1');
  await fillName('Lessons per unit', '3');
  await click('Create', { exact: true });
  await expect('saved automatically');
  await click('📚 Lessons (3)');
  await click('1. Lesson 1');
  await expect('Save lesson');
  // Delete is kept apart from Save.
  const apart = await page.evaluate(() => {
    const b = (t) => [...document.querySelectorAll('[role="button"]')].filter((e) => e.offsetParent && e.innerText.trim() === t).at(-1)?.getBoundingClientRect();
    const d = b('Delete lesson');
    const s = b('Save lesson');
    return d && s ? Math.max(s.left - d.right, d.top - s.bottom, s.top - d.bottom) : -1;
  });
  log(apart >= 24, `Delete lesson sits apart from Save (${Math.round(apart)} px)`);
  // Untouched: closing just closes.
  await clickLabel('Close');
  await expectNot('Save lesson', 'an untouched lesson closes without asking');
  await click('1. Lesson 1');
  await fillName('Title', 'Rocket count');
  await clickLabel('Close');
  await expect('Discard your changes to this lesson?', 'closing with edits asks first');
  await click('Keep editing', { exact: true });
  const kept = await page.evaluate(() => [...document.querySelectorAll('input')].find((e) => e.offsetParent && e.getAttribute('aria-label') === 'Title')?.value);
  log(kept === 'Rocket count', 'keep editing keeps the typed title');
  await clickLabel('Close dialog');
  await expect('Discard your changes to this lesson?', 'tapping outside asks too');
  await click('Discard', { exact: true });
  await expectNot('Save lesson', 'discard closes the sheet');
  let pkg = (await studio()).packages?.find((p) => p.title === `UX Lessons ${run}`);
  log(pkg?.units[0].lessons[0].title === 'Lesson 1', 'discarded edits aren’t saved');
  await click('1. Lesson 1');
  await click('Delete lesson', { exact: true });
  await expect('Delete “Lesson 1”?', 'asks before deleting the lesson');
  await shot('delete-lesson');
  await click('Cancel', { exact: true });
  await expectNot('Delete “Lesson 1”?');
  pkg = (await studio()).packages?.find((p) => p.title === `UX Lessons ${run}`);
  log(pkg?.units[0].lessons.length === 3, 'cancel keeps the lesson');
  await click('Delete lesson', { exact: true });
  await click('Delete lesson', { exact: true });
  await sleep(500);
  pkg = (await studio()).packages?.find((p) => p.title === `UX Lessons ${run}`);
  log(pkg?.units[0].lessons.length === 2 && !pkg.units[0].lessons.some((l) => l.title === 'Lesson 1'), 'confirming deletes the lesson');

  // ───────────────────────────── Device-only wording
  scenario('Local build never says "Sign in"');
  for (const [path, text] of [
    ['/studio', 'This copy of Freerange keeps everything on this device'],
    ['/studio/classes', 'This copy of Freerange keeps everything on this device'],
    ['/studio/promotions', null],
    ['/community', 'sample network'],
    ['/messages', null],
    ['/messages/some-family', null],
    ['/market', 'connected app'],
    ['/settings', null],
    ['/creator/someone-else', 'Creator storefronts need the live Marketplace'],
  ]) {
    await goto(path);
    if (text) await expect(text, `${path}: explains the device-only copy`);
    else await sleep(500);
    const said = (await bodyText()).match(/[^.\n]*\bsign(ed)? in\b[^.\n]*/i)?.[0];
    log(!said, `${path}: no "Sign in" wording${said ? ` (found: "${said.trim()}")` : ''}`);
  }
  // A tappable card that holds its own buttons must not become a button itself (nested <button>s).
  for (const path of ['/notifications', '/market', '/settings', '/compliance']) {
    await goto(path);
    log((await page.$$('button button')).length === 0, `${path}: no buttons inside buttons`);
  }
  await goto('/listing/l-lib-viking-tales');
  await expect('What\'s inside');
  log(!(await has('More from')), 'no storefront link that would lead to a dead end');
  await goto('/community');
  await click('Request to connect');
  await expect('This is a sample family, so no request is sent', 'preview connect says nothing was sent');
  log(!(await has('Request sent')), 'preview doesn’t pretend a request went out');
}

await finish(main, 'UX foundation');
