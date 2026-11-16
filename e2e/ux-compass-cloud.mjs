// C-05 with a real account (local Supabase + its Mailpit mail catcher): show/hide password,
// "Forgot password?" → reset email → new password, and changing the password and email
// from the signed-in screen. Run against the cloud web build, at desktop and phone size:
//   BASE_URL=http://localhost:8081 node e2e/ux-compass-cloud.mjs
//   BASE_URL=http://localhost:8081 W=390 H=844 node e2e/ux-compass-cloud.mjs
// MAILPIT_URL defaults to the local stack's mail catcher (supabase/config.toml [inbucket]).
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const MAIL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:55424';
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 900);
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const EMAIL = `ux-reset-${run}@example.test`;
const NEW_EMAIL = `ux-moved-${run}@example.test`;
const PW1 = 'first-pass-1';
const PW2 = 'second-pass-2';
const PW3 = 'third-pass-3';

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 300000).unref();
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
page.setDefaultTimeout(15000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

let failures = 0;
let section = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] ${label}`); if (!ok) failures++; };
const scenario = (name) => { section = name; console.log(`\n— ${name} (${W}×${H})`); };
const has = async (t) => (await page.evaluate(() => document.body.innerText)).includes(t);
async function waitFor(t, ms = 15000) {
  return page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms, polling: 200 }, t).then(() => true, () => false);
}
const expect = async (t, label = `shows "${t}"`, ms) => log(await waitFor(t, ms), label);
async function click(text, { exact = false } = {}) {
  for (const end = Date.now() + 8000; Date.now() < end; await sleep(250)) {
    const ok = await page.evaluate((t, exact) => {
      const el = [...document.querySelectorAll('[role="button"],button,a,[tabindex]')].reverse().find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)) && e.getAttribute('aria-disabled') !== 'true');
      el?.click();
      return !!el;
    }, text, exact);
    if (ok) return sleep(450);
  }
  throw new Error(`[${section}] nothing clickable with text "${text}"`);
}
/** Type into the last visible input with this accessible name. */
async function fillName(name, text) {
  const h = await page.waitForFunction((n) => [...document.querySelectorAll('input,textarea')].filter((e) => e.offsetParent !== null && e.getAttribute('aria-label') === n).at(-1), { timeout: 8000, polling: 100 }, name);
  await h.evaluate((e) => { e.focus(); e.select?.(); });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text);
  await sleep(150);
}
const inputType = (name) => page.evaluate((n) => [...document.querySelectorAll('input')].filter((e) => e.offsetParent && e.getAttribute('aria-label') === n).at(-1)?.type, name);

async function signIn(email, password) {
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle0' });
  await waitFor('Sign in to Freerange');
  await fillName('Email', email);
  await fillName('Password', password);
  await click('Sign in', { exact: true });
}
async function signOut() {
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle0' });
  await waitFor('Sign out');
  await click('Sign out', { exact: true });
  await waitFor('Sign in to Freerange');
}

/** The newest email to an address, from the local mail catcher (Mailpit API). */
async function latestMail(to, after) {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=5`).then((x) => x.json()).catch(() => null);
    const m = r?.messages?.find((x) => Date.parse(x.Created) >= after);
    if (m) return fetch(`${MAIL}/api/v1/message/${m.ID}`).then((x) => x.json());
    await sleep(500);
  }
  return null;
}

async function main() {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());

  scenario('C-05 Show password');
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle0' });
  await expect('Sign in to Freerange');
  await fillName('Password', PW1);
  log((await inputType('Password')) === 'password', 'C-05 hidden by default');
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Show password"]')].at(-1)?.click());
  await sleep(200);
  log((await inputType('Password')) === 'text', 'C-05 "Show" reveals it');
  const eye = await page.evaluate(() => { const r = [...document.querySelectorAll('[aria-label="Hide password"]')].at(-1)?.getBoundingClientRect(); return r && { w: r.width, h: r.height }; });
  log(eye && eye.h >= 44 && eye.w >= 44, `C-05 the toggle is a 44 px target (${eye && `${Math.round(eye.w)}×${Math.round(eye.h)}`})`);
  await expect('Forgot password?', 'C-05 "Forgot password?" under the password');

  scenario('C-05 Create an account, change the password');
  await click('Create account', { exact: true });
  await fillName('Email', EMAIL);
  await fillName('Password', PW1);
  await click('Create account', { exact: true });
  await expect('Sign-in details', 'C-05 signed in, with sign-in details');
  await expect(EMAIL);
  await click('Change password', { exact: true });
  await fillName('New password', PW2);
  await fillName('New password again', 'not-the-same');
  await expect('the same password twice', 'C-05 the new password must match');
  await fillName('New password again', PW2);
  await click('Save new password', { exact: true });
  await expect('Password changed ✓', 'C-05 the password can be changed');
  await signOut();
  await signIn(EMAIL, PW1);
  await expect('That email and password don’t match', 'C-05 the old password no longer works');
  await fillName('Password', PW2);
  await click('Sign in', { exact: true });
  await expect('Sign-in details', 'C-05 the new password signs in');

  scenario('C-05 Forgot password');
  await signOut();
  await click('Forgot password?');
  await expect('Reset your password');
  await fillName('Email', EMAIL);
  const sentAt = Date.now() - 2000;
  await click('Email me a reset link', { exact: true });
  await expect('a reset link is on its way', 'C-05 the reset email is sent');
  const mail = await latestMail(EMAIL, sentAt);
  log(!!mail, 'C-05 the reset email arrives');
  const link = (mail?.Text ?? '').match(/https?:\/\/\S+\/auth\/v1\/verify\?\S+/)?.[0] ?? (mail?.HTML ?? '').match(/href="([^"]+\/auth\/v1\/verify[^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  log(!!link && /type=recovery/.test(link), 'C-05 it holds a recovery link');
  log(link?.includes(encodeURIComponent(`${BASE}/account`)) || link?.includes(`${BASE}/account`), 'C-05 the link asks to come back to this app’s account screen');
  // Follow the link like a browser, but land on this build (the local stack only allows its default port).
  const res = await fetch(link, { redirect: 'manual' });
  const hash = (res.headers.get('location') ?? '').split('#')[1] ?? '';
  log(/access_token=/.test(hash) && /type=recovery/.test(hash), 'C-05 the link signs the parent in for a reset');
  // A fresh page load, as when the email link opens the app (not just a hash change).
  await page.goto('about:blank');
  await page.goto(`${BASE}/account#${hash}`, { waitUntil: 'networkidle0' });
  await expect('Choose a new password', 'C-05 the app asks for a new password');
  await fillName('New password', PW3);
  await fillName('New password again', PW3);
  await click('Save new password', { exact: true });
  await waitFor('Password changed ✓');
  log(!(await has('Choose a new password')), 'C-05 the reset is done');
  await signOut();
  await signIn(EMAIL, PW3);
  await expect('Sign-in details', 'C-05 the reset password signs in');

  scenario('C-05 Change email');
  await click('Change email', { exact: true });
  await fillName('New email', EMAIL);
  await expect('That’s already your email', 'C-05 the same email is caught');
  await fillName('New email', NEW_EMAIL);
  await click('Change email', { exact: true });
  const moved = await waitFor('sent a confirmation link') || (await has(`Your sign-in email is now ${NEW_EMAIL}`));
  log(moved, 'C-05 an email change is confirmed by link (or done)');

  scenario('C-18 Back path');
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle0' });
  const back = await page.waitForFunction(() => [...document.querySelectorAll('[aria-label^="Back to"]')].some((e) => e.offsetParent), { timeout: 8000 }).then(() => true, () => false);
  log(back, 'C-18 /account opened from a link has a back button');
}

try {
  await main();
} catch (e) {
  failures++;
  console.log(`FAIL [${section}] ${e.message}`);
  await page.screenshot({ path: new URL(`./screenshots/ux-compass-cloud-${W}-failure.png`, import.meta.url).pathname }).catch(() => {});
}
const relevant = errors.filter((e) => !/DevTools|Download the React|status of 400|status of 422|status of 401|status of 429/.test(e));
console.log(`\n${failures ? `❌ ${failures} failure(s)` : '✅ all Compass UX cloud scenarios passed'} · console errors: ${relevant.length}`);
for (const e of relevant.slice(0, 10)) console.log('  ', e.slice(0, 300));
await browser.close();
process.exit(failures || relevant.length ? 1 : 0);
