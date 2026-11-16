import { describe, expect, it } from 'vitest';

import { parseAuthRedirect, passwordProblems, resetRedirect } from '../authLinks';
import { noiPreview } from '../documents';
import { hoursOfGoal, subjectHoursLabel, summarizeHours } from '../hours';
import { paceSummary, rateWords } from '../pacing';
import { leanHeadline } from '../quiz';
import { getStateLaw } from '../states';
import { agendaSlots, fitScale, isPlannedDay, nextPlannedDay, nowAndNext, timelineSpan, timelineTicks } from '../agenda';
import { addDays, weekdayOf } from '../dates';
import { canStartEarly, helpSentText, kidsMayPrint, missionLabel, missionStatus, startEarlyBlocked } from '../kidRules';
import { earlyStartNotices } from '../notifications';
import { clockText, elapsedMs, minutesSpent, newTimer, pauseTimer, pomodoroDone, POMODORO_MS, startTimer, switchMode, timerBadge } from '../timer';
import type { Child, FamilyProfile, QuizResult, RhythmBlock, Task } from '../types';

const task = (p: Partial<Task> & Pick<Task, 'id'>): Task => ({
  childId: 'a', date: '2026-11-16', title: p.id, subject: 'math', mode: 'solo', start: '09:00', durationMin: 30, icon: '⭐', steps: [], status: 'todo', ...p,
});
const block = (p: Partial<RhythmBlock> & Pick<RhythmBlock, 'id'>): RhythmBlock => ({
  title: p.id, subject: 'math', childIds: ['a'], mode: 'solo', start: '09:00', durationMin: 30, days: [1, 2, 3, 4, 5], icon: '⭐', steps: [], ...p,
});
const kid = (id: string, name: string): Child => ({ id, name, birthdate: '2017-01-01', grade: '3rd Grade', avatar: '🦉', color: '#000', learningDifferences: [], passions: [], soloToleranceMin: 20, sparks: 0 });

describe('C-01: Today agenda', () => {
  it('groups tasks by start time, earliest first, with parent time first in each slot', () => {
    const slots = agendaSlots(
      [
        task({ id: 'read', childId: 'maya', start: '09:00' }),
        task({ id: 'algebra', childId: 'noah', start: '09:00', mode: 'solo' }),
        task({ id: 'phonics', childId: 'leo', start: '09:00', mode: 'parent' }),
        task({ id: 'walk', childId: 'leo', start: '08:30', mode: 'group' }),
      ],
      ['leo', 'maya', 'noah'],
    );
    expect(slots.map((s) => s.start)).toEqual(['08:30', '09:00']);
    expect(slots[1].tasks.map((t) => t.id)).toEqual(['phonics', 'read', 'algebra']);
    expect(slots[1].parentTime).toBe(true);
    expect(slots[0].parentTime).toBe(false);
  });

  it('a skipped 1-on-1 no longer marks its slot as parent time', () => {
    expect(agendaSlots([task({ id: 'p', mode: 'parent', status: 'skipped' })])[0].parentTime).toBe(false);
  });

  it('now/next: what is happening this minute (or started), and the next group still to come', () => {
    const tasks = [
      task({ id: 'early', start: '08:00', status: 'done' }),
      task({ id: 'now', start: '09:00', durationMin: 45 }),
      task({ id: 'started', start: '11:00', status: 'in_progress' }),
      task({ id: 'next1', start: '10:00' }),
      task({ id: 'next2', start: '10:00', childId: 'b' }),
      task({ id: 'later', start: '13:00' }),
    ];
    const r = nowAndNext(tasks, 9 * 60 + 30);
    expect(r.now.map((t) => t.id).sort()).toEqual(['now', 'started']);
    expect(r.next.map((t) => t.id)).toEqual(['next1', 'next2']);
    expect(r.nextStart).toBe('10:00');
    expect(nowAndNext(tasks, 23 * 60).next).toEqual([]);
  });
});

describe('C-02: an empty day points to the next school day', () => {
  const sunday = '2026-11-15';
  it('finds the next weekday with rhythm blocks', () => {
    expect(weekdayOf(sunday)).toBe(0);
    expect(nextPlannedDay(sunday, [block({ id: 'b' })], [])).toBe('2026-11-16');
    expect(nextPlannedDay('2026-11-20', [block({ id: 'b' })], [])).toBe('2026-11-23');
  });
  it('counts bumped or one-off tasks, and ignores blocks without kids or skipped tasks', () => {
    expect(nextPlannedDay(sunday, [block({ id: 'b', childIds: [] })], [task({ id: 's', date: '2026-11-17', status: 'skipped' }), task({ id: 't', date: '2026-11-18' })])).toBe('2026-11-18');
    expect(nextPlannedDay(sunday, [], [])).toBeUndefined();
    expect(isPlannedDay(sunday, [block({ id: 'b' })], [])).toBe(false);
    expect(isPlannedDay(sunday, [block({ id: 'b' })], [task({ id: 'x', date: sunday })])).toBe(true);
  });
});

describe('C-25 / C-23: timeline axis and width', () => {
  it('never runs past midnight, so late tasks do not repeat "11:59 PM"', () => {
    const span = timelineSpan([task({ id: 'late', start: '23:50', durationMin: 30 })]);
    expect(span).toEqual({ start: 23 * 60 + 30, end: 24 * 60 });
    const labels = timelineTicks(span).map((t) => t.label);
    expect(labels).toEqual(['11:30 PM', '12 AM']);
    expect(new Set(labels).size).toBe(labels.length);
  });
  it('labels every half hour once', () => {
    const labels = timelineTicks({ start: 9 * 60, end: 10 * 60 + 30 }).map((t) => t.label);
    expect(labels).toEqual(['9 AM', '9:30 AM', '10 AM', '10:30 AM']);
  });
  it('fits the whole day into the room available, within readable limits', () => {
    expect(fitScale({ start: 9 * 60, end: 15 * 60 }, 720)).toBe(2);
    expect(fitScale({ start: 9 * 60, end: 15 * 60 }, 100)).toBe(1.2);
    expect(fitScale({ start: 9 * 60, end: 9 * 60 + 30 }, 2000)).toBe(4);
  });
});

describe('C-03: mission timer', () => {
  const t0 = Date.parse('2026-11-16T10:00:00Z');
  it('counts from when it started, banks time on pause, and survives a reload (plain data)', () => {
    let t = startTimer(newTimer(), t0);
    expect(elapsedMs(t, t0 + 90_000)).toBe(90_000);
    t = JSON.parse(JSON.stringify(t));
    expect(elapsedMs(t, t0 + 90_000)).toBe(90_000);
    t = pauseTimer(t, t0 + 120_000);
    expect(t).toEqual({ mode: 'stopwatch', pausedMs: 120_000 });
    expect(elapsedMs(t, t0 + 999_999)).toBe(120_000);
    expect(clockText(t)).toBe('02:00');
    expect(startTimer(startTimer(t, t0 + 200_000), t0 + 300_000).startedAt).toBe(new Date(t0 + 200_000).toISOString());
  });
  it('a Pomodoro counts down and stops at 25 minutes', () => {
    const t = startTimer(switchMode('pomodoro'), t0);
    expect(clockText(t, t0 + 60_000)).toBe('24:00');
    expect(pomodoroDone(t, t0 + POMODORO_MS - 1)).toBe(false);
    expect(pomodoroDone(t, t0 + POMODORO_MS + 60_000)).toBe(true);
    expect(elapsedMs(t, t0 + 2 * POMODORO_MS)).toBe(POMODORO_MS);
    expect(clockText(t, t0 + 2 * POMODORO_MS)).toBe('00:00');
    // A finished Pomodoro doesn't start again until switched.
    const done = pauseTimer(t, t0 + 2 * POMODORO_MS);
    expect(startTimer(done, t0 + 3 * POMODORO_MS)).toBe(done);
  });
  it('minutes for the records, and the badge on the day list', () => {
    expect(minutesSpent(undefined)).toBeUndefined();
    expect(minutesSpent({ mode: 'stopwatch', pausedMs: 20_000 })).toBeUndefined();
    expect(minutesSpent({ mode: 'stopwatch', pausedMs: 12 * 60_000 + 40_000 })).toBe(13);
    expect(timerBadge(newTimer())).toBeUndefined();
    expect(timerBadge(startTimer(newTimer(), t0), t0 + 12 * 60_000 + 5000)).toBe('⏱ 12 min');
    expect(timerBadge({ mode: 'stopwatch', pausedMs: 5 * 60_000 })).toBe('⏸ 5 min');
  });
});

describe('C-12: who may start early', () => {
  const today = '2026-11-16';
  it('only unstarted solo missions on a later day, and only when the family allows it', () => {
    expect(canStartEarly({ mode: 'solo', status: 'todo', date: '2026-11-17' }, today)).toBe(true);
    expect(canStartEarly({ mode: 'parent', status: 'todo', date: '2026-11-17' }, today)).toBe(false);
    expect(canStartEarly({ mode: 'group', status: 'todo', date: '2026-11-17' }, today)).toBe(false);
    expect(canStartEarly({ mode: 'solo', status: 'todo', date: today }, today)).toBe(false);
    expect(canStartEarly({ mode: 'solo', status: 'done', date: '2026-11-17' }, today)).toBe(false);
    expect(canStartEarly({ mode: 'solo', status: 'todo', date: '2026-11-17' }, today, { kidsStartEarly: false })).toBe(false);
  });
  it('explains why not, in kid words', () => {
    expect(startEarlyBlocked({ mode: 'parent' }, { parentName: 'Dana Miller' })).toMatch(/with Dana/);
    expect(startEarlyBlocked({ mode: 'group' })).toMatch(/family/);
    expect(startEarlyBlocked({ mode: 'solo' }, { kidsStartEarly: false, parentName: 'Dana' })).toMatch(/Dana will start it with you/);
    expect(startEarlyBlocked({ mode: 'solo' })).toBeUndefined();
  });
  it('tells the parent when a kid started tomorrow’s work', () => {
    const notices = earlyStartNotices(
      [
        task({ id: 'x', title: 'Silent Reading', childId: 'maya', date: today, bumpedFrom: '2026-11-17', startedEarlyAt: '2026-11-16T10:00:00Z' }),
        task({ id: 'old', childId: 'maya', date: '2026-11-15', bumpedFrom: '2026-11-16', startedEarlyAt: '2026-11-15T10:00:00Z' }),
        task({ id: 'bumped', childId: 'maya', date: today, bumpedFrom: '2026-11-13' }),
      ],
      [kid('maya', 'Maya')],
      today,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ id: 'early:x', title: '🦉 Maya started tomorrow’s Silent Reading', link: { to: 'today' } });
  });
});

describe('C-13 / C-15 / C-16: kid-mode copy and labels', () => {
  it('help confirmation is neutral', () => {
    expect(helpSentText('Dana')).toBe('Dana got your message 👍');
    expect(helpSentText('Dana')).not.toMatch(/someone else/);
  });
  it('mission status never rests on colour alone, and cards have a spoken summary', () => {
    const ctx = { current: false, isToday: true, isFuture: false, today: '2026-11-16' };
    expect(missionStatus({ status: 'done', mode: 'solo', date: '2026-11-16' }, ctx)).toBe('done');
    expect(missionStatus({ status: 'todo', mode: 'solo', date: '2026-11-16' }, { ...ctx, current: true })).toBe('up_next');
    expect(missionStatus({ status: 'todo', mode: 'parent', date: '2026-11-17' }, { ...ctx, isToday: false, isFuture: true })).toBe('later');
    expect(missionStatus({ status: 'todo', mode: 'solo', date: '2026-11-17' }, { ...ctx, isToday: false, isFuture: true })).toBe('start_early');
    expect(missionStatus({ status: 'todo', mode: 'solo', date: '2026-11-15' }, { ...ctx, isToday: false })).toBe('not_finished');
    expect(missionLabel(1, 'Leaf rubbing journal', '11:50 AM', 'up_next')).toBe('Mission 1, Leaf rubbing journal, 11:50 AM, up next');
    expect(missionLabel(2, 'Phonics', '9:00 AM', 'later', 'with Dana')).toBe('Mission 2, Phonics, 9:00 AM, with Dana');
  });
  it('kids may print unless the parent turns it off', () => {
    expect(kidsMayPrint(undefined)).toBe(true);
    expect(kidsMayPrint({})).toBe(true);
    expect(kidsMayPrint({ kidsCanPrint: false })).toBe(false);
  });
});

describe('C-19: pacing in plain words', () => {
  const cur = { startDate: '2026-08-17', targetEndDate: '2027-06-04' };
  const base = { totalSchoolDays: 180, remainingSchoolDays: 145, remainingLessons: 60, lessonsPerDay: 0.4, lessonsPerWeek: 2.1, expectedDone: 70, delta: 0, state: 'on_track' as const };
  it('leads with one line: finish date and a rounded weekly rate', () => {
    const s = paceSummary(cur, base);
    expect(s.lead).toBe('On track to finish Jun 4 · about 2 lessons a week');
    expect(s.why).toBe('Details');
  });
  it('re-paced plans explain themselves on request', () => {
    const s = paceSummary(cur, { ...base, state: 'behind', delta: -10, projectedFinish: '2027-07-22' });
    expect(s.why).toBe('Why re-paced?');
    expect(s.details.join(' ')).toMatch(/10 lessons behind the original plan/);
    expect(s.details.join(' ')).toMatch(/Jul 22/);
  });
  it('slow and finished plans', () => {
    expect(rateWords(0.4)).toBe('about 1 lesson every 3 weeks');
    expect(rateWords(1)).toBe('about 1 lesson a week');
    expect(paceSummary(cur, { ...base, state: 'done' }).lead).toBe('Finished 🎓');
  });
});

describe('C-20: style headline', () => {
  const result = (ps: [string, number][]) => ({ breakdown: ps.map(([philosophy, percent]) => ({ philosophy, percent })), dimensions: {}, takenAt: '' }) as unknown as QuizResult;
  it('"You lean Traditional", with a touch of the runners-up', () => {
    expect(leanHeadline(result([['traditional', 52], ['classical', 24], ['charlotte_mason', 24]]))).toEqual({ lead: 'You lean Traditional', touch: 'with a touch of Classical & Charlotte Mason' });
    expect(leanHeadline(result([['montessori', 100]]))).toEqual({ lead: 'You lean Montessori', touch: undefined });
    expect(leanHeadline(result([])).lead).toBe('You’re eclectic');
  });
});

describe('C-22: records wording and corrections', () => {
  it('spells out non-core and hours of the goal', () => {
    expect(subjectHoursLabel('pe', 300)).toMatch(/ 5 h \(non-core\)$/);
    expect(subjectHoursLabel('math', 90)).toMatch(/Math 1\.5 h$/);
    expect(hoursOfGoal(1350, 688)).toBe('22.5 of 688 hrs');
    expect(hoursOfGoal(60)).toBe('1 hrs');
  });
  it('an auto-logged task left out of the records stops counting', () => {
    const t = task({ id: 'x', status: 'done', durationMin: 30 });
    expect(summarizeHours([t], []).totalMin).toBe(30);
    expect(summarizeHours([{ ...t, hoursExcluded: true }], []).totalMin).toBe(0);
    expect(summarizeHours([{ ...t, minutesSpent: 45 }], []).totalMin).toBe(45);
  });
  it('the NOI preview shows the letter and flags what is still blank', () => {
    const law = getStateLaw('CO')!;
    const fam = { familyName: 'M', parentName: 'Dana Miller', parentPin: '', stateCode: 'CO', zip: '', values: [], interests: [], schoolYearStart: '2026-08-17', schoolYearEnd: '2027-06-04', schoolDays: [], createdAt: '' } as FamilyProfile;
    const draft = { schoolYear: '2026–2027', parentName: 'Dana Miller', address: '', district: '', superintendent: '', signature: '', checklist: {} };
    const blank = noiPreview(fam, law, [kid('maya', 'Maya')], draft);
    expect(blank.missing).toEqual(['home address', 'signature']);
    expect(blank.lines.join('\n')).toMatch(/\[home address — still needed\]/);
    const filled = noiPreview(fam, law, [kid('maya', 'Maya')], { ...draft, address: '12 Elm St, Denver', signature: 'Dana Miller' });
    expect(filled.missing).toEqual([]);
    expect(filled.lines.join('\n')).toMatch(/Instruction will be provided at: 12 Elm St, Denver/);
    expect(filled.lines.some((l) => l.startsWith('• Maya, born'))).toBe(true);
  });
});

describe('C-05: password reset links', () => {
  it('reads the session from a reset link', () => {
    expect(parseAuthRedirect('freerange://account#access_token=a1&refresh_token=r1&type=recovery&expires_in=3600')).toEqual({ accessToken: 'a1', refreshToken: 'r1', type: 'recovery' });
    expect(parseAuthRedirect('freerange://account')).toBeUndefined();
    expect(parseAuthRedirect('https://x/#error=access_denied')).toBeUndefined();
  });
  it('sends the web build back to its own account screen', () => {
    expect(resetRedirect('http://localhost:8095/', 'freerange://account')).toBe('http://localhost:8095/account');
    expect(resetRedirect(undefined, 'freerange://account')).toBe('freerange://account');
  });
  it('new passwords: long enough, typed twice', () => {
    expect(passwordProblems('abc', 'abc')).toEqual(['a password of 6+ characters']);
    expect(passwordProblems('abcdef', 'abcdeg')).toEqual(['the same password twice']);
    expect(passwordProblems('abcdef', 'abcdef')).toEqual([]);
  });
});

// Keep the date helpers honest for the fixtures above.
it('fixture dates', () => {
  expect(addDays('2026-11-15', 1)).toBe('2026-11-16');
});
