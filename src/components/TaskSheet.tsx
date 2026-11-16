import { useState } from 'react';
import { View } from 'react-native';

import { LessonCard } from '@/components/LessonMaterials';
import { usePrint } from '@/hooks/usePrint';
import { hasAnswerKey } from '@/lib/worksheet';
import { formatClock, formatDate } from '@/lib/dates';
import { parseCount } from '@/lib/parse';
import { subjectLabel } from '@/lib/subjects';
import type { Task } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Button, Chip, ConfirmButton, Field, ModeBadge, Pill, Row, Sheet, space, Stack, T, TimeField, useColors } from '@/ui';

const STATUS_LABEL: Record<Task['status'], string> = { todo: 'Not started', in_progress: 'In progress', done: 'Done ✓', skipped: 'Skipped' };

/** Parent-side detail for one task: steps, adjust time, mark done, skip. */
export function TaskSheet({ task, onClose }: { task?: Task; onClose: () => void }) {
  // Read the live task so step toggles and status changes re-render.
  const live = useStore((s) => s.tasks.find((t) => t.id === task?.id));
  if (!task || !live) return null;
  return (
    <Sheet visible onClose={onClose} title={`${live.icon} ${live.title}`}>
      {/* Keyed so the time fields re-initialize when the task's time changes. */}
      <TaskDetail key={`${live.id}-${live.start}-${live.durationMin}`} task={live} onClose={onClose} />
    </Sheet>
  );
}

function TaskDetail({ task: live, onClose }: { task: Task; onClose: () => void }) {
  const c = useColors();
  const child = useStore((s) => s.children.find((c) => c.id === live.childId));
  const { updateTask, completeTask, reopenTask, toggleStep, removeTask } = useStore.getState();
  const { print, printAnswers, busy: printing } = usePrint();
  const keyed = useStore((s) => hasAnswerKey(live, s));
  const [start, setStart] = useState<string | undefined>(live.start);
  const [dur, setDur] = useState(String(live.durationMin));
  const minutes = parseCount(dur);
  const changed = start !== live.start || minutes !== live.durationMin;
  const [more, setMore] = useState(false);

  return (
    <>
      <Row wrap gap={6}>
        <ModeBadge mode={live.mode} />
        <Pill text={subjectLabel(live.subject)} />
        <Pill text={`${child?.avatar ?? ''} ${child?.name ?? ''}`} />
        <Pill text={STATUS_LABEL[live.status] ?? live.status} tone={live.status === 'done' ? 'success' : undefined} />
      </Row>
      <T muted>
        {formatDate(live.date)} · {formatClock(live.start)} · {live.durationMin} min
        {live.bumpedFrom ? ` · bumped from ${formatDate(live.bumpedFrom)}` : ''}
      </T>
      <LessonCard task={live} />
      {live.steps.length ? (
        <Stack gap={6}>
          <T v="label">Steps</T>
          {live.steps.map((s) => (
            <Chip key={s.id} label={`${s.done ? '✓' : '○'}  ${s.label}`} selected={s.done} onPress={() => toggleStep(live.id, s.id)} />
          ))}
        </Stack>
      ) : null}
      {live.reflection ? <T>💭 “{live.reflection}”</T> : null}
      {live.minutesSpent ? <T v="caption" muted>Timer: {live.minutesSpent} min logged</T> : null}

      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}>
          <TimeField label="Start time" value={start} onChange={setStart} />
        </View>
        <View style={{ width: 110 }}>
          <Field label="Minutes" value={dur} onChangeText={setDur} keyboardType="number-pad" hint={minutes ? undefined : 'Whole minutes'} />
        </View>
      </Row>
      {/* Only once something changed: an always-there disabled button just takes up room. */}
      {changed ? (
        <Button
          title="Update time"
          kind="secondary"
          disabled={!start || !minutes}
          reason={!start ? 'Enter a valid start time' : 'Enter minutes greater than 0'}
          onPress={() => start && minutes && updateTask(live.id, { start, durationMin: minutes })}
        />
      ) : null}

      <Row wrap style={{ marginTop: space.sm }}>
        <Button title="Print worksheet" icon="🖨️" kind="secondary" size="sm" loading={printing} onPress={() => print([live])} />
        {keyed ? <Button title="Answer key" icon="🔑" kind="secondary" size="sm" loading={printing} onPress={() => printAnswers([live], `Answer key · ${live.title}`)} /> : null}
        {live.status !== 'skipped' && live.status !== 'done' ? <Button title="Skip today" kind="secondary" size="sm" onPress={() => updateTask(live.id, { status: 'skipped' })} /> : null}
        {live.status === 'skipped' ? <Button title="Restore" kind="secondary" size="sm" onPress={() => updateTask(live.id, { status: 'todo' })} /> : null}
        <Button title={more ? 'Less' : 'More…'} kind="ghost" size="sm" onPress={() => setMore(!more)} accessibilityLabel={more ? 'Fewer actions' : 'More actions'} />
      </Row>
      {/* The everyday action: full width, at the bottom where a thumb reaches it. */}
      {live.status === 'done' ? (
        <Button title="Reopen" kind="secondary" size="lg" onPress={() => reopenTask(live.id)} />
      ) : live.status === 'skipped' ? null : (
        <Button title="Mark done ✓" size="lg" onPress={() => completeTask(live.id)} />
      )}
      {/* Delete is tucked under "More…" and asks first: there's no undo. */}
      {more ? (
        <Row style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: space.sm }}>
          <ConfirmButton
            title="Delete task"
            question={`Delete “${live.title}” for ${formatDate(live.date)}?`}
            body="This only removes it from this day. The weekly rhythm keeps it."
            confirm="Delete"
            onConfirm={() => {
              removeTask(live.id);
              onClose();
            }}
          />
        </Row>
      ) : null}
    </>
  );
}
