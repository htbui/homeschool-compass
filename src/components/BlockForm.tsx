import { useState } from 'react';
import { View } from 'react-native';

import { WEEKDAY_SHORT } from '@/lib/dates';
import { uid } from '@/lib/id';
import { SUBJECT_LIST, SUBJECTS } from '@/lib/subjects';
import type { AttentionMode, RhythmBlock, Subject, Weekday } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Button, Chip, Field, MODE_META, Row, space, Stack, T } from '@/ui';

const DURATIONS = [10, 15, 20, 30, 45, 60, 90];

/** Edit a recurring rhythm block, or (with `oneOff`) a single task's details. */
export function BlockForm({
  initial,
  oneOff,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: Partial<RhythmBlock>;
  oneOff?: boolean;
  onSave: (b: RhythmBlock) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const kids = useStore((s) => s.children);
  const curricula = useStore((s) => s.curricula);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subject, setSubject] = useState<Subject>(initial?.subject ?? 'math');
  const [childIds, setChildIds] = useState<string[]>(initial?.childIds ?? (kids[0] ? [kids[0].id] : []));
  const [mode, setMode] = useState<AttentionMode>(initial?.mode ?? 'solo');
  const [start, setStart] = useState(initial?.start ?? '09:00');
  const [duration, setDuration] = useState(initial?.durationMin ?? 30);
  const [days, setDays] = useState<Weekday[]>(initial?.days ?? [1, 2, 3, 4, 5]);
  const [steps, setSteps] = useState((initial?.steps ?? []).join('\n'));
  const [icon, setIcon] = useState(initial?.icon ?? SUBJECTS[initial?.subject ?? 'math'].icon);
  const [curriculumId, setCurriculumId] = useState(initial?.curriculumId);

  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(start);
  const ok = title.trim() && childIds.length > 0 && timeOk && (oneOff || days.length > 0);
  const toggle = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Stack gap={space.lg}>
      <Field label="Title" placeholder="1-on-1 Phonics" value={title} onChangeText={setTitle} />
      <View style={{ gap: 6 }}>
        <T v="label">Subject</T>
        <Row wrap gap={6}>
          {SUBJECT_LIST.map((s) => (
            <Chip
              key={s}
              label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`}
              selected={subject === s}
              onPress={() => {
                setSubject(s);
                setIcon(SUBJECTS[s].icon);
              }}
            />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <T v="label">Who</T>
        <Row wrap gap={6}>
          {kids.map((k) => (
            <Chip
              key={k.id}
              label={`${k.avatar} ${k.name}`}
              color={k.color}
              selected={childIds.includes(k.id)}
              onPress={() => {
                const next = toggle(childIds, k.id);
                setChildIds(next);
                if (next.length > 1) setMode('group');
                else if (mode === 'group') setMode('solo');
              }}
            />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <T v="label">Parent attention</T>
        <Row wrap gap={6}>
          {(Object.keys(MODE_META) as AttentionMode[]).map((m) => (
            <Chip key={m} label={`${MODE_META[m].emoji} ${MODE_META[m].label}`} selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </Row>
        {childIds.length > 1 && mode !== 'group' ? <T v="caption" muted>Each selected child gets their own copy.</T> : null}
      </View>
      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}>
          <Field label="Start (HH:MM)" value={start} onChangeText={setStart} maxLength={5} hint={timeOk ? undefined : '24-hour time, e.g. 13:30'} />
        </View>
        <View style={{ width: 90 }}>
          <Field label="Icon" value={icon} onChangeText={setIcon} maxLength={4} />
        </View>
      </Row>
      <View style={{ gap: 6 }}>
        <T v="label">Minutes</T>
        <Row wrap gap={6}>
          {DURATIONS.map((d) => (
            <Chip key={d} label={`${d}`} selected={duration === d} onPress={() => setDuration(d)} />
          ))}
        </Row>
      </View>
      {!oneOff ? (
        <View style={{ gap: 6 }}>
          <T v="label">Days</T>
          <Row wrap gap={6}>
            {WEEKDAY_SHORT.map((d, i) => (
              <Chip key={d} label={d} selected={days.includes(i as Weekday)} onPress={() => setDays(toggle(days, i as Weekday))} />
            ))}
          </Row>
        </View>
      ) : null}
      {curricula.length ? (
        <View style={{ gap: 6 }}>
          <T v="label">Advances curriculum (optional)</T>
          <Row wrap gap={6}>
            <Chip label="None" selected={!curriculumId} onPress={() => setCurriculumId(undefined)} />
            {curricula.map((c) => (
              <Chip key={c.id} label={c.name} selected={curriculumId === c.id} onPress={() => setCurriculumId(c.id)} />
            ))}
          </Row>
        </View>
      ) : null}
      <Field label="Steps (one per line)" multiline value={steps} onChangeText={setSteps} placeholder={'Watch the lesson\nDo problems 1–10'} />
      <Row style={{ justifyContent: 'flex-end' }} wrap>
        {onDelete ? <Button title="Delete" kind="danger" onPress={onDelete} /> : null}
        <Button title="Cancel" kind="secondary" onPress={onCancel} />
        <Button
          title="Save"
          disabled={!ok}
          onPress={() =>
            onSave({
              id: initial?.id ?? uid('b'),
              title: title.trim(),
              subject,
              childIds,
              mode,
              start,
              durationMin: duration,
              days,
              icon: icon || SUBJECTS[subject].icon,
              steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
              curriculumId,
            })
          }
        />
      </Row>
    </Stack>
  );
}
