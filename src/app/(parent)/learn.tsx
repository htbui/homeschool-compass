import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { formatDate } from '@/lib/dates';
import { uid } from '@/lib/id';
import { CURRICULUM_PRESETS, pacing } from '@/lib/pacing';
import { PHILOSOPHY_INFO } from '@/lib/quiz';
import { CURRICULUM_SUGGESTIONS } from '@/lib/recommend';
import { SUBJECT_LIST, SUBJECTS, subjectLabel } from '@/lib/subjects';
import type { Curriculum, RhythmBlock, Subject } from '@/lib/types';
import { generateUnitStudy, TIER_LABEL, type UnitPlan } from '@/lib/unitStudy';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, Empty, Field, Pill, Progress, Row, Screen, Section, Segmented, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

type Tab = 'curricula' | 'unit';

const STATE_LABEL = {
  ahead: { text: 'Ahead', emoji: '🚀' },
  on_track: { text: 'On track', emoji: '✅' },
  behind: { text: 'Re-paced', emoji: '🌿' },
  done: { text: 'Finished', emoji: '🎓' },
  not_started: { text: 'Starts soon', emoji: '⏳' },
} as const;

export default function CurriculumHub() {
  const c = useColors();
  const [tab, setTab] = useState<Tab>('curricula');
  const curricula = useStore((s) => s.curricula);
  const kids = useStore((s) => s.children);
  const family = useStore((s) => s.family)!;
  const { upsertCurriculum, removeCurriculum, adjustLessons, upsertBlock } = useStore.getState();
  const [editing, setEditing] = useState<Curriculum | 'new' | null>(null);
  const confirm = useConfirm();

  const [theme, setTheme] = useState('');
  const [plan, setPlan] = useState<UnitPlan | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const primary = family.philosophy?.breakdown[0]?.philosophy;

  const scheduleUnit = () => {
    if (!plan) return;
    const block: RhythmBlock = {
      id: uid('b'),
      title: `Unit Study: ${plan.theme}`,
      subject: 'history',
      childIds: kids.map((k) => k.id),
      mode: 'group',
      start: '13:30',
      durationMin: 45,
      days: [1, 2, 3, 4, 5],
      icon: '🧭',
      steps: [plan.days[0].together],
    };
    upsertBlock(block);
    setScheduled(true);
  };

  return (
    <Screen>
      <T v="display">Curriculum</T>
      <T muted>Content-agnostic: Kinship paces and tracks whatever you already use.</T>
      <View style={{ marginTop: space.lg }}>
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'curricula', label: '📚 Pacing' }, { value: 'unit', label: '🧭 Unit Study Generator' }]} />
      </View>

      {tab === 'curricula' ? (
        <>
          <Section title="Your curricula" subtitle="Missed days are re-spread across the rest of the year — no backlog, no guilt." action={<Button size="sm" icon="＋" title="Add" onPress={() => setEditing('new')} />}>
            {curricula.length === 0 ? (
              <Empty icon="📚" title="No curricula yet" body="Add a textbook or program with its lesson count and Kinship calculates your weekly pace." />
            ) : (
              <Stack>
                {curricula.map((k) => {
                  const p = pacing(k, undefined);
                  const st = STATE_LABEL[p.state];
                  return (
                    <Card key={k.id}>
                      <Row style={{ justifyContent: 'space-between' }} wrap>
                        <T v="heading" style={{ flex: 1 }}>{SUBJECTS[k.subject].icon} {k.name}</T>
                        <Pill text={`${st.emoji} ${st.text}`} bg={p.state === 'behind' ? c.accentSoft : c.primarySoft} fg={c.text} />
                      </Row>
                      <T v="caption" muted>
                        {k.childIds.map((id) => kids.find((x) => x.id === id)?.name).filter(Boolean).join(', ')} · {k.model} · target {formatDate(k.targetEndDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </T>
                      <Progress value={k.lessonsDone / k.totalLessons} />
                      <T v="label">{k.lessonsDone} / {k.totalLessons} lessons</T>
                      {p.state !== 'done' ? (
                        <T v="caption">
                          Pace: <T v="caption" style={{ fontWeight: '700' }}>{p.lessonsPerWeek} lessons/week</T> ({p.lessonsPerDay}/day) over {p.remainingSchoolDays} school days left
                          {p.delta < 0 ? ` · ${-p.delta} behind the original plan, now spread out` : p.delta > 0 ? ` · ${p.delta} ahead` : ''}
                          {p.projectedFinish ? ` · at original pace you'd finish ${formatDate(p.projectedFinish, { month: 'short', day: 'numeric' })}` : ''}
                        </T>
                      ) : null}
                      <Row wrap>
                        <Button size="sm" kind="secondary" title="−1" onPress={() => adjustLessons(k.id, -1)} />
                        <Button size="sm" title="+1 lesson" onPress={() => adjustLessons(k.id, 1)} />
                        <Button size="sm" kind="ghost" title="Edit" onPress={() => setEditing(k)} />
                      </Row>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Section>
          {primary ? (
            <Section title={`Popular with ${PHILOSOPHY_INFO[primary].label} families`}>
              <Row wrap gap={6}>
                {CURRICULUM_SUGGESTIONS[primary].map((s) => (
                  <Chip key={s} label={s} />
                ))}
              </Row>
            </Section>
          ) : null}
        </>
      ) : (
        <>
          <Section title="Generate a 2-week unit study" subtitle="Everyone shares one theme; each child works at their own depth.">
            <Row gap={space.sm} align="flex-end">
              <View style={{ flex: 1 }}>
                <Field placeholder="Space Exploration, Ancient Egypt, Oceans…" value={theme} onChangeText={setTheme} />
              </View>
              <Button title="Generate" disabled={!theme.trim() || kids.length === 0} onPress={() => { setPlan(generateUnitStudy(theme, kids)); setScheduled(false); }} />
            </Row>
            <Row wrap gap={6}>
              {[...new Set([...family.interests, ...kids.flatMap((k) => k.passions)])].slice(0, 8).map((i) => (
                <Chip key={i} label={i} onPress={() => setTheme(i)} />
              ))}
            </Row>
          </Section>
          {plan ? (
            <Section title={`🧭 ${plan.theme}`} action={<Button size="sm" title={scheduled ? 'Added to rhythm ✓' : 'Add to rhythm'} disabled={scheduled} onPress={scheduleUnit} />}>
              <Stack>
                {plan.days.map((d) => (
                  <Card key={d.day}>
                    <T v="heading">Day {d.day} · {SUBJECTS[d.focus].icon} {subjectLabel(d.focus)}</T>
                    <T v="caption" color={c.group}>🔵 Together: {d.together}</T>
                    {d.perChild.map((p) => {
                      const k = kids.find((x) => x.id === p.childId);
                      return (
                        <T key={p.childId} v="caption">
                          {k?.avatar} <T v="caption" style={{ fontWeight: '700' }}>{k?.name}</T> ({TIER_LABEL[p.tier]}): {p.activity}
                        </T>
                      );
                    })}
                  </Card>
                ))}
              </Stack>
            </Section>
          ) : null}
        </>
      )}

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add curriculum' : 'Edit curriculum'}>
        {editing !== null ? (
          <CurriculumForm
            initial={editing === 'new' ? undefined : editing}
            onSave={(k) => {
              upsertCurriculum(k);
              setEditing(null);
            }}
            onDelete={editing === 'new' ? undefined : () => confirm.ask(`Remove ${editing.name}?`, () => { removeCurriculum(editing.id); setEditing(null); }, { confirm: 'Remove' })}
          />
        ) : null}
      </Sheet>
      {confirm.element}
    </Screen>
  );
}

function CurriculumForm({ initial, onSave, onDelete }: { initial?: Curriculum; onSave: (c: Curriculum) => void; onDelete?: () => void }) {
  const kids = useStore((s) => s.children);
  const family = useStore((s) => s.family)!;
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState<Subject>(initial?.subject ?? 'math');
  const [lessons, setLessons] = useState(String(initial?.totalLessons ?? ''));
  const [done, setDone] = useState(String(initial?.lessonsDone ?? 0));
  const [childIds, setChildIds] = useState<string[]>(initial?.childIds ?? kids.slice(0, 1).map((k) => k.id));
  const [model, setModel] = useState<Curriculum['model']>(initial?.model ?? 'turnkey');
  const [start, setStart] = useState(initial?.startDate ?? family.schoolYearStart);
  const [end, setEnd] = useState(initial?.targetEndDate ?? family.schoolYearEnd);
  const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const ok = name.trim() && Number(lessons) > 0 && childIds.length && dateOk(start) && dateOk(end) && end > start;
  const presets = useMemo(() => CURRICULUM_PRESETS, []);

  return (
    <Stack gap={space.lg}>
      {!initial ? (
        <View style={{ gap: 6 }}>
          <T v="label">Quick import</T>
          <Row wrap gap={6}>
            {presets.map((p) => (
              <Chip key={p.name} label={p.name} onPress={() => { setName(p.name); setSubject(p.subject); setLessons(String(p.lessons)); }} />
            ))}
          </Row>
        </View>
      ) : null}
      <Field label="Name" value={name} onChangeText={setName} />
      <View style={{ gap: 6 }}>
        <T v="label">Subject</T>
        <Row wrap gap={6}>
          {SUBJECT_LIST.map((s) => (
            <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={subject === s} onPress={() => setSubject(s)} />
          ))}
        </Row>
      </View>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}><Field label="Total lessons" keyboardType="number-pad" value={lessons} onChangeText={(v) => setLessons(v.replace(/\D/g, ''))} /></View>
        <View style={{ flex: 1 }}><Field label="Completed" keyboardType="number-pad" value={done} onChangeText={(v) => setDone(v.replace(/\D/g, ''))} /></View>
      </Row>
      <Row gap={space.md}>
        <View style={{ flex: 1 }}><Field label="Start" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" /></View>
        <View style={{ flex: 1 }}><Field label="Target finish" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" /></View>
      </Row>
      <View style={{ gap: 6 }}>
        <T v="label">Students</T>
        <Row wrap gap={6}>
          {kids.map((k) => (
            <Chip key={k.id} label={`${k.avatar} ${k.name}`} selected={childIds.includes(k.id)} onPress={() => setChildIds(childIds.includes(k.id) ? childIds.filter((x) => x !== k.id) : [...childIds, k.id])} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <T v="label">Model</T>
        <Row wrap gap={6}>
          {(['turnkey', 'modular', 'custom'] as const).map((m) => (
            <Chip key={m} label={m === 'turnkey' ? 'Turnkey / boxed' : m === 'modular' ? 'Modular / à la carte' : 'Custom / unit study'} selected={model === m} onPress={() => setModel(m)} />
          ))}
        </Row>
      </View>
      <Row style={{ justifyContent: 'flex-end' }}>
        {onDelete ? <Button kind="danger" title="Remove" onPress={onDelete} /> : null}
        <Button
          title="Save"
          disabled={!ok}
          onPress={() =>
            onSave({
              id: initial?.id ?? uid('c'),
              name: name.trim(),
              subject,
              childIds,
              totalLessons: Number(lessons),
              lessonsDone: Math.min(Number(done) || 0, Number(lessons)),
              startDate: start,
              targetEndDate: end,
              schoolDays: initial?.schoolDays ?? family.schoolDays,
              model,
            })
          }
        />
      </Row>
    </Stack>
  );
}
