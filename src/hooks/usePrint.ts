import { useState } from 'react';

import type { Task } from '@/lib/types';
import { worksheetHtml } from '@/lib/worksheet';
import { useStore } from '@/store/useStore';
import { printDocument } from '@/services/printing';

/** Print one task as a worksheet, or several as a day packet. */
export function usePrint() {
  const [busy, setBusy] = useState(false);
  const print = async (tasks: Task[], title?: string) => {
    if (!tasks.length) return;
    const s = useStore.getState();
    setBusy(true);
    try {
      const html = worksheetHtml(tasks, { children: s.children, curricula: s.curricula, parentName: s.family?.parentName }, title);
      await printDocument(html, title ?? (tasks.length === 1 ? tasks[0].title : 'Lesson packet'));
    } finally {
      setBusy(false);
    }
  };
  return { print, busy };
}
