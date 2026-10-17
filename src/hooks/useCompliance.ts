import { useMemo } from 'react';

import { todayKey } from '@/lib/dates';
import { summarizeHours } from '@/lib/hours';
import { getStateLaw } from '@/lib/states';
import { useStore } from '@/store/useStore';

export interface RadarItem {
  ok: boolean;
  label: string;
  route?: '/records/noi' | '/records/hours' | '/records/portfolio' | '/records/expenses';
}

/** Rolls up the family's compliance posture for the current school year. */
export function useCompliance() {
  const family = useStore((s) => s.family);
  const tasks = useStore((s) => s.tasks);
  const logs = useStore((s) => s.hoursLogs);
  const children = useStore((s) => s.children);
  const evidence = useStore((s) => s.evidence);
  const noi = useStore((s) => s.noi);

  return useMemo(() => {
    const law = family ? getStateLaw(family.stateCode) : undefined;
    const from = family?.schoolYearStart;
    const to = todayKey();
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
    if (law?.portfolioRequired) items.push({ ok: yearEvidence.length >= 3 * Math.max(1, children.length), label: `${yearEvidence.length} portfolio samples this year`, route: '/records/portfolio' });

    return { law, family: family_, perChild, items, evidenceCount: yearEvidence.length };
  }, [family, tasks, logs, children, evidence, noi]);
}
