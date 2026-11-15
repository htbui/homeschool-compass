import { useMemo } from 'react';

import { complianceStatus } from '@/lib/compliance';
import { useStore } from '@/store/useStore';

export type { RadarItem } from '@/lib/compliance';

/** Rolls up the family's compliance posture for the current school year. */
export function useCompliance() {
  const family = useStore((s) => s.family);
  const tasks = useStore((s) => s.tasks);
  const logs = useStore((s) => s.hoursLogs);
  const children = useStore((s) => s.children);
  const evidence = useStore((s) => s.evidence);
  const noi = useStore((s) => s.noi);
  const curricula = useStore((s) => s.curricula);
  const blocks = useStore((s) => s.blocks);

  return useMemo(() => complianceStatus({ family, tasks, logs, children, evidence, noi, curricula, blocks }), [family, tasks, logs, children, evidence, noi, curricula, blocks]);
}
