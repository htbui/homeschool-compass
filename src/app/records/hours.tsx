import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useCompliance } from '@/hooks/useCompliance';
import { formatDate, todayKey } from '@/lib/dates';
import { toHours } from '@/lib/hours';
import { parseCount } from '@/lib/parse';
import { SUBJECT_LIST, SUBJECTS, subjectLabel } from '@/lib/subjects';
import type { Subject } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, DateField, Field, Row, Screen, Section, space, Stack, T } from '@/ui';

export default function HoursScreen() {
  const kids = useStore((s) => s.children);
  const logs = useStore((s) => s.hoursLogs);
  const tasks = useStore((s) => s.tasks);
  const { addHoursLog, removeHoursLog } = useStore.getState();
  const { perChild, law } = useCompliance();

  const [childIds, setChildIds] = useState<string[]>(kids.map((k) => k.id));
  const [subject, setSubject] = useState<Subject>('pe');
  const [minutes, setMinutes] = useState('60');
  const [date, setDate] = useState<string | undefined>(todayKey());
  const [note, setNote] = useState('');

  const recentDone = useMemo(() => tasks.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 12), [tasks]);
  const kid = (id: string) => kids.find((k) => k.id === id);
  const mins = parseCount(minutes);
  const missing = [childIds.length === 0 && 'at least one child', !mins && 'minutes', !date && 'a valid date'].filter(Boolean);
  const ok = missing.length === 0;

  return (
    <Screen edges={[]}>
      <T muted>Completed tasks log automatically (timer minutes, or planned length). Add field trips, co-op classes, music lessons, and other off-app learning here.</T>

      <Section title="By subject">
        <Stack gap={space.sm}>
          {perChild.map(({ child, summary }) => (
            <Card key={child.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="heading">{child.avatar} {child.name}</T>
                <T v="label">{toHours(summary.totalMin)} h{law?.requiredHours ? ` / ${law.requiredHours}` : ''}</T>
              </Row>
              <Row wrap gap={6}>
                {(Object.entries(summary.bySubject) as [Subject, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, m]) => (
                    <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label} ${toHours(m)}h${SUBJECTS[s].core ? '' : ' ·nc'}`} />
                  ))}
              </Row>
            </Card>
          ))}
        </Stack>
      </Section>

      <Section title="Log off-app learning">
        <Card>
          <Row wrap gap={6}>
            {kids.map((k) => (
              <Chip key={k.id} label={`${k.avatar} ${k.name}`} selected={childIds.includes(k.id)} onPress={() => setChildIds(childIds.includes(k.id) ? childIds.filter((x) => x !== k.id) : [...childIds, k.id])} />
            ))}
          </Row>
          <Row wrap gap={6}>
            {SUBJECT_LIST.map((s) => (
              <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={subject === s} onPress={() => setSubject(s)} />
            ))}
          </Row>
          <Row gap={space.md} align="flex-start">
            <View style={{ width: 110 }}><Field label="Minutes" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} /></View>
            <View style={{ flex: 1 }}><DateField label="Date" value={date} onChange={setDate} validate={(d) => (d > todayKey() ? "Can't log time in the future" : undefined)} /></View>
          </Row>
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Swim lessons, museum field trip…" />
          <Button
            title="Add log"
            disabled={!ok}
            reason={`Still needed: ${missing.join(', ')}`}
            onPress={() => {
              if (!date || !mins) return;
              for (const childId of childIds) addHoursLog({ childId, date, subject, minutes: mins, note: note.trim() || undefined });
              setNote('');
            }}
          />
        </Card>
      </Section>

      <Section title="Manual logs">
        <Stack gap={6}>
          {logs.length === 0 ? <T muted>None yet.</T> : null}
          {logs.slice(0, 50).map((l) => (
            <Row key={l.id} style={{ justifyContent: 'space-between' }}>
              <T style={{ flex: 1 }}>
                {kid(l.childId)?.avatar} {formatDate(l.date)} · {subjectLabel(l.subject)} · {l.minutes} min{l.note ? ` · ${l.note}` : ''}
              </T>
              <Button kind="ghost" size="sm" title="Remove" onPress={() => removeHoursLog(l.id)} />
            </Row>
          ))}
        </Stack>
      </Section>

      <Section title="Recently auto-logged">
        <Stack gap={6}>
          {recentDone.length === 0 ? <T muted>Complete tasks in Today or Kid mode to see them here.</T> : null}
          {recentDone.map((t) => (
            <T key={t.id} v="caption">
              {kid(t.childId)?.avatar} {formatDate(t.date)} · {t.title} · {t.minutesSpent || t.durationMin} min
            </T>
          ))}
        </Stack>
      </Section>
    </Screen>
  );
}
