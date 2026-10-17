// Headless smoke test of the Kinship web build: demo onboarding, every parent tab, kid flow.
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
const width = Number(process.env.W ?? 1280);
const height = Number(process.env.H ?? 900);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-first-run'],
});
const page = await browser.newPage();
await page.setViewport({ width, height });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

setTimeout(() => { console.log('WATCHDOG: timed out'); process.exit(2); }, 120000).unref?.();
page.setDefaultTimeout(15000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (text) => {
  console.log('click', text);
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('[role="button"],button,a,div[tabindex]')];
    const el = els.reverse().find((e) => e.innerText && e.innerText.trim().includes(t) && e.offsetParent !== null);
    if (!el) return false;
    el.click();
    return true;
  }, text);
  if (!ok) throw new Error(`No clickable element with text: ${text}`);
  await sleep(700);
};
const hasText = (t) => page.evaluate((t) => document.body.innerText.includes(t), t);
const shot = (name) => page.screenshot({ path: `${OUT}${name}-${width}.png`, fullPage: false });
const check = async (label, t) => { const ok = await hasText(t); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: "${t}"`); if (!ok) process.exitCode = 1; };

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(1500);
await check('welcome', 'Welcome to Kinship');
await shot('01-welcome');

await clickText('Explore with a demo family');
await sleep(1200);
await check('flight deck', 'Family Flight Deck');
await check('timeline kid', 'Maya');
await shot('02-today');

for (const [tab, expect] of [['Rhythm', 'Weekly Rhythm'], ['Curriculum', 'Beast Academy'], ['Compass', 'Homeschool Compass'], ['Community', 'Family finder']]) {
  await clickText(tab);
  await sleep(800);
  await check(`tab ${tab}`, expect);
  await shot(`03-${tab.toLowerCase()}`);
}

// Unit study generator
await clickText('Curriculum');
await clickText('Unit Study Generator');
await page.type('input[placeholder^="Space Exploration"]', 'Ancient Egypt');
await clickText('Generate');
await check('unit study', 'Day 10');

// Compass → NOI
await clickText('Compass');
await clickText('Notice of Intent');
await sleep(800);
await check('noi screen', 'Proof-of-mailing checklist');
await shot('04-noi');
await page.goBack();
await sleep(800);

// Kid mode: Maya has PIN 1111
await clickText('Today');
await clickText('Kid mode');
await check('kid picker', "Who's learning today?");
await shot('05-kid-picker');
await clickText('Leo');
await sleep(800);
await check('mood meter', 'How are you feeling today?');
await clickText('Happy');
await sleep(800);
await check('missions', 'My day');
await shot('06-kid-day');
await clickText('Lego / Sensory Play');
await sleep(800);
await check('activity card', 'Show your work');
await clickText("I'm done!");
await clickText('Mark complete');
await sleep(2500);
await check('back to day', 'My day');

// Help button → parent queue after exit with PIN
await clickText('for help');
await sleep(600);
await check('help sheet', 'While you wait');
await clickText('OK');
await clickText('Grown-up exit');
for (const d of '1234') await clickText(d);
await sleep(1200);
await check('parent help queue', 'Help queue (1 waiting)');
await shot('07-help-queue');

// Persistence across reload
await page.reload({ waitUntil: 'networkidle0' });
await sleep(1500);
await check('persisted after reload', 'Family Flight Deck');

console.log('\nConsole errors:', errors.length ? errors.slice(0, 15).join('\n') : 'none');
await browser.close();
