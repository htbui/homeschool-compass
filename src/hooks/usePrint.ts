import { useState } from 'react';

import type { Task } from '@/lib/types';
import { answerKeyHtml, worksheetHtml } from '@/lib/worksheet';
import { useStore } from '@/store/useStore';
import { printDocument } from '@/services/printing';

/** Print one task as a worksheet, or several as a day packet (and the parents' answer key). */
export function usePrint() {
  const [busy, setBusy] = useState(false);
  const print = async (tasks: Task[], title?: string) => {
    if (!tasks.length) return;
    const s = useStore.getState();
    setBusy(true);
    try {
      const html = worksheetHtml(tasks, { children: s.children, curricula: s.curricula, tasks: s.tasks, parentName: s.family?.parentName }, title);
      await printDocument(html, title ?? (tasks.length === 1 ? tasks[0].title : 'Lesson packet'));
    } finally {
      setBusy(false);
    }
  };
  /** The grown-ups' answer sheet for the same tasks. */
  const printAnswers = async (tasks: Task[], title = 'Answer key') => {
    if (!tasks.length) return;
    const s = useStore.getState();
    setBusy(true);
    try {
      await printDocument(answerKeyHtml(tasks, { children: s.children, curricula: s.curricula, tasks: s.tasks, parentName: s.family?.parentName }, title), title);
    } finally {
      setBusy(false);
    }
  };
  return { print, printAnswers, busy };
}
