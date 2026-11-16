// Compass radar & records journeys on the local-only web build: the radar
// follows what the family does (finished work, logged hours, the NOI), and
// follows the state's rules. Seeded family from compass-helpers.mjs.
// Run: `EXPO_PUBLIC_FREERANGE_LOCAL_ONLY=1 npx expo start --web --port 8091`, then
// `BASE_URL=http://localhost:8091 node e2e/compass-records.mjs` (W=390 H=844 for phone size).
import { ADA, BEN, bodyText, click, clickLabel, expect, expectNot, fill, finish, goTab, goto, load, log, OUT, page, scenario, seed, sleep, store, TODAY, W } from './compass-helpers.mjs';

/** Fill the input that follows a label's text. */
async function fillLabel(label, text) {
  const id = await page.evaluate((label) => {
    const l = [...document.querySelectorAll('div,span')].filter((e) => e.offsetParent && e.childElementCount === 0 && e.innerText.trim() === label).at(-1);
    for (let n = l, i = 0; n && i < 4; i++, n = n.parentElement) {
      const input = n.parentElement?.querySelector('input,textarea');
      if (input) { const tag = `x${Math.random().toString(36).slice(2)}`; input.setAttribute('data-e2e', tag); return tag; }
    }
    return null;
  }, label);
  if (!id) throw new Error(`no input for label "${label}"`);
  const h = await page.$(`[data-e2e="${id}"]`);
  await h.evaluate((e) => { e.focus(); e.select?.(); });
  await page.keyboard.press('Backspace');
  if (text) await page.keyboard.type(text);
  await sleep(150);
}
// Radar lines: 📌 to do, ⏳ behind pace, ✓ on track or done, ℹ️ nothing required.
const radar = () => page.evaluate(() => document.body.innerText.split('\n').filter((l) => /^(📌|⏳|✓|ℹ️) /.test(l.trim())).map((l) => l.trim()));
const short = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

async function journeys() {
  await load(seed);

  scenario('Compass radar: a new Colorado family');
  await goTab('Compass');
  await expect('Homeschool Compass');
  let r = await radar();
  log(r.includes('📌 File your Notice of Intent'), 'NOI to do');
  log(r.includes('⏳ Days: 1 of 172'), `yesterday’s finished reading counts as a day (${r.find((x) => x.includes('Days:'))})`);
  log(r.includes('⏳ Hours: 0 of 688 (lowest child)'), 'hours for the lowest child');
  log(r.includes('📌 Plan this year’s assessment / evaluation'), 'Colorado testing reminder');
  log(r.some((x) => x === '📌 Not in your plan yet: History, Civics & citizenship, Science'), `missing subjects (${r.find((x) => x.includes('Not in your plan'))})`);
  await expect('Colorado asks for History, Civics & citizenship and Science', 'subject coverage sentence');
  await page.screenshot({ path: `${OUT}compass-${W}-radar.png` });

  scenario('Finishing work counts today');
  await goTab('Today');
  const label = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') ?? '').startsWith('Silent reading,'))?.getAttribute('aria-label'));
  await clickLabel(label);
  await click('Mark done ✓');
  await page.keyboard.press('Escape');
  await click('Close', { exact: false }).catch(() => {});
  await goTab('Compass');
  await expect('Days: 2 of 172', 'today now counts');

  scenario('Hours: logged per child, lowest child counts');
  await click('Hours & Attendance');
  await expect('Log off-app learning');
  await click('🦖 Ben', { exact: true }); // log for Ada only
  await fillLabel('Minutes', '120');
  await fill('Swim lessons, museum field trip…', 'Swim team');
  await click('Add log', { exact: true });
  await expect('Swim team');
  const s1 = await store();
  log(s1.hoursLogs.length === 1 && s1.hoursLogs[0].childId === ADA && s1.hoursLogs[0].date === TODAY, 'one log, for Ada, today');
  await page.goBack(); await sleep(700);
  r = await radar();
  log(r.includes('⏳ Hours: 0 of 688 (lowest child)'), 'Ben still has 0 hours, so the radar stays at 0');
  log((await bodyText()).includes('3 of 688 hrs'), 'Ada’s card shows her 3 of 688 hrs (two readings + 2 h swim)');
  await click('Hours & Attendance');
  await click('🦉 Ada', { exact: true }); // the form opens with both kids picked: log for Ben only
  await fillLabel('Minutes', '90');
  await click('Add log', { exact: true });
  await sleep(300);
  await page.goBack(); await sleep(700);
  r = await radar();
  log(r.includes('⏳ Hours: 2 of 688 (lowest child)'), `Ben’s 1.5 h now leads the radar (${r.find((x) => x.includes('Hours:'))})`);

  scenario('NOI: sign, mail, unsign');
  await click('Notice of Intent');
  await expect('Colorado requires notice');
  await fill('e.g. 123 Maple St, Denver, CO 80202', '12 Oak Lane\nDenver, CO 80202');
  await fillLabel('Type your full legal name to sign', 'Pat Lee');
  await click('Sign letter ✍️');
  await expect('Unsign');
  await page.goBack(); await sleep(700);
  await expect(`NOI signed ${short(TODAY)}`, 'radar shows the signature date');
  await click('Notice of Intent');
  await click('Sent via certified mail');
  await page.goBack(); await sleep(700);
  await expect(`NOI signed ${short(TODAY)} & mailed`, 'mailing recorded');
  await click('Notice of Intent');
  await fillLabel('Type your full legal name to sign', 'Pat Lee Jr');
  log(!(await store()).noi.signedAt, 'editing the signature un-signs the letter');
  await page.goBack(); await sleep(700);
  await expect('File your Notice of Intent');

  scenario('Another state, other rules');
  await load({ ...seed, family: { ...seed.family, stateCode: 'TX' } });
  await goTab('Compass');
  r = await radar();
  log(r.includes('ℹ️ Texas: no notice required'), `Texas needs no notice (${r.join(' | ')})`);
  log(!r.some((x) => x.includes('Days:') || x.includes('Hours:')), 'no day or hour count in Texas');
  log(r.some((x) => x.includes('Not in your plan yet: Spelling & grammar, Civics & citizenship') || x.includes('Not in your plan yet: Civics')), `Texas subjects (${r.at(-1)})`);
  await click('Notice of Intent');
  await expect("Texas doesn't require a notice");
  await page.goBack(); await sleep(700);
  await load({ ...seed, family: { ...seed.family, stateCode: 'PA' } });
  await goTab('Compass');
  await expect('Portfolio: 0 samples this year', 'Pennsylvania asks for a portfolio');
  await expect('180 days', 'Pennsylvania’s day count');

  scenario('Kids are never in the records');
  await page.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem('freerange-v1'));
    raw.state.mode = { kind: 'kid', childId: id };
    localStorage.setItem('freerange-v1', JSON.stringify(raw));
  }, BEN);
  for (const path of ['/compliance', '/records/noi', '/records/expenses', '/records/portfolio']) {
    await goto(path);
    await expectNot('Homeschool Compass', `${path} is closed in kid mode`);
    await expect('Ben!', `${path} → Ben’s own day (mood check first)`);
  }
}

await finish(journeys, 'Compass records');
