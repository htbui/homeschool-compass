import { useState } from 'react';

import { usePrint } from '@/hooks/usePrint';
import { kidsMayPrint } from '@/lib/kidRules';
import type { ID, Task } from '@/lib/types';
import { usePrinter } from '@/store/usePrinter';
import { useStore } from '@/store/useStore';
import { speak } from '@/services/speech';
import { Button, Sheet, T } from '@/ui';

/**
 * A kid's print button. Printing setup is a grown-up job, so before a printer is set up
 * on this device the kid is asked to fetch a grown-up instead of seeing paper sizes and
 * test pages. Hidden entirely when the parent turned off "Kids can print".
 */
export function KidPrintButton({ tasks, title, childId, label = '🖨️ Print', kind = 'ghost', nonReader }: { tasks: Task[]; title?: string; childId: ID; label?: string; kind?: 'ghost' | 'secondary'; nonReader?: boolean }) {
  const family = useStore((s) => s.family);
  const ready = usePrinter((s) => !!s.config);
  const openHelp = useStore((s) => s.help.some((h) => h.childId === childId && !h.resolvedAt));
  const { print, busy } = usePrint();
  const [asking, setAsking] = useState(false);
  if (!kidsMayPrint(family) || !tasks.length) return null;
  const grownUp = family?.parentName.split(' ')[0] || 'a grown-up';
  return (
    <>
      <Button
        kind={kind}
        size="sm"
        title={label}
        loading={busy}
        onPress={() => {
          if (ready) return print(tasks, title);
          setAsking(true);
          if (nonReader) speak(`Ask ${grownUp} to set up the printer.`);
        }}
      />
      <Sheet visible={asking} onClose={() => setAsking(false)} title="Ask a grown-up 🖨️">
        <T>The printer isn&apos;t set up on this device yet. Ask {grownUp} to set it up, then you can print.</T>
        {openHelp ? (
          <T muted>{grownUp} already got your message 👍</T>
        ) : (
          <Button
            size="lg"
            kind="accent"
            title={`Ask ${grownUp} for help ✋`}
            onPress={() => {
              useStore.getState().requestHelp(childId, undefined, 'Set up the printer');
              if (nonReader) speak(`${grownUp} got your message.`);
              setAsking(false);
            }}
          />
        )}
        <Button kind="secondary" title="OK" onPress={() => setAsking(false)} />
      </Sheet>
    </>
  );
}
