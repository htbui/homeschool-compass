import { describe, expect, it } from 'vitest';

import { complianceStatus, pace, splitRadar, yearProgress, type ComplianceInput } from '../compliance';
import { addDays, formatDate, todayKey } from '../dates';
import { esc, evaluatorPacketHtml, expenseReportHtml, NOI_CHECKLIST, noiHtml } from '../documents';
import { summarizeHours, toHours } from '../hours';
import { newLesson } from '../package';
import { missingSentence, missingSubjects, requiredSubjects, subjectCoverage } from '../standards';
import { getStateLaw, STATE_LAWS, stateFromZip, TIER_INFO, VERIFY_NOTICE } from '../states';
import { SUBJECT_LIST, SUBJECTS } from '../subjects';
import type { Child, Curriculum, Evidence, Expense, FamilyProfile, HoursLog, NoiDraft, RhythmBlock, Task } from '../types';
import { answerKeyHtml, hasAnswerKey, worksheetHtml } from '../worksheet';

const today = todayKey();
const yearStart = addDays(today, -90);

const kid = (id: string, p: Partial<Child> = {}): Child => ({
  id, name: id, birthdate: '2016-04-01', grade: '4th Grade', avatar: '🦊', color: '#000', learningDifferences: [], passions: [], soloToleranceMin: 20, sparks: 0, ...p,
});
const family = (p: Partial<FamilyProfile> = {}): FamilyProfile => ({
  familyName: 'Test Crew', parentName: 'Pat Test', parentPin: '1234', stateCode: 'CO', zip: '80202', values: [], interests: [],
  schoolYearStart: yearStart, schoolYearEnd: addDays(today, 200), schoolDays: [1, 2, 3, 4, 5], createdAt: '', ...p,
});
const done = (p: Partial<Task> & Pick<Task, 'id'>): Task => ({
  childId: 'a', date: today, title: p.id, subject: 'math', mode: 'solo', start: '09:00', durationMin: 30, icon: '⭐', steps: [], status: 'done', ...p,
});
const log = (p: Partial<HoursLog>): HoursLog => ({ id: Math.random().toString(36), childId: 'a', date: today, subject: 'pe', minutes: 60, ...p });
const noi = (p: Partial<NoiDraft> = {}): NoiDraft => ({ schoolYear: '2026–2027', parentName: '', address: '', district: '', superintendent: '', signature: '', checklist: {}, ...p });
const cur = (p: Partial<Curriculum> = {}): Curriculum => ({
  id: 'c1', name: 'Math Mammoth', subject: 'math', childIds: ['a'], totalLessons: 10, lessonsDone: 0, startDate: yearStart, targetEndDate: addDays(today, 200), schoolDays: [1, 2, 3, 4, 5], model: 'turnkey', ...p,
});
const block = (subject: RhythmBlock['subject'], title: string): RhythmBlock => ({ id: title, title, subject, childIds: ['a'], mode: 'solo', start: '09:00', durationMin: 30, days: [1], icon: '', steps: [] });

describe('hours & attendance', () => {
  it('uses timer minutes, falls back to the planned length, and skips unfinished work', () => {
    const s = summarizeHours(
      [
        done({ id: 'timed', minutesSpent: 45 }),
        done({ id: 'zero', minutesSpent: 0, durationMin: 20 }),
        done({ id: 'todo', status: 'todo' }),
        done({ id: 'started', status: 'in_progress' }),
        done({ id: 'skipped', status: 'skipped' }),
      ],
      [],
    );
    expect(s.coreMin).toBe(65);
    expect(s.daysAttended).toBe(1);
  });

  it('filters by child and by an inclusive date range', () => {
    const tasks = [done({ id: 'in', date: yearStart }), done({ id: 'before', date: addDays(yearStart, -1) }), done({ id: 'b', childId: 'b' })];
    const logs = [log({ date: today }), log({ date: addDays(today, 1) }), log({ childId: 'b' })];
    const s = summarizeHours(tasks, logs, { childId: 'a', from: yearStart, to: today });
    expect(s.coreMin).toBe(30);
    expect(s.nonCoreMin).toBe(60);
    expect(s.attendedDates).toEqual([yearStart, today]);
  });

  it('ignores zero or negative manual logs and never counts those days as attended', () => {
    const s = summarizeHours([], [log({ minutes: 0 }), log({ minutes: -30, date: addDays(today, -1) })]);
    expect(s).toMatchObject({ totalMin: 0, daysAttended: 0 });
  });

  it('counts a day once however much happened on it, and splits core and non-core by subject', () => {
    const s = summarizeHours([done({ id: '1', subject: 'science' }), done({ id: '2', subject: 'art' })], [log({ subject: 'reading', minutes: 15 })]);
    expect(s.daysAttended).toBe(1);
    expect(s.bySubject).toEqual({ science: 30, art: 30, reading: 15 });
    expect([s.coreMin, s.nonCoreMin]).toEqual([45, 30]);
  });

  it('rounds hours to one decimal', () => {
    expect(toHours(0)).toBe(0);
    expect(toHours(50)).toBe(0.8);
    expect(toHours(90)).toBe(1.5);
  });

  it('classifies every subject as core or non-core', () => {
    expect(SUBJECT_LIST).toHaveLength(17);
    expect(SUBJECT_LIST.filter((s) => SUBJECTS[s].core)).toEqual(['math', 'reading', 'writing', 'phonics', 'science', 'history', 'geography', 'civics']);
  });
});

describe('compliance radar', () => {
  const input = (p: Partial<ComplianceInput> = {}): ComplianceInput => ({ family: family(), tasks: [], logs: [], children: [kid('a'), kid('b')], evidence: [], noi: noi(), curricula: [], blocks: [], ...p });
  const labels = (p: Partial<ComplianceInput>) => complianceStatus(input(p), today).items.map((i) => `${i.ok ? '✓' : '✗'} ${i.label}`);

  it('has nothing to say before onboarding', () => {
    expect(complianceStatus(input({ family: undefined }), today)).toMatchObject({ law: undefined, items: [] });
  });

  it('walks Colorado: notice, 172 days, 688 hours for the lowest child, testing, subjects', () => {
    expect(labels({})).toEqual([
      '✗ File your Notice of Intent',
      '✗ Days: 0 of 172',
      '✗ Hours: 0 of 688 (lowest child)',
      '✗ Plan this year’s assessment / evaluation',
      '✗ Not in your plan yet: Reading, Writing, Math, History, Civics & citizenship, Literature, Science',
    ]);
  });

  it('C-10: every item that needs something has a next step, and the NOI carries the state’s deadline', () => {
    const { items } = complianceStatus(input({}), today);
    for (const i of items.filter((x) => !x.ok)) expect(i.action?.label, i.label).toBeTruthy();
    expect(items[0]).toMatchObject({ status: 'todo', detail: 'Due: Notice of intent 14 days before starting, then annually.', action: { label: 'Start letter', route: '/records/noi' } });
    expect(items.find((i) => i.label.startsWith('Plan this year'))).toMatchObject({ action: { kind: 'assessment' }, detail: expect.stringMatching(/Evaluation in grades/) });
  });

  it('C-10: day one of a new year is on pace, not a warning', () => {
    const fresh = family({ schoolYearStart: today, schoolYearEnd: addDays(today, 280) });
    const { items } = complianceStatus(input({ family: fresh }), today);
    expect(items.find((i) => i.label.startsWith('Days'))).toMatchObject({ ok: true, status: 'on_track', detail: 'on pace ✓' });
    expect(items.find((i) => i.label.startsWith('Hours'))).toMatchObject({ ok: true, status: 'on_track' });
    expect(yearProgress(fresh, today)).toBe(0);
  });

  it('C-10: pace has some slack, and a finished goal is done', () => {
    expect(pace(0, 172, 0)).toEqual({ status: 'on_track', expected: 0 });
    expect(pace(10, 172, 0.1)).toMatchObject({ status: 'behind', expected: 17 });
    expect(pace(15, 172, 0.1)).toMatchObject({ status: 'on_track' });
    expect(pace(172, 172, 0.5)).toMatchObject({ status: 'done' });
  });

  it('C-10: a planned assessment is on track, and to-dos sort before what is on track', () => {
    const later = addDays(today, 30);
    const { items } = complianceStatus(input({ family: family({ assessmentDate: later }), noi: noi({ signedAt: `${today}T10:00:00Z` }) }), today);
    expect(items.find((i) => i.label.startsWith('Assessment'))).toMatchObject({ ok: true, label: `Assessment planned for ${formatDate(later, { weekday: 'short', month: 'short', day: 'numeric' })}` });
    const { todo, onTrack } = splitRadar(items);
    expect(todo.map((i) => i.label)).toEqual(['Days: 0 of 172', 'Hours: 0 of 688 (lowest child)', expect.stringMatching(/^Not in your plan yet/)]);
    expect(onTrack.map((i) => i.status)).toEqual(['on_track', 'done']);
  });

  it('marks the NOI signed, and mailed once the certified-mail box is ticked', () => {
    const when = formatDate(today, { weekday: 'short', month: 'short', day: 'numeric' });
    expect(labels({ noi: noi({ signedAt: `${today}T10:00:00Z` }) })[0]).toBe(`✓ NOI signed ${when}`);
    expect(labels({ noi: noi({ signedAt: `${today}T10:00:00Z`, checklist: { certified: true } }) })[0]).toBe(`✓ NOI signed ${when} & mailed`);
  });

  it('counts hours for the child who has the fewest, within this school year only', () => {
    const logs = [log({ childId: 'a', minutes: 700 * 60 }), log({ childId: 'b', minutes: 100 * 60 }), log({ childId: 'b', minutes: 999 * 60, date: addDays(yearStart, -1) })];
    const status = complianceStatus(input({ logs }), today);
    expect(status.items.find((i) => i.label.startsWith('Hours'))).toMatchObject({ ok: false, label: 'Hours: 100 of 688 (lowest child)' });
    expect(status.perChild.map((p) => p.summary.totalMin / 60)).toEqual([700, 100]);
  });

  it('turns subjects green once the plan covers them', () => {
    const curricula = [cur({ subject: 'math' }), cur({ id: 'c2', name: 'Story of the World', subject: 'history' })];
    const blocks = [block('reading', 'Read-aloud'), block('writing', 'Journal'), block('science', 'Nature study')];
    expect(labels({ curricula, blocks }).at(-1)).toBe('✓ Your plan covers the subjects Colorado lists');
  });

  it('Texas: no notice and no day count, only the subject list', () => {
    expect(labels({ family: family({ stateCode: 'TX' }) })).toEqual(['✓ Texas: no notice required', '✗ Not in your plan yet: Reading, Spelling & grammar, Math, Civics & citizenship']);
  });

  it('Pennsylvania: three portfolio samples per child, counted from the start of the school year', () => {
    const sample = (i: number, date = today): Evidence => ({ id: `e${i}`, childId: 'a', date, subject: 'art', uri: '', note: '' });
    const pa = (evidence: Evidence[]) => complianceStatus(input({ family: family({ stateCode: 'PA' }), evidence }), today).items.find((i) => i.route === '/records/portfolio');
    expect(pa([1, 2, 3, 4, 5].map((i) => sample(i)))).toMatchObject({ ok: false, label: 'Portfolio: 5 samples this year', action: { route: '/records/portfolio' } });
    expect(pa([1, 2, 3, 4, 5, 6].map((i) => sample(i)))).toMatchObject({ ok: true });
    expect(pa([1, 2, 3, 4, 5].map((i) => sample(i)).concat(sample(6, addDays(yearStart, -1))))).toMatchObject({ ok: false });
  });

  it('a state with neither notice nor subject list (Alaska) shows a single green line', () => {
    expect(labels({ family: family({ stateCode: 'AK' }) })).toEqual(['✓ Alaska: no notice required']);
  });

  it('days logged count any child’s work once per date', () => {
    const tasks = [done({ id: 'a1' }), done({ id: 'b1', childId: 'b' }), done({ id: 'a2', date: addDays(today, -1) })];
    expect(complianceStatus(input({ tasks }), today).family.daysAttended).toBe(2);
  });
});

describe('state law directory', () => {
  it('every entry is complete and consistent', () => {
    for (const l of STATE_LAWS) {
      expect(l.code, l.name).toMatch(/^[A-Z]{2}$/);
      expect(l.compulsoryAges[0], l.code).toBeLessThanOrEqual(l.compulsoryAges[1]);
      expect(l.requirements.length, l.code).toBeGreaterThan(0);
      expect(TIER_INFO[l.tier], l.code).toBeTruthy();
      // "No notice" states are the ones that don't require one.
      expect(l.tier === 'none', l.code).toBe(!l.noticeRequired);
      for (const f of l.funding) expect(['esa', 'tax_credit', 'tax_deduction', 'voucher', 'allotment']).toContain(f.kind);
    }
    expect(VERIFY_NOTICE).toMatch(/not legal advice/);
  });

  it('looks up states case-insensitively', () => {
    expect(getStateLaw('co')?.name).toBe('Colorado');
    expect(getStateLaw('ZZ')).toBeUndefined();
  });

  it('maps ZIP prefixes at the edges of ranges', () => {
    expect(stateFromZip('00501')).toBe('NY');
    expect(stateFromZip('20001')).toBe('DC');
    expect(stateFromZip('73301')).toBe('TX'); // Austin IRS ZIP inside Oklahoma's range
    expect(stateFromZip('73001')).toBe('OK');
    expect(stateFromZip('88501')).toBe('TX');
    expect(stateFromZip('96799')).toBe('HI');
    expect(stateFromZip('99999')).toBe('AK');
    expect(stateFromZip('06001')).toBe('CT');
  });

  it('returns nothing for territories, military mail and malformed ZIPs', () => {
    for (const z of ['00601', '09001', '96201', '1234', '123456', ' 80202', '8020a', '']) expect(stateFromZip(z), z).toBeUndefined();
  });
});

describe('standards coverage', () => {
  it('leaves free play and "other" out of coverage, and de-duplicates sources and codes', () => {
    const outline = [{ id: 'u', title: 'U', lessons: [{ ...newLesson('A'), standards: ['3.OA', '3.OA'] }, { ...newLesson('B'), standards: ['3.OA'] }] }];
    const cov = subjectCoverage([cur({ outline }), cur({ id: 'c2' })], [block('free_play', 'Recess'), block('other', 'Typing'), block('math', 'Math Mammoth')]);
    expect(cov).toEqual([{ subject: 'math', sources: ['Math Mammoth'], standards: ['3.OA'] }]);
  });

  it('knows which states list subjects and phrases what is missing', () => {
    expect(requiredSubjects()).toEqual([]);
    expect(requiredSubjects('tx').length).toBe(4);
    expect(missingSubjects(undefined, [])).toEqual([]);
    expect(missingSentence('SD', missingSubjects('SD', []))).toBe('South Dakota asks for Language arts and Math, and nothing in your plan covers them yet.');
    expect(missingSentence('SD', [])).toBeUndefined();
    expect(missingSentence(undefined, [{ label: 'Math', anyOf: ['math'] }])).toBe('Your state asks for Math, and nothing in your plan covers it yet.');
  });

  it('every state with a subject list has a law entry', () => {
    for (const l of STATE_LAWS) for (const r of requiredSubjects(l.code)) expect(r.anyOf.every((s) => SUBJECT_LIST.includes(s)), l.code).toBe(true);
  });
});

describe('Notice of Intent', () => {
  const law = getStateLaw('CO')!;
  it('escapes everything the parent types', () => {
    const html = noiHtml(family({ parentName: 'Pat <b>' }), law, [kid('<img src=x onerror=alert(1)>')], noi({ address: '1 "Main" St', superintendent: '<script>', district: 'D & D', signature: 'Pat' }));
    expect(html).not.toMatch(/<script>|<img src=x/);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('1 &quot;Main&quot; St');
    expect(html).toContain('D &amp; D');
    expect(html).toContain('Instruction will be provided by Pat &lt;b&gt;');
  });

  it('states the day and hour records for states that count them, and a signature date once signed', () => {
    const html = noiHtml(family(), law, [kid('a'), kid('b')], noi({ signature: 'Pat Test', signedAt: '2026-08-20T12:00:00Z' }));
    expect(html).toContain('for at least 172 days / 688 hours');
    expect(html).toContain('children of compulsory school age');
    expect(html).toContain('Signed electronically August 20, 2026');
    const wi = noiHtml(family(), getStateLaw('WI')!, [kid('a')], noi());
    expect(wi).toContain('totaling at least 875 hours');
    expect(wi).toContain('the following\n    child of');
    expect(noiHtml(family(), getStateLaw('AL')!, [kid('a')], noi())).not.toContain('maintain records of instruction');
  });

  it('defaults the addressee when the district is blank', () => {
    expect(noiHtml(family(), law, [kid('a')], noi())).toContain('Colorado School District');
    expect(NOI_CHECKLIST.map((c) => c.key)).toContain('certified');
  });
});

describe('evaluator packet & expense report', () => {
  const evidence: Evidence[] = [
    { id: 'in', childId: 'a', date: today, subject: 'art', uri: 'file://ok.png', note: 'Water"color', standard: 'VA:Cr1' },
    { id: 'out', childId: 'a', date: addDays(yearStart, -5), subject: 'art', uri: 'file://old.png', note: 'Old sample' },
  ];
  it('includes only the chosen period, per child, with reflections and curriculum progress', () => {
    const html = evaluatorPacketHtml({
      family: family(), law: getStateLaw('CO'), children: [kid('a'), kid('b')], logs: [log({ minutes: 90 })], evidence,
      tasks: [done({ id: 'r', reflection: 'I learned <fractions>' }), done({ id: 'old', date: addDays(yearStart, -3), reflection: 'too old' })],
      curricula: [cur({ progress: { a: 4 } })], from: yearStart, to: today,
    });
    expect(html).toContain('Water&quot;color');
    expect(html).not.toContain('Old sample');
    expect(html).toContain('I learned &lt;fractions&gt;');
    expect(html).not.toContain('too old');
    expect(html).toContain('4 / 10 lessons');
    expect(html).toContain('172 days / 688 hours');
    expect(html.match(/class="pagebreak"/g)).toHaveLength(1);
    expect(html).toContain('Approach: Eclectic');
  });

  it('totals the expense report by funding source', () => {
    const e = (p: Partial<Expense>): Expense => ({ id: Math.random().toString(36), date: today, vendor: 'V', description: '', amount: 10, category: 'supplies', fundingSource: 'esa', approvedVendor: false, ...p });
    const html = expenseReportHtml(family(), [e({ amount: 12.5 }), e({ amount: 7.25, fundingSource: 'tax', vendor: '<Shop>' }), e({ amount: 100, fundingSource: 'out_of_pocket', approvedVendor: true, childId: 'a' })], [kid('Ada')], '2026–2027');
    expect(html).toContain('<tr><th>ESA-funded</th><td>$12.50</td></tr>');
    expect(html).toContain('<td>$7.25</td></tr>');
    expect(html).toContain('<th>Total</th><th>$119.75</th>');
    expect(html).toContain('&lt;Shop&gt;');
    expect(html).toContain('out of pocket ✓');
    expect(esc(undefined)).toBe('');
  });
});

describe('answer keys stay with the grown-ups', () => {
  const outline = [{
    id: 'u', title: 'Halves', lessons: [{
      id: 'l1', title: 'Fold it', steps: ['Fold the paper'], links: [], questions: ['Half of 12?'], answers: ['SECRET-6'], notes: 'PARENT-NOTE',
      versions: { harder: { steps: [], questions: ['Half of 132?'], answers: ['SECRET-66'] } },
    }],
  }];
  const plan = cur({ subject: 'math', outline, totalLessons: 1, lessonsDone: 0, versionPicks: { b: { level: 'harder' } }, childIds: ['a', 'b'] });
  const t = (childId: string) => done({ id: `t-${childId}`, childId, status: 'todo', curriculumId: 'c1' });
  const ctx = { children: [kid('a'), kid('b')], curricula: [plan] };

  it('kids’ worksheets show the questions of their own version, never answers or notes', () => {
    const sheets = worksheetHtml([t('a'), t('b')], ctx, 'Packet');
    expect(sheets).toContain('Half of 12?');
    expect(sheets).toContain('Half of 132?');
    expect(sheets).not.toMatch(/SECRET|PARENT-NOTE/);
  });

  it('the separate key has each child’s version’s answers', () => {
    const key = answerKeyHtml([t('a'), t('b')], ctx);
    expect(key).toContain('SECRET-6<');
    expect(key).toContain('SECRET-66');
    expect(key).toContain('PARENT-NOTE');
  });

  it('notes alone are enough for a key; plain tasks have none', () => {
    const notesOnly = cur({ outline: [{ id: 'u', title: 'U', lessons: [{ ...newLesson('N'), notes: 'Bring scissors' }] }], totalLessons: 1 });
    expect(hasAnswerKey(t('a'), { curricula: [notesOnly] })).toBe(true);
    expect(hasAnswerKey(done({ id: 'x' }), { curricula: [notesOnly] })).toBe(false);
    expect(answerKeyHtml([done({ id: 'x' })], { children: [], curricula: [] })).toContain('No answers or notes for these lessons yet.');
  });
});
