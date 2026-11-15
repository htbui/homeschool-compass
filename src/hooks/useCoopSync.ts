import { useEffect } from 'react';

import { familyProgress } from '@/lib/coop';
import { cloudEnabled } from '@/services/cloud';
import { myClasses, reportProgress } from '@/services/coopApi';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';

/** What was last sent per class, so unchanged progress isn't sent again. */
const sent = new Map<string, string>();

/**
 * Co-op classes, from the family's side: tells each teacher how far this
 * family's students have got (a moment after it changes), and notices when a
 * class has ended or the family was removed, so the plan stops expecting updates.
 */
export function useCoopSync() {
  const userId = useAccount((s) => s.userId);
  const key = useStore((s) =>
    s.curricula
      .filter((c) => c.coopClassId)
      .map((c) => `${c.coopClassId}:${JSON.stringify(familyProgress(c, s.children, !!c.coopShareNames))}:${c.totalLessons}:${c.packageVersion ?? 0}`)
      .join('|'),
  );

  useEffect(() => {
    // With the Freerange service but signed out, the classes aren't reachable right now.
    if (!key || (cloudEnabled && !userId)) return;
    const t = setTimeout(async () => {
      const mine = await myClasses().catch(() => undefined);
      if (!mine) return;
      const inClass = new Set(mine.map((m) => m.classId));
      const store = useStore.getState();
      for (const c of store.curricula.filter((x) => x.coopClassId)) {
        const id = c.coopClassId!;
        const ended = !inClass.has(id);
        if (ended !== !!c.coopEnded) store.upsertCurriculum({ ...c, coopEnded: ended || undefined });
        if (ended) continue;
        const progress = familyProgress(c, store.children, !!c.coopShareNames);
        const sig = `${userId ?? ''}:${JSON.stringify(progress)}:${c.totalLessons}:${c.packageVersion ?? 0}`;
        if (sent.get(id) === sig) continue;
        await reportProgress(id, progress, c.totalLessons, c.packageVersion)
          .then(() => sent.set(id, sig))
          .catch(() => {});
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [key, userId]);
}
