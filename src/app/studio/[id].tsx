import { router, Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Linking from 'expo-linking';

import { AccountNote, needsAccount } from '@/components/AccountNote';
import { CopyButton } from '@/components/CopyButton';
import { SwitchRow } from '@/components/SwitchRow';
import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { money } from '@/components/market/ListingCard';
import { normalizeUrl } from '@/lib/curriculum';
import { formatDate } from '@/lib/dates';
import { parseOutline } from '@/lib/importers';
import { insightSentences, MIN_FAMILIES, type Insight } from '@/lib/insights';
import { LICENSE_INFO, licenseName, ORIGINAL_LICENSES, SOURCE_LICENSES, type LicenseKind } from '@/lib/license';
import { FORMAT_LABEL, GRADE_LABELS, INVOLVEMENT_LABEL, PHILOSOPHY_SHORT, type Involvement, type ListingFormat } from '@/lib/market';
import {
  allLessons,
  attributionFor,
  hasUnpublishedChanges,
  LEVEL_LABEL,
  lessonTotal,
  newLesson,
  newUnit,
  ORIGIN_LABEL,
  packageToListing,
  planThemes,
  privateForGood,
  publishAction,
  publishIssues,
  publishRules,
  THEME_IDEAS,
  type CurriculumPackage,
  type LessonLevel,
  type LessonVersion,
  type PackageLesson,
  type PackageUnit,
  type ThemedVersion,
} from '@/lib/package';
import { draftKey } from '@/lib/draft';
import { parseCount, parseMoney } from '@/lib/parse';
import { planCsv, planFileName, planHtml } from '@/lib/planExport';
import { parseStandardList, standardCode, standardLabel, strandsFor } from '@/lib/standards';
import { SUBJECT_LIST, SUBJECTS } from '@/lib/subjects';
import { plural } from '@/lib/text';
import type { Philosophy } from '@/lib/types';
import { exportHtml, shareText } from '@/services/exportDoc';
import { lessonInsights, type InsightsResult } from '@/services/insights';
import { deletePackage, publishPackage, savePackage, unpublishPackage } from '@/services/studioApi';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';
import { Actions, Button, Card, Chip, ConfirmButton, Empty, Field, Pill, Row, Screen, Section, Segmented, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

type Tab = 'details' | 'lessons' | 'publish' | 'insights';
const COVERS = ['📘', '🧮', '🔤', '📚', '✏️', '🌱', '🔬', '🏛️', '🌎', '🎨', '🎵', '🧩', '🍕', '🌻', '🐋', '🚀', '🕊️', '🧺'];
const PHILOSOPHIES = Object.keys(PHILOSOPHY_SHORT) as Philosophy[];
/** Reorder arrows: a 44 pt square to tap, not just the glyph. */
const ARROW = { minWidth: 44, alignItems: 'stretch' } as const;
const gradeName = (g: number) => (g < 0 ? 'Pre-K' : g === 0 ? 'K' : `Grade ${g}`);
const GRADE_MIN = -1;
const GRADE_MAX = GRADE_LABELS.length - 2;

/** "From  ‹ Grade 3 ›": one compact control per end of the grade range instead of 14 chips each. */
function GradeStepper({ which, grade, onChange }: { which: 'From' | 'To'; grade: number; onChange: (g: number) => void }) {
  const c = useColors();
  return (
    <Row gap={4} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 4, backgroundColor: c.surface }}>
      <T v="caption" muted style={{ paddingLeft: 6 }}>{which}</T>
      <Button size="sm" kind="ghost" title="‹" style={ARROW} accessibilityLabel={`${which}: lower grade`} disabled={grade <= GRADE_MIN} onPress={() => onChange(grade - 1)} />
      <T v="label" style={{ minWidth: 64, textAlign: 'center' }} accessibilityLiveRegion="polite" aria-label={`${which} ${gradeName(grade)}`}>{gradeName(grade)}</T>
      <Button size="sm" kind="ghost" title="›" style={ARROW} accessibilityLabel={`${which}: higher grade`} disabled={grade >= GRADE_MAX} onPress={() => onChange(grade + 1)} />
    </Row>
  );
}

/** A collapsible group in a long form; shows a one-line summary while closed. */
function Fold({ title, summary, open: initial = false, children }: { title: string; summary?: string; open?: boolean; children: ReactNode }) {
  const c = useColors();
  const [open, setOpen] = useState(initial);
  return (
    <View style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: space.sm, gap: space.md }}>
      <Pressable role="button" aria-expanded={open} onPress={() => setOpen(!open)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <T v="heading" style={{ width: 18 }}>{open ? '▾' : '▸'}</T>
        <View style={{ flex: 1 }}>
          <T v="heading">{title}</T>
          {!open && summary ? <T v="caption" muted numberOfLines={1}>{summary}</T> : null}
        </View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}
const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
};

/** Edit a curriculum package: details, lessons, and licensing/publishing. */
export default function PackageEditor() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const c = useColors();
  const pkg = useStudio((s) => s.packages.find((p) => p.id === id));
  const [tab, setTab] = useState<Tab>(initialTab === 'lessons' || initialTab === 'publish' || initialTab === 'insights' ? initialTab : 'details');

  if (!pkg) {
    return (
      <Screen edges={[]}>
        <Empty
          icon="🔎"
          title="Curriculum not found"
          body={needsAccount('It may have been deleted, or it’s in your Studio on another device: sign in there and here to sync.', 'It may have been deleted, or it was made on another device.')}
          action={<Button title="Back to Studio" onPress={() => router.replace('/studio')} />}
        />
      </Screen>
    );
  }
  const update = (patch: Partial<CurriculumPackage>) => savePackage({ ...pkg, ...patch });
  const changed = hasUnpublishedChanges(pkg);
  // Insights need a published listing for families to report on.
  const insights = pkg.status === 'published' && !!pkg.listingId;

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: pkg.title || 'Untitled curriculum' }} />
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <T v="title" style={{ flex: 1 }}>{pkg.cover} {pkg.title || 'Untitled curriculum'}</T>
        <Pill text={pkg.status === 'published' ? `Published v${pkg.version}` : privateForGood(pkg) ? '🔒 Private' : 'Draft'} />
      </Row>
      <T v="caption" muted>{ORIGIN_LABEL[pkg.origin.kind]} · {lessonTotal(pkg.units)} lessons · saved automatically</T>
      {changed ? <T v="caption" color={c.accentInk}>You have changes that aren’t published yet — publish an update from the Publish tab.</T> : null}
      <View style={{ marginTop: space.md }}>
        <Segmented<Tab>
          scroll
          value={tab}
          onChange={setTab}
          options={[
            { value: 'details', label: '📝 Details' },
            { value: 'lessons', label: `📚 Lessons (${lessonTotal(pkg.units)})` },
            { value: 'publish', label: pkg.origin.kind === 'owned_book' ? '🏠 Use' : '🚀 Publish' },
            ...(insights ? [{ value: 'insights' as const, label: '📈 Insights' }] : []),
          ]}
        />
      </View>
      {tab === 'details' ? (
        <Details pkg={pkg} update={update} />
      ) : tab === 'lessons' ? (
        <Lessons pkg={pkg} update={update} />
      ) : tab === 'insights' && insights ? (
        <Insights pkg={pkg} />
      ) : (
        <Publish pkg={pkg} update={update} />
      )}
    </Screen>
  );
}

type Update = (patch: Partial<CurriculumPackage>) => void;

// ───────────────────────────── Details

function Details({ pkg, update }: { pkg: CurriculumPackage; update: Update }) {
  const [minutes, setMinutes] = useState(String(pkg.minutesPerLesson));
  const [perWeek, setPerWeek] = useState(String(pkg.lessonsPerWeek));
  const toggle = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Stack gap={space.lg} style={{ marginTop: space.lg }}>
      <Field label="Title" value={pkg.title} onChangeText={(title) => update({ title })} maxLength={160} />
      <Field label="Description" value={pkg.description} onChangeText={(description) => update({ description })} multiline maxLength={4000} placeholder="Who it's for, how lessons work, what makes it special." />
      <Stack gap={6}>
        <T v="label">Subjects</T>
        <Row wrap gap={6}>
          {SUBJECT_LIST.map((s) => (
            <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={pkg.subjects.includes(s)} onPress={() => update({ subjects: toggle(pkg.subjects, s) })} />
          ))}
        </Row>
      </Stack>
      <Stack gap={6}>
        <T v="label">Grades: {GRADE_LABELS[pkg.gradeMin + 1]} to {GRADE_LABELS[pkg.gradeMax + 1]}</T>
        <Row wrap gap={space.md}>
          <GradeStepper which="From" grade={pkg.gradeMin} onChange={(g) => update({ gradeMin: g, gradeMax: Math.max(pkg.gradeMax, g) })} />
          <GradeStepper which="To" grade={pkg.gradeMax} onChange={(g) => update({ gradeMax: g, gradeMin: Math.min(pkg.gradeMin, g) })} />
        </Row>
      </Stack>
      <Stack gap={6}>
        <T v="label">Teaching styles it suits</T>
        <Row wrap gap={6}>
          {PHILOSOPHIES.map((p) => (
            <Chip key={p} label={PHILOSOPHY_SHORT[p]} selected={pkg.philosophies.includes(p)} onPress={() => update({ philosophies: toggle(pkg.philosophies, p) })} />
          ))}
        </Row>
      </Stack>
      <Stack gap={6}>
        <T v="label">Parent involvement</T>
        <Row wrap gap={6}>
          {(Object.keys(INVOLVEMENT_LABEL) as Involvement[]).map((k) => (
            <Chip key={k} role="radio" label={INVOLVEMENT_LABEL[k]} selected={pkg.parentInvolvement === k} onPress={() => update({ parentInvolvement: k })} />
          ))}
        </Row>
      </Stack>
      <SwitchRow label="Siblings can do it together" hint="One lesson for several kids at once (family style)." value={pkg.familyStyle} onChange={(familyStyle) => update({ familyStyle })} />
      <Row gap={space.md} align="flex-start" wrap>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Field label="Minutes per lesson" value={minutes} keyboardType="number-pad" onChangeText={(v) => { setMinutes(v); const n = parseCount(v); if (n && n <= 480) update({ minutesPerLesson: n }); }} hint={parseCount(minutes) && parseCount(minutes)! <= 480 ? undefined : '1–480 minutes'} />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Field label="Lessons per week" value={perWeek} keyboardType="number-pad" onChangeText={(v) => { setPerWeek(v); const n = parseCount(v); if (n && n <= 7) update({ lessonsPerWeek: n }); }} hint={parseCount(perWeek) && parseCount(perWeek)! <= 7 ? undefined : '1–7 a week'} />
        </View>
      </Row>
      <Stack gap={6}>
        <T v="label">Format</T>
        <Row wrap gap={6}>
          {(Object.keys(FORMAT_LABEL) as ListingFormat[]).map((f) => (
            <Chip key={f} label={FORMAT_LABEL[f]} selected={pkg.format === f} onPress={() => update({ format: f })} />
          ))}
        </Row>
      </Stack>
      <Stack gap={6}>
        <T v="label">Cover</T>
        <Row wrap gap={6}>
          {COVERS.map((e) => (
            <Chip key={e} label={e} selected={pkg.cover === e} onPress={() => update({ cover: e })} />
          ))}
        </Row>
      </Stack>
    </Stack>
  );
}

// ───────────────────────────── Lessons

function Lessons({ pkg, update }: { pkg: CurriculumPackage; update: Update }) {
  const c = useColors();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ unit: number; lesson: number } | null>(null);
  const [pasting, setPasting] = useState(false);
  const setUnits = (units: PackageUnit[]) => update({ units });
  const setUnit = (i: number, u: PackageUnit) => setUnits(pkg.units.map((x, j) => (j === i ? u : x)));
  // Number of lessons before each unit, for continuous numbering.
  const offsets = pkg.units.map((_, i) => pkg.units.slice(0, i).reduce((a, u) => a + u.lessons.length, 0));

  return (
    <Stack gap={space.md} style={{ marginTop: space.lg }}>
      {pkg.units.length === 0 ? <Empty icon="📚" title="No lessons yet" body="Add a unit, or paste an outline to fill it in quickly." /> : null}
      {pkg.units.map((u, ui) => (
        <Card key={u.id}>
          <Row gap={space.sm} align="flex-end">
            <View style={{ flex: 1 }}>
              <Field label={`Unit ${ui + 1}`} value={u.title} onChangeText={(title) => setUnit(ui, { ...u, title })} placeholder="Unit name" />
            </View>
            <Button size="sm" kind="ghost" title="↑" style={ARROW} accessibilityLabel={`Move unit ${ui + 1} up`} disabled={ui === 0} onPress={() => setUnits(move(pkg.units, ui, ui - 1))} />
            <Button size="sm" kind="ghost" title="↓" style={ARROW} accessibilityLabel={`Move unit ${ui + 1} down`} disabled={ui === pkg.units.length - 1} onPress={() => setUnits(move(pkg.units, ui, ui + 1))} />
            <Button
              size="sm"
              kind="ghost"
              title="Remove"
              onPress={() =>
                u.lessons.length
                  ? confirm.ask(`Remove “${u.title || `Unit ${ui + 1}`}” and its ${u.lessons.length} lessons?`, () => setUnits(pkg.units.filter((_, j) => j !== ui)), { confirm: 'Remove' })
                  : setUnits(pkg.units.filter((_, j) => j !== ui))
              }
            />
          </Row>
          {u.lessons.map((l, li) => {
            const num = offsets[ui] + li + 1;
            return (
              <Row key={l.id} gap={4} style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: 6 }}>
                <Pressable accessibilityRole="button" onPress={() => setEditing({ unit: ui, lesson: li })} style={{ flex: 1, gap: 2 }}>
                  <T>
                    <T muted>{num}. </T>
                    {l.title || <T color={c.danger}>Untitled lesson</T>}
                  </T>
                  <T v="caption" muted>
                    {[
                      l.pages && `pp. ${l.pages}`,
                      l.minutes && `${l.minutes} min`,
                      l.steps.length && `${l.steps.length} steps`,
                      l.links.length && `🔗 ${l.links.length}`,
                      l.questions.length && `✏️ ${l.questions.length}`,
                      (l.versions?.easier || l.versions?.harder) && `🌗 ${[l.versions?.easier && 'easier', l.versions?.harder && 'harder'].filter(Boolean).join(' & ')}`,
                      l.themes?.length && `🎨 ${l.themes.map((t) => t.theme).join(', ')}`,
                      l.standards?.length && `🎯 ${l.standards.length} standard${l.standards.length === 1 ? '' : 's'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Tap to add steps, pages, links, questions'}
                  </T>
                </Pressable>
                <Button size="sm" kind="ghost" title="↑" style={ARROW} accessibilityLabel={`Move lesson ${num} up`} disabled={li === 0} onPress={() => setUnit(ui, { ...u, lessons: move(u.lessons, li, li - 1) })} />
                <Button size="sm" kind="ghost" title="↓" style={ARROW} accessibilityLabel={`Move lesson ${num} down`} disabled={li === u.lessons.length - 1} onPress={() => setUnit(ui, { ...u, lessons: move(u.lessons, li, li + 1) })} />
              </Row>
            );
          })}
          <Row>
            <Button
              size="sm"
              kind="secondary"
              title="＋ Add lesson"
              onPress={() => {
                setUnit(ui, { ...u, lessons: [...u.lessons, newLesson(`Lesson ${lessonTotal(pkg.units) + 1}`)] });
                setEditing({ unit: ui, lesson: u.lessons.length });
              }}
            />
          </Row>
        </Card>
      ))}
      <Row wrap>
        <Button kind="secondary" title="＋ Add unit" onPress={() => setUnits([...pkg.units, newUnit(`Unit ${pkg.units.length + 1}`)])} />
        <Button kind="secondary" title="📋 Paste more lessons" onPress={() => setPasting(true)} />
      </Row>
      {editing && pkg.units[editing.unit]?.lessons[editing.lesson] ? (
        <LessonSheet
          key={pkg.units[editing.unit].lessons[editing.lesson].id}
          lesson={pkg.units[editing.unit].lessons[editing.lesson]}
          pkg={pkg}
          units={pkg.units}
          unitIndex={editing.unit}
          onClose={() => setEditing(null)}
          onSave={(lesson, toUnit) => {
            const units = pkg.units.map((u, i) => (i === editing.unit ? { ...u, lessons: u.lessons.filter((x) => x.id !== lesson.id) } : u));
            if (toUnit === editing.unit) units[toUnit] = { ...pkg.units[toUnit], lessons: pkg.units[toUnit].lessons.map((x) => (x.id === lesson.id ? lesson : x)) };
            else units[toUnit] = { ...units[toUnit], lessons: [...units[toUnit].lessons, lesson] };
            setUnits(units);
            setEditing(null);
          }}
          onDelete={() => {
            setUnits(pkg.units.map((u, i) => (i === editing.unit ? { ...u, lessons: u.lessons.filter((_, j) => j !== editing.lesson) } : u)));
            setEditing(null);
          }}
        />
      ) : null}
      {pasting ? <PasteSheet onClose={() => setPasting(false)} onAdd={(units) => { setUnits([...pkg.units, ...units]); setPasting(false); }} /> : null}
      {confirm.element}
    </Stack>
  );
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
/** Answers line up with questions by position, so blank lines stay (a question with no answer yet). */
const answerKey = (questions: string, answers: string): string[] | undefined => {
  const key = answers.split('\n').map((x) => x.trim()).slice(0, lines(questions).length);
  while (key.length && !key.at(-1)) key.pop();
  return key.length ? key : undefined;
};

/** An alternate version being edited: one text box per list. */
interface VersionDraft {
  theme?: string;
  steps: string;
  questions: string;
  answers: string;
}
const toDraft = (v?: LessonVersion, theme?: string): VersionDraft => ({ theme, steps: (v?.steps ?? []).join('\n'), questions: (v?.questions ?? []).join('\n'), answers: (v?.answers ?? []).join('\n') });
const fromDraft = (d: VersionDraft): LessonVersion | undefined => {
  const v: LessonVersion = { steps: lines(d.steps), questions: lines(d.questions) };
  const key = answerKey(d.questions, d.answers);
  if (key) v.answers = key;
  return v.steps.length || v.questions.length ? v : undefined;
};

function LessonSheet({ lesson, pkg, units, unitIndex, onClose, onSave, onDelete }: { lesson: PackageLesson; pkg: CurriculumPackage; units: PackageUnit[]; unitIndex: number; onClose: () => void; onSave: (l: PackageLesson, unit: number) => void; onDelete: () => void }) {
  const c = useColors();
  const [title, setTitle] = useState(lesson.title);
  const [pages, setPages] = useState(lesson.pages ?? '');
  const [minutes, setMinutes] = useState(lesson.minutes ? String(lesson.minutes) : '');
  const [steps, setSteps] = useState(lesson.steps.join('\n'));
  const [questions, setQuestions] = useState(lesson.questions.join('\n'));
  const [answers, setAnswers] = useState((lesson.answers ?? []).join('\n'));
  const [notes, setNotes] = useState(lesson.notes ?? '');
  const [links, setLinks] = useState(lesson.links);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [unit, setUnit] = useState(unitIndex);
  const [standards, setStandards] = useState((lesson.standards ?? []).join(', '));
  const [grade, setGrade] = useState(Math.max(0, pkg.gradeMin));
  const [levels, setLevels] = useState<Record<LessonLevel, VersionDraft>>({ easier: toDraft(lesson.versions?.easier), harder: toDraft(lesson.versions?.harder) });
  const [themes, setThemes] = useState<VersionDraft[]>((lesson.themes ?? []).map((t) => toDraft(t, t.theme)));
  /** Which version is open: 'easier', 'harder', or a theme's index. */
  const [openVersion, setOpenVersion] = useState<LessonLevel | number | null>(null);
  const mins = minutes.trim() ? parseCount(minutes) : undefined;
  const link = normalizeUrl(linkUrl);
  const themeNames = themes.map((t) => (t.theme ?? '').trim().toLowerCase());
  const missing = [
    !title.trim() && 'a title',
    minutes.trim() && !(mins && mins <= 480) && 'minutes between 1 and 480',
    themes.some((t) => fromDraft(t) && !t.theme?.trim()) && 'a name for each theme',
    themeNames.some((n, i) => n && themeNames.indexOf(n) !== i) && 'a different name for each theme',
  ].filter(Boolean);
  const tagList = parseStandardList(standards);
  const strands = strandsFor(pkg.subjects, pkg.gradeMin, pkg.gradeMax);
  const grades = Array.from({ length: Math.max(0, pkg.gradeMax) - Math.max(0, pkg.gradeMin) + 1 }, (_, i) => Math.max(0, pkg.gradeMin) + i);
  const toggleTag = (code: string) => setStandards((tagList.some((t) => t.toUpperCase() === code.toUpperCase()) ? tagList.filter((t) => t.toUpperCase() !== code.toUpperCase()) : [...tagList, code]).join(', '));
  const ideas = [...new Set([...planThemes(units), ...THEME_IDEAS])].filter((t) => !themeNames.includes(t.toLowerCase())).slice(0, 8);
  const draft = openVersion === null ? undefined : typeof openVersion === 'number' ? themes[openVersion] : levels[openVersion];
  const setDraft = (patch: Partial<VersionDraft>) => {
    if (typeof openVersion === 'number') setThemes(themes.map((t, i) => (i === openVersion ? { ...t, ...patch } : t)));
    else if (openVersion) setLevels({ ...levels, [openVersion]: { ...levels[openVersion], ...patch } });
  };
  const versionName = typeof openVersion === 'number' ? `“${themes[openVersion]?.theme?.trim() || 'New theme'}”` : openVersion ? LEVEL_LABEL[openVersion].replace(/^\S+ /, '') : '';

  const build = (): PackageLesson => {
    const versions: Partial<Record<LessonLevel, LessonVersion>> = {};
    for (const lv of ['easier', 'harder'] as const) {
      const v = fromDraft(levels[lv]);
      if (v) versions[lv] = v;
    }
    const themed = themes.flatMap((d): ThemedVersion[] => {
      const v = fromDraft(d);
      return v && d.theme?.trim() ? [{ theme: d.theme.trim(), ...v }] : [];
    });
    const { versions: _v, themes: _t, standards: _s, ...rest } = lesson;
    return {
      ...rest,
      title: title.trim(),
      pages: pages.trim() || undefined,
      minutes: mins,
      steps: lines(steps),
      questions: lines(questions),
      answers: answerKey(questions, answers),
      notes: notes.trim() || undefined,
      links,
      ...(Object.keys(versions).length ? { versions } : {}),
      ...(themed.length ? { themes: themed } : {}),
      ...(tagList.length ? { standards: tagList } : {}),
    };
  };
  // The rest of the editor autosaves, but this sheet saves on "Save lesson": closing it with edits asks first.
  const [saved] = useState(() => draftKey(build()));
  const dirty = draftKey(build()) !== saved || unit !== unitIndex || !!linkUrl.trim();

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Lesson"
      dirty={dirty}
      discardQuestion="Discard your changes to this lesson?"
      footer={
        // Pinned under the form, so Save is always in reach; Delete sits at the far side and asks first (lessons have no undo).
        <Actions align="space-between">
          <ConfirmButton title="Delete lesson" question={`Delete “${lesson.title || 'this lesson'}”?`} body="Its steps, questions, answers and versions go too. This can’t be undone." confirm="Delete lesson" onConfirm={onDelete} />
          <Button title="Save lesson" disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={() => onSave(build(), unit)} />
        </Actions>
      }>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={160} />
      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}><Field label="Pages (optional)" value={pages} onChangeText={setPages} placeholder="88–92" /></View>
        <View style={{ flex: 1 }}><Field label="Minutes (optional)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="Usual length" /></View>
      </Row>
      <Field label="Steps for the kid (one per line)" value={steps} onChangeText={setSteps} multiline placeholder={'Watch the video\nDo problems 1–10\nCheck your answers'} />
      <Fold title="Worksheet & answer key" summary={lines(questions).length ? `${plural(lines(questions).length, 'question')}${lines(answers).length ? ` · ${plural(lines(answers).length, 'answer')}` : ''}` : 'Optional questions to print, with answers for grown-ups'}>
      <Field label="Worksheet questions (one per line, optional)" value={questions} onChangeText={setQuestions} multiline placeholder="What is ¼ of 12?" />
      {lines(questions).length ? (
        <Field
          label="Answer key (one per line, in the same order)"
          value={answers}
          onChangeText={setAnswers}
          multiline
          placeholder={'One answer per line, same order as the questions\n12 ÷ 4 = 3'}
          hint={answers.split('\n').filter((x) => x.trim()).length > lines(questions).length ? 'There are more answers than questions.' : 'Only grown-ups see these. They print on a separate answer sheet.'}
        />
      ) : null}
      </Fold>
      <Fold title="Links & notes" summary={[links.length ? plural(links.length, 'link') : '', notes.trim() ? 'parent notes' : ''].filter(Boolean).join(' · ') || 'Videos, readings, notes for the parent'}>
      <Stack gap={6}>
        <T v="label">Links</T>
        {links.map((l, i) => (
          <Row key={`${l.url}-${i}`}>
            <T style={{ flex: 1 }} numberOfLines={1}>🔗 {l.label} <T v="caption" muted>{l.url}</T></T>
            <Button size="sm" kind="ghost" title="Remove" onPress={() => setLinks(links.filter((_, j) => j !== i))} />
          </Row>
        ))}
        <Row gap={space.sm} align="flex-end" wrap>
          <View style={{ flex: 2, minWidth: 180 }}><Field placeholder="https://… (video, reading, worksheet)" value={linkUrl} onChangeText={setLinkUrl} autoCapitalize="none" keyboardType="url" /></View>
          <View style={{ flex: 1, minWidth: 120 }}><Field placeholder="Label" value={linkLabel} onChangeText={setLinkLabel} /></View>
          <Button size="sm" kind="secondary" title="Add link" disabled={!link} onPress={() => { setLinks([...links, { label: linkLabel.trim() || 'Open lesson', url: link! }]); setLinkUrl(''); setLinkLabel(''); }} />
        </Row>
        {linkUrl.trim() && !link ? <T v="caption" color={c.danger}>Enter a web address</T> : null}
      </Stack>
      <Field label="Notes for the parent (optional)" value={notes} onChangeText={setNotes} multiline hint="Never shown to kids." />
      </Fold>
      <Fold
        title="Other versions"
        summary={[...(['easier', 'harder'] as const).filter((lv) => fromDraft(levels[lv])).map((lv) => LEVEL_LABEL[lv]), ...themes.filter((t) => t.theme?.trim()).map((t) => `🎨 ${t.theme!.trim()}`)].join(' · ') || 'Easier, harder, or themed takes (optional)'}>
      <Stack gap={6}>
        <T v="caption" muted>An easier or harder take, or the same lesson dressed in an interest. Families pick one per child; anything you leave blank uses the main lesson.</T>
        <Row wrap gap={6}>
          {(['easier', 'harder'] as const).map((lv) => (
            <Chip key={lv} label={`${LEVEL_LABEL[lv]}${fromDraft(levels[lv]) ? ' ✓' : ''}`} selected={openVersion === lv} onPress={() => setOpenVersion(openVersion === lv ? null : lv)} />
          ))}
          {themes.map((t, i) => (
            <Chip key={i} label={`🎨 ${t.theme?.trim() || 'New theme'}${fromDraft(t) ? ' ✓' : ''}`} selected={openVersion === i} onPress={() => setOpenVersion(openVersion === i ? null : i)} />
          ))}
          <Chip label="＋ Theme" onPress={() => { setThemes([...themes, { theme: '', steps: '', questions: '', answers: '' }]); setOpenVersion(themes.length); }} />
        </Row>
        {draft ? (
          <Card tint={c.surfaceAlt}>
            {typeof openVersion === 'number' ? (
              <>
                <Field label="Theme" value={draft.theme ?? ''} onChangeText={(theme) => setDraft({ theme })} placeholder="Dinosaurs" maxLength={40} />
                {ideas.length ? (
                  <Row wrap gap={6}>
                    {ideas.map((t) => (
                      <Chip key={t} label={t} onPress={() => setDraft({ theme: t })} />
                    ))}
                  </Row>
                ) : null}
              </>
            ) : null}
            <Field label={`${versionName} steps (one per line)`} value={draft.steps} onChangeText={(v) => setDraft({ steps: v })} multiline placeholder={lines(steps).length ? 'Blank = the main steps' : 'Count the dinosaurs'} />
            <Field label={`${versionName} questions (one per line)`} value={draft.questions} onChangeText={(v) => setDraft({ questions: v })} multiline placeholder="Blank = the main questions" />
            {lines(draft.questions).length ? <Field label={`${versionName} answers (same order)`} value={draft.answers} onChangeText={(v) => setDraft({ answers: v })} multiline hint="Only grown-ups see these." /> : null}
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button
                size="sm"
                kind="ghost"
                title={typeof openVersion === 'number' ? 'Remove theme' : 'Clear this version'}
                onPress={() => {
                  if (typeof openVersion === 'number') setThemes(themes.filter((_, i) => i !== openVersion));
                  else if (openVersion) setLevels({ ...levels, [openVersion]: toDraft() });
                  setOpenVersion(null);
                }}
              />
            </Row>
          </Card>
        ) : null}
      </Stack>
      </Fold>
      <Fold title="Standards" summary={tagList.length ? tagList.map(standardLabel).join(' · ') : 'Optional codes, e.g. Common Core'}>
      <Stack gap={6}>
        <Field label="Standards (optional)" value={standards} onChangeText={setStandards} placeholder="CCSS.MATH.CONTENT.3.NF, TEKS 3.4A" hint="Any codes, separated by commas. Families see which subjects their plan covers." />
        {strands.length ? (
          <>
            {grades.length > 1 ? (
              <Row wrap gap={6}>
                <T v="caption" muted>Common Core, grade</T>
                {grades.map((g) => (
                  <Chip key={g} label={g === 0 ? 'K' : String(g)} selected={grade === g} onPress={() => setGrade(g)} />
                ))}
              </Row>
            ) : null}
            <Row wrap gap={6}>
              {strands.map((st) => {
                const code = standardCode(st, grade);
                const on = tagList.some((t) => t.toUpperCase() === code.toUpperCase());
                return <Chip key={st.code} label={`${on ? '✓ ' : ''}${st.code} ${st.label}`} selected={on} onPress={() => toggleTag(code)} />;
              })}
            </Row>
          </>
        ) : null}
        {tagList.length ? <T v="caption" muted>🎯 {tagList.map(standardLabel).join(' · ')}</T> : null}
      </Stack>
      </Fold>
      {units.length > 1 ? (
        <Fold title="Unit" summary={units[unit]?.title || `Unit ${unit + 1}`}>
          <Row wrap gap={6}>
            {units.map((u, i) => (
              <Chip key={u.id} role="radio" label={u.title || `Unit ${i + 1}`} selected={unit === i} onPress={() => setUnit(i)} />
            ))}
          </Row>
        </Fold>
      ) : null}
    </Sheet>
  );
}

function PasteSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (units: PackageUnit[]) => void }) {
  const [text, setText] = useState('');
  const result = text.trim() ? parseOutline(text) : undefined;
  const total = result ? lessonTotal(result.units) : 0;
  return (
    <Sheet visible onClose={onClose} title="Paste more lessons" dirty={!!text.trim()} discardQuestion="Discard the lessons you pasted?">
      <T muted>One entry per line. Lines starting with Unit, Chapter, Week… (or a “#”) start a new unit.</T>
      <Field value={text} onChangeText={setText} multiline style={{ minHeight: 160 }} placeholder={'Unit 4: Decimals\nTenths\nHundredths\nMoney math'} />
      {result ? <T v="caption">{plural(total, 'lesson')} in {plural(result.units.length, 'unit')}</T> : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button title={`Add ${plural(total, 'lesson')}`} disabled={!total} onPress={() => result && onAdd(result.units)} />
      </Row>
    </Sheet>
  );
}

// ───────────────────────────── Publish (or use privately)

function Publish({ pkg, update }: { pkg: CurriculumPackage; update: Update }) {
  const c = useColors();
  const confirm = useConfirm();
  const profile = useStudio((s) => s.profile);
  const family = useStore((s) => s.family);
  const [price, setPrice] = useState(String(pkg.price));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [planning, setPlanning] = useState(false);
  /** Set right after publishing, for the "it's live" card. */
  const [justPublished, setJustPublished] = useState<{ version: number; listingId?: string } | null>(null);
  const rules = publishRules(pkg);
  const action = publishAction(pkg);
  const issues = pkg.status === 'published' && !action.releaseNote ? [] : publishIssues(pkg);
  const lessons = allLessons(pkg.units);
  const credit = attributionFor(pkg, profile?.name);
  const o = pkg.origin;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const setLicense = (kind: LicenseKind) =>
    update({ license: { kind, version: kind.startsWith('cc_by') ? '4.0' : undefined, holder: o.kind === 'original' ? profile?.name : pkg.license.holder }, licenseConfirmed: false });

  return (
    <Stack gap={space.lg} style={{ marginTop: space.lg }}>
      <Card>
        <T v="heading">Source</T>
        {o.kind === 'original' ? <T>✏️ Your own work.</T> : null}
        {o.kind === 'owned_book' ? <T>📕 A lesson plan for “{o.title}”{o.publisher ? ` (${o.publisher})` : ''}, a book you own.</T> : null}
        {o.kind === 'open_web' ? (
          <T>
            🌐 Adapted from “{o.title}”{o.author ? ` by ${o.author}` : ''} — {o.url} (retrieved {formatDate(o.retrievedAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })})
          </T>
        ) : null}
      </Card>

      <Section title="License">
        {o.kind === 'original' ? (
          <Stack gap={6}>
            <T muted>You hold the rights. Choose how others may use your work.</T>
            <Row wrap gap={6}>
              {ORIGINAL_LICENSES.map((k) => (
                <Chip key={k} label={k === 'all_rights_reserved' ? '© All rights reserved' : LICENSE_INFO[k].short} selected={pkg.license.kind === k} onPress={() => setLicense(k)} />
              ))}
            </Row>
            <T v="caption" muted>{LICENSE_INFO[pkg.license.kind].label}{LICENSE_INFO[pkg.license.kind].adapt ? ' — others may adapt and share it' : ''}{LICENSE_INFO[pkg.license.kind].attribution && pkg.license.kind !== 'all_rights_reserved' ? ' with credit to you' : ''}.</T>
          </Stack>
        ) : o.kind === 'owned_book' ? (
          <T>© {o.publisher ?? 'The publisher'} — all rights reserved. Your plan is for your family only.</T>
        ) : (
          <Stack gap={6}>
            {o.licenseDetected ? (
              <T>
                <T style={{ fontWeight: '700' }}>{licenseName(pkg.license)}</T> — found on the source page. Adaptations keep the source’s license, so this can’t be changed.
              </T>
            ) : (
              <>
                <T muted>No license was found on the source page. Choose the one the source states:</T>
                <Row wrap gap={6}>
                  {SOURCE_LICENSES.map((k) => (
                    <Chip key={k} label={k === 'all_rights_reserved' ? '© All rights reserved' : LICENSE_INFO[k].short} selected={pkg.license.kind === k} onPress={() => setLicense(k)} />
                  ))}
                  <Chip label="Not sure" selected={pkg.license.kind === 'unknown'} onPress={() => setLicense('unknown')} />
                </Row>
              </>
            )}
            {pkg.license.kind !== 'unknown' && LICENSE_INFO[pkg.license.kind].adapt ? (
              <Chip
                label={`${pkg.licenseConfirmed ? '✓' : '○'} I checked ${o.url} and it is shared under ${licenseName(pkg.license)}`}
                selected={!!pkg.licenseConfirmed}
                onPress={() => update({ licenseConfirmed: !pkg.licenseConfirmed })}
              />
            ) : null}
          </Stack>
        )}
        <Card tint={rules.canPublish ? c.primarySoft : c.accentSoft}>
          <T>{rules.note}</T>
        </Card>
        {credit ? (
          <Stack gap={2}>
            <T v="label">Credit line (shown on the listing, lessons, and printouts)</T>
            <T v="caption">{credit}</T>
          </Stack>
        ) : null}
      </Section>

      <Section title="Export" subtitle="A teacher’s guide to print or save as a PDF, or a spreadsheet you can edit and import again.">
        <Row wrap>
          <Button kind="secondary" icon="📄" title="PDF teacher’s guide" disabled={!lessons.length} reason="Add lessons first" loading={busy === 'pdf'} onPress={() => run('pdf', () => exportHtml(planHtml({ ...pkg, attribution: credit }, profile?.name), planFileName(pkg, 'pdf').replace(/\.pdf$/, '')))} />
          <Button kind="secondary" icon="📊" title="Spreadsheet (CSV)" disabled={!lessons.length} reason="Add lessons first" loading={busy === 'csv'} onPress={() => run('csv', () => shareText(planCsv(pkg), planFileName(pkg, 'csv'), 'text/csv'))} />
        </Row>
      </Section>

      {family ? (
        <Section title="Use it in your family" subtitle="Schedule it for your kids now — no publishing needed.">
          <Button kind="secondary" icon="🏠" title="Add to my family’s plan" disabled={!lessons.length} reason="Add lessons first" onPress={() => setPlanning(true)} />
        </Section>
      ) : (
        // Creator-only mode: say why there's no "Add to my family's plan", and how to get it.
        <Section title="Use it in your family">
          <Card tint={c.surfaceAlt}>
            <T>Set up your family to schedule this for your kids.</T>
            <T v="caption" muted>Studio works on its own; the family planner (Compass) is where lessons land on your kids’ days.</T>
            <Row>
              <Button size="sm" kind="secondary" title="Set up my family" onPress={() => { useStudio.getState().setActive(false); router.push('/onboarding'); }} />
            </Row>
          </Card>
        </Section>
      )}

      {o.kind !== 'owned_book' && !profile ? (
        <Card tint={c.accentSoft}>
          <T>To publish, set up a creator profile — it’s the seller name families see.</T>
          <Row>
            <Button size="sm" title="Set up creator profile" onPress={() => router.push('/studio/setup')} />
          </Row>
        </Card>
      ) : null}
      {o.kind !== 'owned_book' && profile ? (
        <Section title="Marketplace">
          <Field
            label="Price ($, 0 = free)"
            value={rules.mustBeFree ? '0' : price}
            editable={!rules.mustBeFree}
            keyboardType="decimal-pad"
            onChangeText={(v) => {
              setPrice(v);
              const n = v.trim() === '' ? undefined : parseMoney(v);
              if (n !== undefined && n >= 0 && n <= 10000) update({ price: n });
            }}
            hint={rules.mustBeFree ? 'The source is non-commercial, so this must be free.' : 'Families can pay with ESA funds where allowed. Payouts to creators are set up separately.'}
          />
          {justPublished ? (
            <Card tint={c.successSoft}>
              <T v="heading" accessibilityRole="alert">🎉 {pkg.title} v{justPublished.version} is live in the Marketplace</T>
              <T v="caption">{justPublished.version > 1 ? 'Families who have it see “Update available” and choose when to switch.' : 'Families can find it in the Marketplace now.'}</T>
              {justPublished.listingId ? (
                <Row wrap gap={6}>
                  <Button size="sm" title="View listing" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: justPublished.listingId! } })} />
                  <CopyButton title="Copy link" text={Linking.createURL(`/listing/${justPublished.listingId}`)} />
                </Row>
              ) : null}
            </Card>
          ) : null}
          {issues.length ? (
            <Card tint={c.surfaceAlt}>
              <T v="label">Before publishing, add:</T>
              {issues.map((i) => (
                <T key={i} v="caption">• {i}</T>
              ))}
            </Card>
          ) : null}
          {action.releaseNote ? (
            <Field
              label="What’s new in this update (optional)"
              value={pkg.releaseNote ?? ''}
              onChangeText={(v) => update({ releaseNote: v.slice(0, 500) })}
              multiline
              placeholder="Added two review lessons in Unit 2 and fixed the page numbers in Unit 3."
              hint="Families who already have it see this when they review the update."
            />
          ) : null}
          {error ? <T color={c.danger}>{error}</T> : null}
          <Row wrap style={{ justifyContent: 'flex-end' }}>
            {pkg.status === 'published' && pkg.listingId ? <Button kind="secondary" title="View listing" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: pkg.listingId! } })} /> : null}
            {pkg.status === 'published' ? <Button kind="secondary" title="Unpublish" loading={busy === 'unpub'} onPress={() => run('unpub', () => unpublishPackage(pkg))} /> : null}
            <Button
              title={action.title}
              disabled={!action.ready}
              // The list above says what's missing; the button only explains "nothing new to publish".
              reason={issues.length ? undefined : action.reason}
              loading={busy === 'pub'}
              onPress={() =>
                run('pub', async () => {
                  const saved = await publishPackage(pkg);
                  setJustPublished({ version: saved.version, listingId: saved.listingId });
                })
              }
            />
          </Row>
          {pkg.status === 'published' ? <T v="caption" muted>New families get the update. Families who already have it see “Update available” and choose when to switch; everyone keeps their place.</T> : null}
        </Section>
      ) : null}

      <Row style={{ justifyContent: 'flex-end' }}>
        <Button
          kind="danger"
          title="Delete curriculum"
          loading={busy === 'del'}
          onPress={() =>
            confirm.ask(`Delete “${pkg.title || 'this curriculum'}”?`, () => run('del', async () => { await deletePackage(pkg); router.replace('/studio'); }), {
              confirm: 'Delete',
              body: pkg.status === 'published' ? 'It’s removed from the Marketplace too. Families who already have it keep their copy.' : 'This can’t be undone.',
            })
          }
        />
      </Row>
      {planning ? (
        <AddToPlanSheet
          visible
          listing={packageToListing(pkg, profile?.name ?? family?.familyName ?? 'My family')}
          content={{ units: pkg.units, version: pkg.version, license: pkg.license, attribution: credit }}
          onClose={() => setPlanning(false)}
        />
      ) : null}
      {confirm.element}
      <T v="caption" muted>{lessons.length} lessons · {pkg.price && !rules.mustBeFree ? money(pkg.price) : 'Free'}</T>
    </Stack>
  );
}

// ───────────────────────────── Insights

const INSIGHT_ICON: Record<Insight['kind'], string> = { dropoff: '🚪', time: '⏱️', tricky: '🧗', skipped: '⏭️', quick: '⚡️', good: '🌟' };

/** Anonymous totals from families using the published plan, as plain sentences. */
function Insights({ pkg }: { pkg: CurriculumPackage }) {
  const c = useColors();
  const [result, setResult] = useState<InsightsResult | undefined>();
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    lessonInsights(pkg.listingId!)
      .then((r) => alive && setResult(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [pkg.listingId]);
  const lessons = new Map(allLessons(pkg.units).map((l) => [l.id, l]));
  const stats = (result?.stats ?? []).filter((s) => lessons.has(s.lessonId)).sort((a, b) => lessons.get(a.lessonId)!.n - lessons.get(b.lessonId)!.n);
  const sentences = insightSentences(pkg.units, stats);
  const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

  return (
    <Stack gap={space.lg} style={{ marginTop: space.lg }}>
      <Card tint={c.surfaceAlt}>
        <T>📈 How your lessons go in real families: finished or skipped, time taken vs. planned, and how often kids mark them tricky.</T>
        <T v="caption" muted>Anonymous and added up across families: no names or details about any child. A lesson only shows here once {MIN_FAMILIES} or more families have used it; families can turn sharing off in Settings.</T>
      </Card>
      {error ? <T color={c.danger}>{error}</T> : null}
      {!result && !error ? <T muted>Loading…</T> : null}
      {result?.source === 'device' ? (
        <Card tint={c.accentSoft}>
          <AccountNote v="body" muted={false} signIn={`Sign in to see insights from every family using this plan. Without an account, only this device’s family counts, which is below the ${MIN_FAMILIES}-family minimum.`} deviceOnly={`Only this device’s family counts, which is below the ${MIN_FAMILIES}-family minimum for insights.`} />
        </Card>
      ) : null}
      {result && !stats.length ? <Empty icon="🌱" title={`No lesson has ${MIN_FAMILIES} families yet`} body="Check back as more families use it. Numbers appear lesson by lesson as each one reaches the minimum." /> : null}
      {sentences.length ? (
        <Section title="What families’ days tell you">
          <Stack gap={space.sm}>
            {sentences.map((s) => (
              <Card key={`${s.kind}-${s.lessonId ?? ''}`}>
                <T>{INSIGHT_ICON[s.kind]} {s.text}</T>
              </Card>
            ))}
          </Stack>
        </Section>
      ) : null}
      {stats.length ? (
        <Section title="Lesson by lesson" subtitle={`${stats[0].totalFamilies} families using it · lessons with ${MIN_FAMILIES}+ families`}>
          <Card>
            {stats.map((s) => {
              const l = lessons.get(s.lessonId)!;
              return (
                <Stack key={s.lessonId} gap={2} style={{ borderTopWidth: 1, borderColor: c.border, paddingTop: 6 }}>
                  <T>
                    <T muted>{l.n}. </T>
                    {l.title}
                  </T>
                  <T v="caption" muted>
                    {[
                      `${s.families} families`,
                      `${pct(s.done, s.families)} finished`,
                      s.avgMinutes && s.avgPlanned ? `${Math.round(s.avgMinutes)} min vs. ${Math.round(s.avgPlanned)} planned` : undefined,
                      s.done ? `${pct(s.tricky, s.done)} tricky` : undefined,
                      s.stoppedHere ? `${s.stoppedHere} stopped here` : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </T>
                </Stack>
              );
            })}
          </Card>
        </Section>
      ) : null}
    </Stack>
  );
}
