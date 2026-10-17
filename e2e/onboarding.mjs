// Headless test of the real onboarding path for a new family.
import puppeteer from 'puppeteer-core';

const OUT = new URL('./screenshots/', import.meta.url).pathname;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
setTimeout(() => { console.log('WATCHDOG'); process.exit(2); }, 120000).unref();
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 900 });
page.setDefaultTimeout(15000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (text, exact = false) => {
  const ok = await page.evaluate((t, exact) => {
    const els = [...document.querySelectorAll('[role="button"],button,a,div[tabindex]')].reverse();
    const el = els.find((e) => e.offsetParent !== null && e.innerText && (exact ? e.innerText.trim() === t : e.innerText.trim().includes(t)));
    if (!el) return false;
    el.click();
    return true;
  }, text, exact);
  if (!ok) throw new Error(`No clickable: ${text}`);
  await sleep(500);
};
const typeInto = async (placeholderOrIndex, text) => {
  const handles = await page.$$('input, textarea');
  const visible = [];
  for (const h of handles) if (await h.evaluate((e) => e.offsetParent !== null)) visible.push(h);
  const h = typeof placeholderOrIndex === 'number' ? visible[placeholderOrIndex] : await page.$(`input[placeholder="${placeholderOrIndex}"]`);
  await h.click({ clickCount: 3 });
  await h.type(text);
};
const check = async (label, t) => { const ok = await page.evaluate((t) => document.body.innerText.includes(t), t); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) process.exitCode = 1; };

await page.goto(process.env.BASE_URL ?? 'http://localhost:8081', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(process.env.BASE_URL ?? 'http://localhost:8081', { waitUntil: 'networkidle0' });
await sleep(1200);
await clickText('Set up my family');
await typeInto(0, 'The Nguyen Family');
await typeInto(1, 'Linh Nguyen');
await typeInto(2, '4321');
await typeInto(3, '19103'); // Philadelphia → PA, high regulation
await sleep(400);
await check('zip → state radar (PA)', 'Pennsylvania Legal Radar');
await check('PA high regulation', 'High regulation');
await clickText('Continue', true);
await check('kids step', 'Your learners');

for (const [name, dob] of [['Ava', '2020-04-02'], ['Ben', '2016-09-15']]) {
  await sleep(300);
  if (name !== 'Ava') await clickText('Add a child');
  await typeInto('Maya', name);
  await typeInto('YYYY-MM-DD', dob);
  await clickText('Add child', true);
}
await check('two kids added', 'Ben');
await clickText('Continue to style quiz');
for (let i = 0; i < 15; i++) {
  // Always pick the first option.
  const ok = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('div[tabindex]')].filter((e) => e.offsetParent && e.innerText && e.innerText.length > 12 && !/Previous|Next|Back/.test(e.innerText));
    if (!opts[0]) return false;
    opts[0].click();
    return true;
  });
  if (!ok) throw new Error(`quiz q${i + 1}`);
  await sleep(350);
}
await sleep(800);
await check('results', 'Your homeschool style');
await check('rhythm preview', 'Recommended daily rhythm');
await page.screenshot({ path: `${OUT}10-results.png` });
await clickText('Start homeschooling with Kinship');
await sleep(1200);
await check('landed on flight deck', 'Family Flight Deck');
await check('compliance radar NOI', 'Notice of Intent not filed yet');
await page.screenshot({ path: `${OUT}11-new-family-today.png` });
console.log('Console errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
