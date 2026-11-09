import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { MaterialsEditor } from '@/components/LessonMaterials';
import { doneFor, forChild } from '@/lib/curriculum';
import { formatDate } from '@/lib/dates';
import { uid } from '@/lib/id';
import { CURRICULUM_PRESETS, pacing } from '@/lib/pacing';
import { parseCount } from '@/lib/parse';
import { PHILOSOPHY_INFO } from '@/lib/quiz';
import { SUBJECT_LIST, SUBJECTS, subjectLabel } from '@/lib/subjects';
import type { Curriculum, RhythmBlock, Subject } from '@/lib/types';
import { generateUnitStudy, TIER_LABEL, type UnitPlan } from '@/lib/unitStudy';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, DateField, Empty, Field, Pill, Progress, Row, Screen, Section, Segmented, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

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
  const { upsertCurriculum, removeCurriculum, upsertBlock } = useStore.getState();
  const [editing, setEditing] = useState<Curriculum | 'new' | null>(null);
  const [materialsFor, setMaterialsFor] = useState<string | null>(null);
  const materialsCur = curricula.find((k) => k.id === materialsFor);
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
      <T muted>Kinship paces and tracks any curriculum — one from the Marketplace, or one you already own.</T>
      <View style={{ marginTop: space.lg }}>
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'curricula', label: '📚 Pacing' }, { value: 'unit', label: '🧭 Unit Study Generator' }]} />
      </View>

      {tab === 'curricula' ? (
        <>
          <Section title="Your curricula" subtitle="Missed days are re-spread across the rest of the year — no backlog, no guilt." action={<Button size="sm" icon="＋" title="Add" onPress={() => setEditing('new')} />}>
            {curricula.length === 0 ? (
              <Empty
                icon="📚"
                title="No curricula yet"
                body="Find one in the Marketplace, or add a textbook you already own with its lesson count, and Kinship calculates your weekly pace."
                action={<Button title="Browse the Marketplace" onPress={() => router.push('/market')} />}
              />
            ) : (
              <Stack>
                {curricula.map((k) => (
                  <Card key={k.id}>
                    <T v="heading">{SUBJECTS[k.subject].icon} {k.name}</T>
                    <T v="caption" muted>
                      {k.childIds.map((id) => kids.find((x) => x.id === id)?.name).filter(Boolean).join(', ')} · {k.model} · target {formatDate(k.targetEndDate, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </T>
                    {k.childIds.map((id) => (
                      <KidProgress key={id} curriculum={k} childId={id} named={k.childIds.length > 1} />
                    ))}
                    <Row wrap>
                      <Button size="sm" kind="secondary" title={`📖 Lesson links & files${k.materials?.length ? ` (${k.materials.length})` : ''}`} onPress={() => setMaterialsFor(k.id)} />
                      <Button size="sm" kind="ghost" title="Edit" onPress={() => setEditing(k)} />
                    </Row>
                  </Card>
                ))}
              </Stack>
            )}
          </Section>
          <Section title="Where curricula come from">
            <Card>
              <T>
                <T style={{ fontWeight: '700' }}>🛍️ The Marketplace</T> — publishers list their curricula and families list used or homemade ones. Compare ratings and reviews, filter by your kids&apos; grades and your teaching style, then buy and add it to your plan in one step.
              </T>
              <T>
                <T style={{ fontWeight: '700' }}>📦 What you already own</T> — tap <T style={{ fontWeight: '700' }}>＋ Add</T> and enter the lesson count (or pick a popular program from Quick import). Kinship doesn&apos;t need to sell it to pace it.
              </T>
              <T>
                <T style={{ fontWeight: '700' }}>📕 Lesson by lesson</T> — paste a book&apos;s table of contents and Studio turns it into daily lessons with page ranges (private to your family). Or build your own, or adapt a free online course.
              </T>
              <Row wrap>
                <Button title="Browse the Marketplace" onPress={() => router.push('/market')} />
                {primary ? <Button kind="secondary" title={`${PHILOSOPHY_INFO[primary].emoji} Picks for ${PHILOSOPHY_INFO[primary].label}`} onPress={() => router.push({ pathname: '/market', params: { style: primary } })} /> : null}
                <Button kind="secondary" title="📕 Convert a book you own" onPress={() => router.push({ pathname: '/studio/import', params: { from: 'book' } })} />
                <Button kind="ghost" title="🎨 Make your own in Studio" onPress={() => router.push('/studio/new')} />
              </Row>
            </Card>
          </Section>
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
      <Sheet visible={!!materialsCur} onClose={() => setMaterialsFor(null)} title={`📖 ${materialsCur?.name ?? ''}`}>
        {materialsCur ? <MaterialsEditor curriculumId={materialsCur.id} /> : null}
      </Sheet>
      {confirm.element}
    </Screen>
  );
}

/** One student's progress and pace through a curriculum. */
function KidProgress({ curriculum, childId, named }: { curriculum: Curriculum; childId: string; named: boolean }) {
  const c = useColors();
  const kid = useStore((s) => s.children.find((x) => x.id === childId));
  const { adjustLessons } = useStore.getState();
  const done = doneFor(curriculum, childId);
  const p = pacing(forChild(curriculum, childId), undefined);
  const st = STATE_LABEL[p.state];
  return (
    <Stack gap={4} style={named ? { borderTopWidth: 1, borderColor: c.border, paddingTop: space.sm } : undefined}>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <T v="label" style={{ flex: 1 }}>{named ? `${kid?.avatar ?? ''} ${kid?.name ?? 'Student'} · ` : ''}{done} / {curriculum.totalLessons} lessons</T>
        <Pill text={`${st.emoji} ${st.text}`} bg={p.state === 'behind' ? c.accentSoft : c.primarySoft} fg={c.text} />
      </Row>
      <Progress value={done / curriculum.totalLessons} />
      {p.state !== 'done' ? (
        <T v="caption">
          Pace: <T v="caption" style={{ fontWeight: '700' }}>{p.lessonsPerWeek} lessons/week</T> ({p.lessonsPerDay}/day) over {p.remainingSchoolDays} school days left
          {p.delta < 0 ? ` · ${-p.delta} behind the original plan, now spread out` : p.delta > 0 ? ` · ${p.delta} ahead` : ''}
          {p.projectedFinish ? ` · at original pace you'd finish ${formatDate(p.projectedFinish, { month: 'short', day: 'numeric' })}` : ''}
        </T>
      ) : null}
      <Row wrap>
        <Button size="sm" kind="secondary" title="−1" onPress={() => adjustLessons(curriculum.id, -1, childId)} />
        <Button size="sm" title={named ? `+1 lesson for ${kid?.name ?? 'student'}` : '+1 lesson'} onPress={() => adjustLessons(curriculum.id, 1, childId)} />
      </Row>
    </Stack>
  );
}

function CurriculumForm({ initial, onSave, onDelete }: { initial?: Curriculum; onSave: (c: Curriculum) => void; onDelete?: () => void }) {
  const kids = useStore((s) => s.children);
  const family = useStore((s) => s.family)!;
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState<Subject>(initial?.subject ?? 'math');
  const [lessons, setLessons] = useState(String(initial?.totalLessons ?? ''));
  const [childIds, setChildIds] = useState<string[]>(initial?.childIds ?? kids.slice(0, 1).map((k) => k.id));
  // Lessons finished so far, per student.
  const [done, setDone] = useState<Record<string, string>>(() => Object.fromEntries(kids.map((k) => [k.id, String(initial && initial.childIds.includes(k.id) ? doneFor(initial, k.id) : 0)])));
  const [model, setModel] = useState<Curriculum['model']>(initial?.model ?? 'turnkey');
  const [start, setStart] = useState<string | undefined>(initial?.startDate ?? family.schoolYearStart);
  const [end, setEnd] = useState<string | undefined>(initial?.targetEndDate ?? family.schoolYearEnd);
  const total = parseCount(lessons);
  const countOf = (v = '') => (v.trim() === '' || v.trim() === '0' ? 0 : parseCount(v));
  const completed = Object.fromEntries(childIds.map((id) => [id, countOf(done[id])]));
  const counts = Object.values(completed);
  const missing = [
    !name.trim() && 'a name',
    !total && 'total lessons',
    counts.some((n) => n === undefined) && 'a whole number of completed lessons',
    total && counts.some((n) => n !== undefined && n > total) && 'completed ≤ total',
    childIds.length === 0 && 'at least one student',
    !start && 'a start date',
    !end && 'a target finish date',
    start && end && end <= start && 'a finish date after the start',
  ].filter(Boolean);
  const ok = missing.length === 0;
  const presets = useMemo(() => CURRICULUM_PRESETS, []);

  return (
    <Stack gap={space.lg}>
      {!initial ? (
        <View style={{ gap: 6 }}>
          <T v="caption" muted>Track a curriculum you already own. Looking for something new? Browse the Marketplace.</T>
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
      <Field label="Total lessons" keyboardType="number-pad" value={lessons} onChangeText={setLessons} placeholder="120" />
      <Row gap={space.md} align="flex-start" wrap>
        <View style={{ flex: 1, minWidth: 200 }}><DateField label="Start" value={start} onChange={setStart} /></View>
        <View style={{ flex: 1, minWidth: 200 }}><DateField label="Target finish" value={end} onChange={setEnd} /></View>
      </Row>
      <View style={{ gap: 6 }}>
        <T v="label">Students</T>
        <Row wrap gap={6}>
          {kids.map((k) => (
            <Chip key={k.id} label={`${k.avatar} ${k.name}`} selected={childIds.includes(k.id)} onPress={() => setChildIds(childIds.includes(k.id) ? childIds.filter((x) => x !== k.id) : [...childIds, k.id])} />
          ))}
        </Row>
      </View>
      {childIds.length ? (
        <Row gap={space.md} align="flex-start" wrap>
          {kids
            .filter((k) => childIds.includes(k.id))
            .map((k) => (
              <View key={k.id} style={{ flex: 1, minWidth: 140 }}>
                <Field label={childIds.length > 1 ? `${k.name}: lessons done` : 'Completed so far'} keyboardType="number-pad" value={done[k.id] ?? ''} onChangeText={(v) => setDone({ ...done, [k.id]: v })} placeholder="0" />
              </View>
            ))}
        </Row>
      ) : null}
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
          reason={`Still needed: ${missing.join(', ')}`}
          onPress={() =>
            total &&
            start &&
            end &&
            onSave({
              id: initial?.id ?? uid('c'),
              name: name.trim(),
              subject,
              childIds,
              totalLessons: total,
              lessonsDone: Math.min(total, ...counts.map((n) => n ?? 0)),
              progress: Object.fromEntries(childIds.map((id) => [id, Math.min(total, completed[id] ?? 0)])),
              materials: initial?.materials,
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
