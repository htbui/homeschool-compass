import { BlockForm } from '@/components/BlockForm';
import { formatDate } from '@/lib/dates';
import type { DateKey } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Sheet } from '@/ui';

/** Add a one-off task to a single day, right where the parent is (Today or the Rhythm). */
export function OneOffTaskSheet({ date, onClose, onSaved }: { date?: DateKey; onClose: () => void; onSaved?: (n: number) => void }) {
  const addTask = useStore((s) => s.addTask);
  return (
    <Sheet visible={!!date} onClose={onClose} title={`One-off task · ${date ? formatDate(date) : ''}`}>
      {date ? (
        <BlockForm
          oneOff
          onCancel={onClose}
          onSave={(b) => {
            const groupKey = b.mode === 'group' ? `oneoff-${b.id}` : undefined;
            for (const childId of b.childIds) {
              addTask({ childId, date, title: b.title, subject: b.subject, mode: b.mode, start: b.start, durationMin: b.durationMin, icon: b.icon, steps: b.steps, groupKey, curriculumId: b.curriculumId });
            }
            onSaved?.(b.childIds.length);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}
