import { useState } from 'react';
import { View } from 'react-native';

import { formatClock, formatDate } from '@/lib/dates';
import { parseCount } from '@/lib/parse';
import { subjectLabel } from '@/lib/subjects';
import type { Task } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Button, Chip, Field, ModeBadge, Pill, Row, Sheet, space, Stack, T, TimeField } from '@/ui';

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
  const child = useStore((s) => s.children.find((c) => c.id === live.childId));
  const { updateTask, completeTask, reopenTask, toggleStep, removeTask } = useStore.getState();
  const [start, setStart] = useState<string | undefined>(live.start);
  const [dur, setDur] = useState(String(live.durationMin));
  const minutes = parseCount(dur);
  const changed = start !== live.start || minutes !== live.durationMin;

  return (
    <>
      <Row wrap gap={6}>
        <ModeBadge mode={live.mode} />
        <Pill text={subjectLabel(live.subject)} />
        <Pill text={`${child?.avatar ?? ''} ${child?.name ?? ''}`} />
        <Pill text={live.status.replace('_', ' ')} />
      </Row>
      <T muted>
        {formatDate(live.date)} · {formatClock(live.start)} · {live.durationMin} min
        {live.bumpedFrom ? ` · bumped from ${formatDate(live.bumpedFrom)}` : ''}
      </T>
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
      <Button
        title="Update time"
        kind="secondary"
        disabled={!start || !minutes || !changed}
        reason={!start ? 'Enter a valid start time' : !minutes ? 'Enter minutes greater than 0' : 'Change the time or length to update'}
        onPress={() => start && minutes && updateTask(live.id, { start, durationMin: minutes })}
      />

      <Row wrap style={{ justifyContent: 'flex-end', marginTop: space.sm }}>
        <Button
          title="Delete"
          kind="danger"
          onPress={() => {
            removeTask(live.id);
            onClose();
          }}
        />
        {live.status !== 'skipped' && live.status !== 'done' ? <Button title="Skip today" kind="secondary" onPress={() => updateTask(live.id, { status: 'skipped' })} /> : null}
        {live.status === 'skipped' ? <Button title="Restore" kind="secondary" onPress={() => updateTask(live.id, { status: 'todo' })} /> : null}
        {live.status === 'done' ? (
          <Button title="Reopen" kind="secondary" onPress={() => reopenTask(live.id)} />
        ) : (
          <Button title="Mark done ✓" onPress={() => completeTask(live.id)} />
        )}
      </Row>
    </>
  );
}
