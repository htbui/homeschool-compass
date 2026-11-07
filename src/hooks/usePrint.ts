import { useState } from 'react';

import type { Task } from '@/lib/types';
import { worksheetHtml } from '@/lib/worksheet';
import { useStore } from '@/store/useStore';
import { printHtml } from '@/services/exportDoc';

/** Print one task as a worksheet, or several as a day packet. */
export function usePrint() {
  const [busy, setBusy] = useState(false);
  const print = async (tasks: Task[], title?: string) => {
    if (!tasks.length) return;
    const s = useStore.getState();
    setBusy(true);
    try {
      await printHtml(worksheetHtml(tasks, { children: s.children, curricula: s.curricula, parentName: s.family?.parentName }, title));
    } catch {
      // Closing the native print dialog without printing rejects on iOS; nothing to do.
    } finally {
      setBusy(false);
    }
  };
  return { print, busy };
}
