import { router, Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { money } from '@/components/market/ListingCard';
import { normalizeUrl } from '@/lib/curriculum';
import { formatDate } from '@/lib/dates';
import { parseOutline } from '@/lib/importers';
import { LICENSE_INFO, licenseName, ORIGINAL_LICENSES, SOURCE_LICENSES, type LicenseKind } from '@/lib/license';
import { FORMAT_LABEL, GRADE_LABELS, INVOLVEMENT_LABEL, PHILOSOPHY_SHORT, type Involvement, type ListingFormat } from '@/lib/market';
import { allLessons, attributionFor, lessonTotal, newLesson, newUnit, ORIGIN_LABEL, packageToListing, publishIssues, publishRules, type CurriculumPackage, type PackageLesson, type PackageUnit } from '@/lib/package';
import { parseCount, parseMoney } from '@/lib/parse';
import { SUBJECT_LIST, SUBJECTS } from '@/lib/subjects';
import type { Philosophy } from '@/lib/types';
import { deletePackage, publishPackage, savePackage, unpublishPackage } from '@/services/studioApi';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';
import { Button, Card, Chip, Empty, Field, Pill, Row, Screen, Section, Segmented, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

type Tab = 'details' | 'lessons' | 'publish';
const COVERS = ['📘', '🧮', '🔤', '📚', '✏️', '🌱', '🔬', '🏛️', '🌎', '🎨', '🎵', '🧩', '🍕', '🌻', '🐋', '🚀', '🕊️', '🧺'];
const PHILOSOPHIES = Object.keys(PHILOSOPHY_SHORT) as Philosophy[];
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
  const [tab, setTab] = useState<Tab>(initialTab === 'lessons' || initialTab === 'publish' ? initialTab : 'details');

  if (!pkg) {
    return (
      <Screen edges={[]}>
        <Empty icon="🔎" title="Curriculum not found" action={<Button title="Back to Studio" onPress={() => router.replace('/studio')} />} />
      </Screen>
    );
  }
  const update = (patch: Partial<CurriculumPackage>) => savePackage({ ...pkg, ...patch });
  const changed = pkg.status === 'published' && !!pkg.publishedAt && pkg.updatedAt > pkg.publishedAt;

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: pkg.title || 'Untitled curriculum' }} />
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <T v="title" style={{ flex: 1 }}>{pkg.cover} {pkg.title || 'Untitled curriculum'}</T>
        <Pill text={pkg.status === 'published' ? `Published v${pkg.version}` : 'Draft'} />
      </Row>
      <T v="caption" muted>{ORIGIN_LABEL[pkg.origin.kind]} · {lessonTotal(pkg.units)} lessons · saved automatically</T>
      {changed ? <T v="caption" color={c.accent}>You have changes that aren’t published yet — publish an update from the Publish tab.</T> : null}
      <View style={{ marginTop: space.md }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'details', label: '📝 Details' },
            { value: 'lessons', label: `📚 Lessons (${lessonTotal(pkg.units)})` },
            { value: 'publish', label: pkg.origin.kind === 'owned_book' ? '🏠 Use' : '🚀 Publish' },
          ]}
        />
      </View>
      {tab === 'details' ? <Details pkg={pkg} update={update} /> : tab === 'lessons' ? <Lessons pkg={pkg} update={update} /> : <Publish pkg={pkg} update={update} />}
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
        <Row wrap gap={6}>
          <T v="caption" muted style={{ width: 40 }}>From</T>
          {GRADE_LABELS.map((g, i) => (
            <Chip key={g} label={i === 0 ? 'Pre-K' : i === 1 ? 'K' : String(i - 1)} selected={pkg.gradeMin === i - 1} onPress={() => update({ gradeMin: i - 1, gradeMax: Math.max(pkg.gradeMax, i - 1) })} />
          ))}
        </Row>
        <Row wrap gap={6}>
          <T v="caption" muted style={{ width: 40 }}>To</T>
          {GRADE_LABELS.map((g, i) => (
            <Chip key={g} label={i === 0 ? 'Pre-K' : i === 1 ? 'K' : String(i - 1)} selected={pkg.gradeMax === i - 1} onPress={() => update({ gradeMax: i - 1, gradeMin: Math.min(pkg.gradeMin, i - 1) })} />
          ))}
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
            <Chip key={k} label={INVOLVEMENT_LABEL[k]} selected={pkg.parentInvolvement === k} onPress={() => update({ parentInvolvement: k })} />
          ))}
          <Chip label={`${pkg.familyStyle ? '✓' : '○'} Siblings can do it together`} selected={pkg.familyStyle} onPress={() => update({ familyStyle: !pkg.familyStyle })} />
        </Row>
      </Stack>
      <Row gap={space.md} align="flex-start" wrap>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Field label="Minutes per lesson" value={minutes} keyboardType="number-pad" onChangeText={(v) => { setMinutes(v); const n = parseCount(v); if (n && n <= 480) update({ minutesPerLesson: n }); }} hint={parseCount(minutes) && parseCount(minutes)! <= 480 ? undefined : '1–480 minutes'} />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <Field label="Suggested lessons per week" value={perWeek} keyboardType="number-pad" onChangeText={(v) => { setPerWeek(v); const n = parseCount(v); if (n && n <= 7) update({ lessonsPerWeek: n }); }} hint={parseCount(perWeek) && parseCount(perWeek)! <= 7 ? undefined : '1–7 a week'} />
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
            <Button size="sm" kind="ghost" title="↑" accessibilityLabel={`Move unit ${ui + 1} up`} disabled={ui === 0} onPress={() => setUnits(move(pkg.units, ui, ui - 1))} />
            <Button size="sm" kind="ghost" title="↓" accessibilityLabel={`Move unit ${ui + 1} down`} disabled={ui === pkg.units.length - 1} onPress={() => setUnits(move(pkg.units, ui, ui + 1))} />
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
                    {[l.pages && `pp. ${l.pages}`, l.minutes && `${l.minutes} min`, l.steps.length && `${l.steps.length} steps`, l.links.length && `🔗 ${l.links.length}`, l.questions.length && `✏️ ${l.questions.length}`].filter(Boolean).join(' · ') || 'Tap to add steps, pages, links, questions'}
                  </T>
                </Pressable>
                <Button size="sm" kind="ghost" title="↑" accessibilityLabel={`Move lesson ${num} up`} disabled={li === 0} onPress={() => setUnit(ui, { ...u, lessons: move(u.lessons, li, li - 1) })} />
                <Button size="sm" kind="ghost" title="↓" accessibilityLabel={`Move lesson ${num} down`} disabled={li === u.lessons.length - 1} onPress={() => setUnit(ui, { ...u, lessons: move(u.lessons, li, li + 1) })} />
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

function LessonSheet({ lesson, units, unitIndex, onClose, onSave, onDelete }: { lesson: PackageLesson; units: PackageUnit[]; unitIndex: number; onClose: () => void; onSave: (l: PackageLesson, unit: number) => void; onDelete: () => void }) {
  const c = useColors();
  const [title, setTitle] = useState(lesson.title);
  const [pages, setPages] = useState(lesson.pages ?? '');
  const [minutes, setMinutes] = useState(lesson.minutes ? String(lesson.minutes) : '');
  const [steps, setSteps] = useState(lesson.steps.join('\n'));
  const [questions, setQuestions] = useState(lesson.questions.join('\n'));
  const [notes, setNotes] = useState(lesson.notes ?? '');
  const [links, setLinks] = useState(lesson.links);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [unit, setUnit] = useState(unitIndex);
  const mins = minutes.trim() ? parseCount(minutes) : undefined;
  const link = normalizeUrl(linkUrl);
  const missing = [!title.trim() && 'a title', minutes.trim() && !(mins && mins <= 480) && 'minutes between 1 and 480'].filter(Boolean);

  return (
    <Sheet visible onClose={onClose} title="Lesson">
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={160} />
      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}><Field label="Pages (optional)" value={pages} onChangeText={setPages} placeholder="88–92" /></View>
        <View style={{ flex: 1 }}><Field label="Minutes (optional)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="Usual length" /></View>
      </Row>
      <Field label="Steps for the kid (one per line)" value={steps} onChangeText={setSteps} multiline placeholder={'Watch the video\nDo problems 1–10\nCheck your answers'} />
      <Field label="Worksheet questions (one per line, optional)" value={questions} onChangeText={setQuestions} multiline placeholder="What is ¼ of 12?" />
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
      <Field label="Notes for the parent (optional)" value={notes} onChangeText={setNotes} multiline />
      {units.length > 1 ? (
        <Stack gap={6}>
          <T v="label">Unit</T>
          <Row wrap gap={6}>
            {units.map((u, i) => (
              <Chip key={u.id} label={u.title || `Unit ${i + 1}`} selected={unit === i} onPress={() => setUnit(i)} />
            ))}
          </Row>
        </Stack>
      ) : null}
      <Row style={{ justifyContent: 'flex-end' }} wrap>
        <Button kind="danger" title="Delete lesson" onPress={onDelete} />
        <Button
          title="Save lesson"
          disabled={missing.length > 0}
          reason={`Still needed: ${missing.join(', ')}`}
          onPress={() => onSave({ ...lesson, title: title.trim(), pages: pages.trim() || undefined, minutes: mins, steps: lines(steps), questions: lines(questions), notes: notes.trim() || undefined, links }, unit)}
        />
      </Row>
    </Sheet>
  );
}

function PasteSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (units: PackageUnit[]) => void }) {
  const [text, setText] = useState('');
  const result = text.trim() ? parseOutline(text) : undefined;
  const total = result ? lessonTotal(result.units) : 0;
  return (
    <Sheet visible onClose={onClose} title="Paste more lessons">
      <T muted>One entry per line. Lines starting with Unit, Chapter, Week… (or a “#”) start a new unit.</T>
      <Field value={text} onChangeText={setText} multiline style={{ minHeight: 160 }} placeholder={'Unit 4: Decimals\nTenths\nHundredths\nMoney math'} />
      {result ? <T v="caption">{total} lessons in {result.units.length} units</T> : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button title={`Add ${total} lessons`} disabled={!total} onPress={() => result && onAdd(result.units)} />
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
  const rules = publishRules(pkg);
  const issues = publishIssues(pkg);
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

      {family ? (
        <Section title="Use it in your family" subtitle="Schedule it for your kids now — no publishing needed.">
          <Button kind="secondary" icon="🏠" title="Add to my family’s plan" disabled={!lessons.length} reason="Add lessons first" onPress={() => setPlanning(true)} />
        </Section>
      ) : null}

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
          {issues.length ? (
            <Card tint={c.surfaceAlt}>
              <T v="label">Before publishing, add:</T>
              {issues.map((i) => (
                <T key={i} v="caption">• {i}</T>
              ))}
            </Card>
          ) : null}
          {pkg.version > 0 ? (
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
              title={pkg.status === 'published' ? `Publish update (v${pkg.version + 1})` : 'Publish to the Marketplace'}
              disabled={issues.length > 0}
              loading={busy === 'pub'}
              onPress={() => run('pub', () => publishPackage(pkg))}
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
