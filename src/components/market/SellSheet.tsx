import { useState } from 'react';
import { View } from 'react-native';

import { uid } from '@/lib/id';
import { CONDITION_LABEL, FORMAT_LABEL, GRADE_LABELS, INVOLVEMENT_LABEL, type Condition, type Involvement, type Listing, type ListingFormat } from '@/lib/market';
import { parseCount } from '@/lib/parse';
import { PHILOSOPHY_INFO } from '@/lib/quiz';
import { SUBJECT_LIST, SUBJECTS } from '@/lib/subjects';
import type { Philosophy, Subject } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { saveListing } from '@/services/marketApi';
import { Button, Chip, Field, MoneyField, Row, Sheet, space, Stack, T, useColors } from '@/ui';

const GRADE_SHORT = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

/** List a used or self-made curriculum for other families. */
export function SellSheet({ existing, visible, onClose }: { existing?: Listing; visible: boolean; onClose: () => void }) {
  return visible ? <SellForm existing={existing} onClose={onClose} /> : null;
}

function SellForm({ existing, onClose }: { existing?: Listing; onClose: () => void }) {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [subjects, setSubjects] = useState<Subject[]>(existing?.subjects ?? []);
  const [gradeMin, setGradeMin] = useState(existing?.gradeMin ?? 1);
  const [gradeMax, setGradeMax] = useState(existing?.gradeMax ?? 3);
  const [format, setFormat] = useState<ListingFormat>(existing?.format ?? 'print');
  const [condition, setCondition] = useState<Condition | undefined>(existing ? existing.condition : 'good');
  const [price, setPrice] = useState<number | undefined>(existing?.price);
  const [lessons, setLessons] = useState(existing ? String(existing.lessons) : '');
  const [perWeek, setPerWeek] = useState(existing?.lessonsPerWeek ?? 3);
  const [minutes, setMinutes] = useState(existing ? String(existing.minutesPerLesson) : '30');
  const [involvement, setInvolvement] = useState<Involvement>(existing?.parentInvolvement ?? 'medium');
  const [philosophies, setPhilosophies] = useState<Philosophy[]>(existing?.philosophies ?? (family.philosophy ? [family.philosophy.breakdown[0].philosophy] : []));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [includes, setIncludes] = useState(existing?.includes.join('\n') ?? '');
  const [busy, setBusy] = useState(false);

  const nLessons = parseCount(lessons);
  const nMinutes = parseCount(minutes);
  const missing = [
    !title.trim() && 'a title',
    subjects.length === 0 && 'a subject',
    price === undefined && 'a price (0 for free)',
    !nLessons && 'number of lessons',
    !nMinutes && 'minutes per lesson',
    description.trim().length < 10 && 'a short description',
  ].filter(Boolean);

  const toggle = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const pickGrade = (g: number) => {
    // First tap sets a single grade; a second tap extends the range.
    if (gradeMin === gradeMax && g !== gradeMin) {
      setGradeMin(Math.min(g, gradeMin));
      setGradeMax(Math.max(g, gradeMax));
    } else {
      setGradeMin(g);
      setGradeMax(g);
    }
  };

  const save = async () => {
    if (price === undefined || !nLessons || !nMinutes) return;
    setBusy(true);
    const parts = family.parentName.trim().split(/\s+/);
    const first = subjects[0];
    await saveListing({
      id: existing?.id ?? uid('l'),
      title: title.trim(),
      seller: parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0],
      sellerKind: 'family',
      sellerVerified: false,
      subjects,
      gradeMin,
      gradeMax,
      philosophies,
      format,
      price,
      condition,
      description: description.trim(),
      includes: includes.split(/\n|,/).map((s) => s.trim()).filter(Boolean),
      lessons: nLessons,
      lessonsPerWeek: perWeek,
      minutesPerLesson: nMinutes,
      parentInvolvement: involvement,
      familyStyle: existing?.familyStyle ?? false,
      lessonSteps: existing?.lessonSteps ?? [],
      cover: SUBJECTS[first].icon,
      color: c.primary,
      esaEligible: false,
      ratingAvg: existing?.ratingAvg ?? 0,
      ratingCount: existing?.ratingCount ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      mine: true,
    });
    setBusy(false);
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} title={existing ? 'Edit listing' : 'List a curriculum'}>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Math level 3 teacher guide + workbook" />
      <Stack gap={6}>
        <T v="label">Subjects</T>
        <Row wrap gap={6}>
          {SUBJECT_LIST.map((s) => (
            <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={subjects.includes(s)} onPress={() => setSubjects(toggle(subjects, s))} />
          ))}
        </Row>
      </Stack>
      <Stack gap={6}>
        <T v="label">Grades: {gradeMin === gradeMax ? GRADE_LABELS[gradeMin + 1] : `${GRADE_LABELS[gradeMin + 1]} – ${GRADE_LABELS[gradeMax + 1]}`}</T>
        <Row wrap gap={4}>
          {GRADE_SHORT.map((g, i) => (
            <Chip key={g} label={g} selected={i - 1 >= gradeMin && i - 1 <= gradeMax} onPress={() => pickGrade(i - 1)} />
          ))}
        </Row>
        <T v="caption" muted>Tap one grade, then another to make a range.</T>
      </Stack>
      <Stack gap={6}>
        <T v="label">Format</T>
        <Row wrap gap={6}>
          {(Object.keys(FORMAT_LABEL) as ListingFormat[]).map((f) => (
            <Chip key={f} label={FORMAT_LABEL[f]} selected={format === f} onPress={() => setFormat(f)} />
          ))}
        </Row>
      </Stack>
      <Stack gap={6}>
        <T v="label">Condition</T>
        <Row wrap gap={6}>
          {(Object.keys(CONDITION_LABEL) as Condition[]).map((k) => (
            <Chip key={k} label={CONDITION_LABEL[k]} selected={condition === k} onPress={() => setCondition(k)} />
          ))}
          <Chip label="I made it" selected={!condition} onPress={() => setCondition(undefined)} />
        </Row>
      </Stack>
      <Row gap={space.md} align="flex-start" wrap>
        <View style={{ flex: 1, minWidth: 120 }}><MoneyField label="Price ($, 0 = free)" value={price} onChange={setPrice} example="25" /></View>
        <View style={{ flex: 1, minWidth: 120 }}><Field label="Lessons" keyboardType="number-pad" value={lessons} onChangeText={setLessons} placeholder="120" /></View>
        <View style={{ flex: 1, minWidth: 120 }}><Field label="Minutes each" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} /></View>
      </Row>
      <Stack gap={6}>
        <T v="label">Lessons per week</T>
        <Row wrap gap={6}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip key={n} label={String(n)} selected={perWeek === n} onPress={() => setPerWeek(n)} />
          ))}
        </Row>
      </Stack>
      <Stack gap={6}>
        <T v="label">Parent involvement</T>
        <Row wrap gap={6}>
          {(Object.keys(INVOLVEMENT_LABEL) as Involvement[]).map((k) => (
            <Chip key={k} label={INVOLVEMENT_LABEL[k]} selected={involvement === k} onPress={() => setInvolvement(k)} />
          ))}
        </Row>
      </Stack>
      <Stack gap={6}>
        <T v="label">Teaching style</T>
        <Row wrap gap={6}>
          {(Object.keys(PHILOSOPHY_INFO) as Philosophy[]).map((p) => (
            <Chip key={p} label={`${PHILOSOPHY_INFO[p].emoji} ${PHILOSOPHY_INFO[p].label}`} selected={philosophies.includes(p)} onPress={() => setPhilosophies(toggle(philosophies, p))} />
          ))}
        </Row>
      </Stack>
      <Field label="Description" multiline value={description} onChangeText={setDescription} placeholder="Condition details, what's included, pickup or shipping." style={{ minHeight: 90 }} />
      <Field label="What's included (one per line)" multiline value={includes} onChangeText={setIncludes} placeholder={'Teacher guide\nStudent workbook'} />
      <T v="caption" muted>Your listing shows your first name and last initial. Arrange pickup in a public place — never share your home address.</T>
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button kind="secondary" title="Cancel" onPress={onClose} />
        <Button title={existing ? 'Save listing' : 'Publish listing'} loading={busy} disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={save} />
      </Row>
    </Sheet>
  );
}
