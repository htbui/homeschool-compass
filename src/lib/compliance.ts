import { formatDate, schoolDatesBetween, todayKey } from './dates';
import { summarizeHours } from './hours';
import { missingSubjects, requiredSubjects, subjectCoverage } from './standards';
import { getStateLaw } from './states';
import type { Child, Curriculum, Evidence, FamilyProfile, HoursLog, NoiDraft, RhythmBlock, Task, Weekday } from './types';

export type RadarRoute = '/records/noi' | '/records/hours' | '/records/portfolio' | '/records/expenses' | '/learn';

/**
 * - `todo`: something to do, with a due date or step when there is one.
 * - `behind`: progress that's slipping behind the pace the year needs.
 * - `on_track`: progress that's where it should be for this point in the year.
 * - `done` / `info`: finished, or nothing to do in this state.
 */
export type RadarStatus = 'todo' | 'behind' | 'on_track' | 'done' | 'info';

export interface RadarItem {
  /** Nothing to worry about (done, on pace, or not required). */
  ok: boolean;
  status: RadarStatus;
  label: string;
  /** "on pace ✓", "about 25 expected by now", the state's deadline… */
  detail?: string;
  /** Every item that needs something gets a next step. */
  action?: { label: string; route?: RadarRoute; kind?: 'assessment' };
  route?: RadarRoute;
  /** Lower is more urgent; Today shows only the most urgent to-do. */
  urgency: number;
}

export interface ComplianceInput {
  family?: FamilyProfile;
  tasks: Task[];
  logs: HoursLog[];
  children: Child[];
  evidence: Evidence[];
  noi: NoiDraft;
  curricula: Curriculum[];
  blocks: RhythmBlock[];
}

/** How far through the school year we are, in school days (0 before it starts, 1 after it ends). */
export function yearProgress(family: Pick<FamilyProfile, 'schoolYearStart' | 'schoolYearEnd' | 'schoolDays'>, today: string): number {
  const days: Weekday[] = family.schoolDays.length ? family.schoolDays : [1, 2, 3, 4, 5];
  const total = schoolDatesBetween(family.schoolYearStart, family.schoolYearEnd, days).length;
  if (!total || today < family.schoolYearStart) return 0;
  // Today counts once it's over, so the first morning of the year isn't already "behind".
  const elapsed = schoolDatesBetween(family.schoolYearStart, today, days).filter((d) => d < today).length;
  return Math.min(1, elapsed / total);
}

/**
 * Where a count stands against a yearly goal: done, on pace for this point in the year
 * (with some slack, so a sick week doesn't flash red), or behind.
 */
export function pace(have: number, goal: number, progress: number): { status: 'done' | 'on_track' | 'behind'; expected: number } {
  const expected = Math.round(goal * progress);
  if (have >= goal) return { status: 'done', expected };
  return { status: have >= Math.floor(expected * 0.85) ? 'on_track' : 'behind', expected };
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };

/** The family's compliance posture for the current school year (the Compass radar). */
export function complianceStatus({ family, tasks, logs, children, evidence, noi, curricula, blocks }: ComplianceInput, today = todayKey()) {
  const law = family ? getStateLaw(family.stateCode) : undefined;
  const from = family?.schoolYearStart;
  const to = today;
  const family_ = summarizeHours(tasks, logs, { from, to });
  const perChild = children.map((c) => ({ child: c, summary: summarizeHours(tasks, logs, { childId: c.id, from, to }) }));
  const minChildHours = perChild.length ? Math.min(...perChild.map((p) => p.summary.totalMin / 60)) : 0;
  const yearEvidence = evidence.filter((e) => !from || e.date >= from);
  const progress = family ? yearProgress(family, today) : 0;

  const items: RadarItem[] = [];
  const push = (i: Omit<RadarItem, 'ok'>) => items.push({ ...i, ok: i.status === 'done' || i.status === 'on_track' || i.status === 'info' });

  if (law?.noticeRequired) {
    if (noi.signedAt) push({ status: 'done', label: `NOI signed ${formatDate(noi.signedAt.slice(0, 10), SHORT_DATE)}${noi.checklist.certified ? ' & mailed' : ''}`, route: '/records/noi', urgency: 90 });
    else push({ status: 'todo', label: 'File your Notice of Intent', detail: law.noticeNote ? `Due: ${law.noticeNote}` : undefined, action: { label: 'Start letter', route: '/records/noi' }, route: '/records/noi', urgency: 0 });
  } else if (law) {
    push({ status: 'info', label: `${law.name}: no notice required`, urgency: 99 });
  }
  if (law?.requiredDays) {
    const p = pace(family_.daysAttended, law.requiredDays, progress);
    push({
      status: p.status,
      label: `Days: ${family_.daysAttended} of ${law.requiredDays}`,
      detail: p.status === 'done' ? 'all required days done ✓' : p.status === 'on_track' ? 'on pace ✓' : `about ${p.expected} expected by now`,
      action: p.status === 'behind' ? { label: 'Log time', route: '/records/hours' } : undefined,
      route: '/records/hours',
      urgency: p.status === 'behind' ? 2 : 80,
    });
  }
  if (law?.requiredHours) {
    const have = Math.round(minChildHours);
    const p = pace(have, law.requiredHours, progress);
    push({
      status: p.status,
      label: `Hours: ${have} of ${law.requiredHours}${children.length > 1 ? ' (lowest child)' : ''}`,
      detail: p.status === 'done' ? 'all required hours done ✓' : p.status === 'on_track' ? 'on pace ✓' : `about ${p.expected} expected by now`,
      action: p.status === 'behind' ? { label: 'Log time', route: '/records/hours' } : undefined,
      route: '/records/hours',
      urgency: p.status === 'behind' ? 2 : 81,
    });
  }
  if (law?.testingRequired) {
    const rule = law.requirements.find((r) => /evaluat|assess|test/i.test(r));
    const planned = family?.assessmentDate;
    if (planned && planned < today) push({ status: 'done', label: `Assessment done ${formatDate(planned, SHORT_DATE)}`, detail: rule, action: { label: 'Change date', kind: 'assessment' }, urgency: 92 });
    else if (planned) push({ status: 'on_track', label: `Assessment planned for ${formatDate(planned, SHORT_DATE)}`, detail: rule, action: { label: 'Change date', kind: 'assessment' }, urgency: 82 });
    else push({ status: 'todo', label: 'Plan this year’s assessment / evaluation', detail: rule, action: { label: 'Set a date', kind: 'assessment' }, urgency: 3 });
  }
  const coverage = subjectCoverage(curricula, blocks);
  const missing = missingSubjects(family?.stateCode, coverage);
  if (law && requiredSubjects(law.code).length) {
    if (missing.length) push({ status: 'todo', label: `Not in your plan yet: ${missing.map((m) => m.label).join(', ')}`, action: { label: 'Add to plan', route: '/learn' }, route: '/learn', urgency: 4 });
    else push({ status: 'done', label: `Your plan covers the subjects ${law.name} lists`, urgency: 93 });
  }
  if (law?.portfolioRequired) {
    const goal = 3 * Math.max(1, children.length);
    const enough = yearEvidence.length >= goal;
    push({
      status: enough ? 'on_track' : 'behind',
      label: `Portfolio: ${yearEvidence.length} sample${yearEvidence.length === 1 ? '' : 's'} this year`,
      detail: enough ? 'a good start ✓' : `aim for at least ${goal} (3 per child)`,
      action: enough ? undefined : { label: 'Add samples', route: '/records/portfolio' },
      route: '/records/portfolio',
      urgency: enough ? 83 : 5,
    });
  }

  return { law, family: family_, perChild, items, evidenceCount: yearEvidence.length, coverage, missing };
}

/** To-dos first (most urgent first), then what's on track. */
export function splitRadar(items: RadarItem[]): { todo: RadarItem[]; onTrack: RadarItem[] } {
  const byUrgency = [...items].sort((a, b) => a.urgency - b.urgency);
  return { todo: byUrgency.filter((i) => !i.ok), onTrack: byUrgency.filter((i) => i.ok) };
}
