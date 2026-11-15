import { todayKey } from './dates';
import { summarizeHours } from './hours';
import { missingSubjects, requiredSubjects, subjectCoverage } from './standards';
import { getStateLaw } from './states';
import type { Child, Curriculum, Evidence, FamilyProfile, HoursLog, NoiDraft, RhythmBlock, Task } from './types';

export interface RadarItem {
  ok: boolean;
  label: string;
  route?: '/records/noi' | '/records/hours' | '/records/portfolio' | '/records/expenses';
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

/** The family's compliance posture for the current school year (the Compass radar). */
export function complianceStatus({ family, tasks, logs, children, evidence, noi, curricula, blocks }: ComplianceInput, today = todayKey()) {
  const law = family ? getStateLaw(family.stateCode) : undefined;
  const from = family?.schoolYearStart;
  const to = today;
  const family_ = summarizeHours(tasks, logs, { from, to });
  const perChild = children.map((c) => ({ child: c, summary: summarizeHours(tasks, logs, { childId: c.id, from, to }) }));
  const minChildHours = perChild.length ? Math.min(...perChild.map((p) => p.summary.totalMin / 60)) : 0;
  const yearEvidence = evidence.filter((e) => !from || e.date >= from);

  const items: RadarItem[] = [];
  if (law?.noticeRequired) {
    items.push(noi.signedAt ? { ok: true, label: `NOI signed ${noi.signedAt.slice(0, 10)}${noi.checklist.certified ? ' & mailed' : ''}`, route: '/records/noi' } : { ok: false, label: 'Notice of Intent not filed yet', route: '/records/noi' });
  } else if (law) {
    items.push({ ok: true, label: `${law.name}: no notice required` });
  }
  if (law?.requiredDays) items.push({ ok: family_.daysAttended >= law.requiredDays, label: `${family_.daysAttended} / ${law.requiredDays} days logged`, route: '/records/hours' });
  if (law?.requiredHours) items.push({ ok: minChildHours >= law.requiredHours, label: `${Math.round(minChildHours)} / ${law.requiredHours} hours (lowest child)`, route: '/records/hours' });
  if (law?.testingRequired) items.push({ ok: false, label: 'Annual assessment / evaluation — schedule it' });
  const coverage = subjectCoverage(curricula, blocks);
  const missing = missingSubjects(family?.stateCode, coverage);
  if (law && requiredSubjects(law.code).length)
    items.push(missing.length ? { ok: false, label: `Not in your plan yet: ${missing.map((m) => m.label).join(', ')}` } : { ok: true, label: `Your plan covers the subjects ${law.name} lists` });
  if (law?.portfolioRequired) items.push({ ok: yearEvidence.length >= 3 * Math.max(1, children.length), label: `${yearEvidence.length} portfolio samples this year`, route: '/records/portfolio' });

  return { law, family: family_, perChild, items, evidenceCount: yearEvidence.length, coverage, missing };
}
