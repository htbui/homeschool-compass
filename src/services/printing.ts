import { usePrinter, type Paper } from '@/store/usePrinter';

import { printHtml } from './exportDoc';

/** Paper size via CSS too, so the browser and iOS/Android layout engines agree. */
const withPaper = (html: string, paper: Paper) => html.replace('<style>', `<style>@page{size:${paper === 'a4' ? 'A4' : 'letter'}}`);

/**
 * Print a document, asking a grown-up to set up printing the first time on
 * this device. Uses the saved printer when there is one (iOS), falling back
 * to the print dialog if it can't be reached.
 */
export async function printDocument(html: string, title: string): Promise<void> {
  const { config, openSetup } = usePrinter.getState();
  if (!config) {
    openSetup({ html, title });
    return;
  }
  await runPrint(html);
}

export async function runPrint(html: string): Promise<void> {
  const { config, setError } = usePrinter.getState();
  const paper = config?.paper ?? 'letter';
  const doc = withPaper(html, paper);
  if (config?.mode === 'saved' && config.url) {
    try {
      await printHtml(doc, { printerUrl: config.url, paper });
      setError(undefined);
      return;
    } catch {
      setError(`Couldn’t reach ${config.name ?? 'your printer'}. Pick a printer in the dialog, or change it in Settings → Printing.`);
    }
  }
  try {
    await printHtml(doc, { paper });
  } catch {
    // Dismissing the print dialog without printing rejects on iOS; nothing to do.
  }
}
