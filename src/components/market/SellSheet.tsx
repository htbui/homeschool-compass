import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { uid } from '@/lib/id';
import {
  CONDITION_LABEL,
  FORMAT_LABEL,
  GRADE_LABELS,
  INVOLVEMENT_LABEL,
  listingIssues,
  LISTING_PHOTOS_MAX,
  PHILOSOPHY_SHORT,
  PICKUP_AREA_MAX,
  UNKNOWN_PACE,
  type Condition,
  type Involvement,
  type Listing,
  type ListingFormat,
} from '@/lib/market';
import { numberFieldError } from '@/lib/marketView';
import { parseCount } from '@/lib/parse';
import { PHILOSOPHY_INFO } from '@/lib/quiz';
import { SUBJECT_LIST, SUBJECTS } from '@/lib/subjects';
import type { Philosophy, Subject } from '@/lib/types';
import { pickListingPhoto } from '@/services/listingPhotos';
import { useStore } from '@/store/useStore';
import { saveListing } from '@/services/marketApi';
import { Actions, Button, Chip, Field, fonts, MoneyField, Row, Sheet, space, Stack, T, useColors } from '@/ui';

const GRADE_SHORT = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

/** List a used or self-made curriculum for other families. */
export function SellSheet({ existing, visible, onClose }: { existing?: Listing; visible: boolean; onClose: () => void }) {
  return visible ? <SellForm existing={existing} onClose={onClose} /> : null;
}

/**
 * Two steps: "What is it?" (everything a buyer needs, enough to publish) and an optional
 * "Help families schedule it" (lesson numbers, which a used workbook often doesn't have).
 */
function SellForm({ existing, onClose }: { existing?: Listing; onClose: () => void }) {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const known = existing && !existing.paceUnknown;
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [subjects, setSubjects] = useState<Subject[]>(existing?.subjects ?? []);
  // No grades until the seller picks them, so a wrong default range can't slip through.
  const [grades, setGrades] = useState<{ min: number; max: number } | undefined>(existing ? { min: existing.gradeMin, max: existing.gradeMax } : undefined);
  const [format, setFormat] = useState<ListingFormat>(existing?.format ?? 'print');
  const [condition, setCondition] = useState<Condition | undefined>(existing ? existing.condition : 'good');
  const [price, setPrice] = useState<number | undefined>(existing?.price);
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);
  const [pickupArea, setPickupArea] = useState(existing?.pickupArea ?? '');
  const [ships, setShips] = useState(!!existing?.ships);
  const [lessons, setLessons] = useState(known ? String(existing.lessons) : '');
  const [perWeek, setPerWeek] = useState(known ? existing.lessonsPerWeek : 3);
  const [minutes, setMinutes] = useState(known ? String(existing.minutesPerLesson) : '');
  const [involvement, setInvolvement] = useState<Involvement>(existing?.parentInvolvement ?? 'medium');
  const [philosophies, setPhilosophies] = useState<Philosophy[]>(existing?.philosophies ?? (family.philosophy ? [family.philosophy.breakdown[0].philosophy] : []));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [includes, setIncludes] = useState(existing?.includes.join('\n') ?? '');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  // The schedule step is optional: leave Lessons empty and buyers set the pace themselves.
  const paceKnown = !!lessons.trim() || !!minutes.trim();
  const nLessons = parseCount(lessons);
  const nMinutes = minutes.trim() ? parseCount(minutes) : 30;
  const missing = listingIssues({ title, subjects, price, lessons: nLessons, minutesPerLesson: nMinutes, description, grades: !!grades, paceKnown, pickupArea, photos: photos.length });
  const lessonsError = numberFieldError(lessons, 120, 2000);
  const minutesError = numberFieldError(minutes, 30, 480);

  const toggle = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const pickGrade = (g: number) => {
    // First tap sets a single grade; a second tap extends the range.
    if (grades && grades.min === grades.max && g !== grades.min) setGrades({ min: Math.min(g, grades.min), max: Math.max(g, grades.max) });
    else setGrades({ min: g, max: g });
  };
  const addPhoto = async () => {
    setAdding(true);
    try {
      const uri = await pickListingPhoto();
      if (uri) setPhotos((p) => [...p, uri].slice(0, LISTING_PHOTOS_MAX));
    } finally {
      setAdding(false);
    }
  };

  const save = async () => {
    if (price === undefined || !grades || (paceKnown && (!nLessons || !nMinutes))) return;
    setBusy(true);
    setError('');
    const parts = family.parentName.trim().split(/\s+/);
    const first = subjects[0];
    try {
      await saveListing({
        id: existing?.id ?? uid('l'),
        title: title.trim(),
        seller: parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0],
        sellerKind: 'family',
        sellerVerified: false,
        subjects,
        gradeMin: grades.min,
        gradeMax: grades.max,
        philosophies,
        format,
        price,
        condition,
        description: description.trim(),
        includes: includes.split(/\n|,/).map((s) => s.trim()).filter(Boolean),
        lessons: paceKnown ? nLessons! : UNKNOWN_PACE.lessons,
        lessonsPerWeek: paceKnown ? perWeek : UNKNOWN_PACE.lessonsPerWeek,
        minutesPerLesson: paceKnown ? nMinutes! : UNKNOWN_PACE.minutesPerLesson,
        paceUnknown: paceKnown ? undefined : true,
        parentInvolvement: involvement,
        familyStyle: existing?.familyStyle ?? false,
        lessonSteps: existing?.lessonSteps ?? [],
        photos: photos.length ? photos : undefined,
        pickupArea: pickupArea.trim() || undefined,
        ships: ships || undefined,
        cover: SUBJECTS[first].icon,
        color: c.primary,
        esaEligible: false,
        ratingAvg: existing?.ratingAvg ?? 0,
        ratingCount: existing?.ratingCount ?? 0,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        mine: true,
      });
      onClose();
    } catch (e) {
      // The live marketplace refused it (or the network is down): keep the form so nothing is lost.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const publish = <Button title={existing ? 'Save listing' : 'Publish listing'} loading={busy} disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={save} />;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={existing ? 'Edit listing' : 'List a curriculum'}
      dirty={title !== (existing?.title ?? '') || description !== (existing?.description ?? '') || photos.length !== (existing?.photos?.length ?? 0)}
      discardQuestion={existing ? 'Discard your changes?' : 'Discard this listing?'}
      footer={
        <Stack gap={space.xs}>
          {error ? <T color={c.danger} accessibilityLiveRegion="polite">{error}</T> : null}
          {step === 1 ? (
            <Actions>
              <Button kind="secondary" title="Cancel" onPress={onClose} />
              <Button kind="secondary" title="Lesson details ›" onPress={() => setStep(2)} />
              {publish}
            </Actions>
          ) : (
            <Actions>
              <Button kind="secondary" title="‹ Back" onPress={() => setStep(1)} />
              {publish}
            </Actions>
          )}
        </Stack>
      }>
      <T v="caption" muted>
        Step {step} of 2 · {step === 1 ? 'What is it?' : 'Help families schedule it (optional)'}
      </T>
      {step === 1 ? (
        <>
          <Field label="Title" value={title} onChangeText={setTitle} example="Math level 3 teacher guide + workbook" />
          <Stack gap={6}>
            <T v="label">Photos ({photos.length} of {LISTING_PHOTOS_MAX})</T>
            <Row wrap gap={space.sm}>
              {photos.map((uri, i) => (
                <View key={`${i}-${uri.slice(-12)}`}>
                  <Image source={{ uri }} style={{ width: 76, height: 76, borderRadius: 10, backgroundColor: c.surfaceAlt }} accessibilityLabel={`Photo ${i + 1}`} />
                  <Pressable
                    onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${i + 1}`}
                    hitSlop={8}
                    style={{ position: 'absolute', top: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontFamily: fonts.body }}>✕</Text>
                  </Pressable>
                </View>
              ))}
              {photos.length < LISTING_PHOTOS_MAX ? <Button kind="secondary" icon="📷" title="Add photo" loading={adding} onPress={addPhoto} /> : null}
            </Row>
            <T v="caption" muted>Show the cover and any wear, so buyers know the condition.</T>
          </Stack>
          <Stack gap={6}>
            <T v="label">Subjects</T>
            <Row wrap gap={6}>
              {SUBJECT_LIST.map((s) => (
                <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={subjects.includes(s)} onPress={() => setSubjects(toggle(subjects, s))} />
              ))}
            </Row>
          </Stack>
          <Stack gap={6}>
            <T v="label">Grades: {grades ? (grades.min === grades.max ? GRADE_LABELS[grades.min + 1] : `${GRADE_LABELS[grades.min + 1]} – ${GRADE_LABELS[grades.max + 1]}`) : 'pick one or a range'}</T>
            <Row wrap gap={4}>
              {GRADE_SHORT.map((g, i) => (
                <Chip key={g} label={g} selected={!!grades && i - 1 >= grades.min && i - 1 <= grades.max} onPress={() => pickGrade(i - 1)} />
              ))}
            </Row>
            <T v="caption" muted>Tap one grade, then another to make a range.</T>
          </Stack>
          <Stack gap={6}>
            <T v="label">Format</T>
            <Row wrap gap={6}>
              {(Object.keys(FORMAT_LABEL) as ListingFormat[]).map((f) => (
                <Chip key={f} role="radio" label={FORMAT_LABEL[f]} selected={format === f} onPress={() => setFormat(f)} />
              ))}
            </Row>
          </Stack>
          <Stack gap={6}>
            <T v="label">Condition</T>
            <Row wrap gap={6}>
              {(Object.keys(CONDITION_LABEL) as Condition[]).map((k) => (
                <Chip key={k} role="radio" label={CONDITION_LABEL[k]} selected={condition === k} onPress={() => setCondition(k)} />
              ))}
              <Chip role="radio" label="I made it" selected={!condition} onPress={() => setCondition(undefined)} />
            </Row>
          </Stack>
          <MoneyField label="Price ($, 0 = free)" value={price} onChange={setPrice} example="25" />
          <Field
            label="Pickup area (optional)"
            value={pickupArea}
            onChangeText={(t) => setPickupArea(t.slice(0, PICKUP_AREA_MAX + 10))}
            example="Lakewood, CO"
            hint="A city or neighborhood only — never your address."
          />
          <Row wrap gap={6}>
            <Chip label="📦 I can ship it" selected={ships} onPress={() => setShips(!ships)} />
          </Row>
          <Field label="Description" multiline value={description} onChangeText={setDescription} example="Lightly used, no writing inside. Teacher guide and workbook." style={{ minHeight: 90 }} />
          <T v="caption" muted>Your listing shows your first name and last initial. Buyers can message you in Freerange; arrange pickup in a public place — never share your home address.</T>
        </>
      ) : (
        <>
          <T v="caption" muted>With these, families can drop it straight into their plan. Don’t know them? Leave Lessons empty — buyers pick a pace themselves.</T>
          <Row gap={space.md} align="flex-start" wrap>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Field label="Lessons" keyboardType="number-pad" value={lessons} onChangeText={setLessons} example="120" aria-invalid={!!lessonsError} />
              {lessonsError ? <T v="caption" color={c.dangerInk} accessibilityLiveRegion="polite">{lessonsError}</T> : null}
            </View>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Field label="Minutes each" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} example="30" aria-invalid={!!minutesError} />
              {minutesError ? <T v="caption" color={c.dangerInk} accessibilityLiveRegion="polite">{minutesError}</T> : null}
            </View>
          </Row>
          <Stack gap={6}>
            <T v="label">Lessons per week</T>
            <Row wrap gap={6}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Chip key={n} role="radio" label={String(n)} selected={perWeek === n} onPress={() => setPerWeek(n)} />
              ))}
            </Row>
          </Stack>
          <Stack gap={6}>
            <T v="label">Parent involvement</T>
            <Row wrap gap={6}>
              {(Object.keys(INVOLVEMENT_LABEL) as Involvement[]).map((k) => (
                <Chip key={k} role="radio" label={INVOLVEMENT_LABEL[k]} selected={involvement === k} onPress={() => setInvolvement(k)} />
              ))}
            </Row>
          </Stack>
          <Stack gap={6}>
            <T v="label">Teaching style</T>
            <Row wrap gap={6}>
              {(Object.keys(PHILOSOPHY_INFO) as Philosophy[]).map((p) => (
                <Chip key={p} label={`${PHILOSOPHY_INFO[p].emoji} ${PHILOSOPHY_SHORT[p]}`} selected={philosophies.includes(p)} onPress={() => setPhilosophies(toggle(philosophies, p))} />
              ))}
            </Row>
          </Stack>
          <Field label="What's included (one per line)" multiline value={includes} onChangeText={setIncludes} example={'Teacher guide, Student workbook'} />
        </>
      )}
    </Sheet>
  );
}
