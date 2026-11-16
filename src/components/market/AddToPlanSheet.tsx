import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MaterialsEditor } from '@/components/LessonMaterials';
import { formatDate, WEEKDAY_SHORT } from '@/lib/dates';
import { defaultLessonDays, finishDateFor, INVOLVEMENT_LABEL, matchListing, nextStartDate, suggestStartTime, type Listing, type PackageContent } from '@/lib/market';
import { everyLessonLinked, namesList, numberFieldError } from '@/lib/marketView';
import { parseCount } from '@/lib/parse';
import { packageContent } from '@/services/studioApi';
import type { Curriculum, ID, Weekday } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Actions, Button, Card, Chip, DateField, Field, Row, Sheet, space, Stack, T, TimeField, useColors } from '@/ui';

/**
 * Turn a curriculum into a paced plan: who's doing it, which days, when.
 * Creates a Curriculum (pacing) and RhythmBlocks (schedule) in one step.
 */
export function AddToPlanSheet({ listing, purchaseId, visible, onClose, intro, content, extra, gradesKnown = true }: { listing: Listing; purchaseId?: ID; visible: boolean; onClose: () => void; intro?: string; content?: PackageContent; extra?: Partial<Curriculum>; gradesKnown?: boolean }) {
  return visible ? <PlanForm listing={listing} purchaseId={purchaseId} onClose={onClose} intro={intro} content={content} extra={extra} gradesKnown={gradesKnown} /> : null;
}

/** `extra` is added to the new curriculum (e.g. the co-op class it came from). */
/** `gradesKnown: false` (e.g. a private copy of a book, which has no real grade range) skips the grade warnings. */
function PlanForm({ listing: given, purchaseId, onClose, intro, content, extra, gradesKnown }: { listing: Listing; purchaseId?: ID; onClose: () => void; intro?: string; content?: PackageContent; extra?: Partial<Curriculum>; gradesKnown: boolean }) {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const kids = useStore((s) => s.children);
  const blocks = useStore((s) => s.blocks);
  // A used book whose seller didn't know the lesson numbers: the family sets them here.
  const [lessonText, setLessonText] = useState(given.paceUnknown ? '' : String(given.lessons));
  const [minuteText, setMinuteText] = useState(String(given.minutesPerLesson));
  const listing: Listing = given.paceUnknown ? { ...given, lessons: parseCount(lessonText) ?? 0, minutesPerLesson: parseCount(minuteText) ?? given.minutesPerLesson } : given;
  const fits = gradesKnown ? matchListing(listing, { family, kids }).fitsKids : [];
  const [childIds, setChildIds] = useState<ID[]>(fits.length ? (listing.familyStyle ? fits : fits.slice(0, 1)) : kids.slice(0, 1).map((k) => k.id));
  const [days, setDays] = useState<Weekday[]>(defaultLessonDays(listing.lessonsPerWeek, family.schoolDays));
  const [startDate, setStartDate] = useState<string | undefined>(nextStartDate(family.schoolDays));
  const needsParent = listing.parentInvolvement !== 'low';
  const [startTime, setStartTime] = useState<string | undefined>(() => suggestStartTime(blocks, childIds, days, listing.minutesPerLesson, needsParent));
  const [done, setDone] = useState<{ finish?: string; curriculumId: ID } | null>(null);

  const finish = startDate && listing.lessons > 0 ? finishDateFor(startDate, days, listing.lessons) : undefined;
  const late = finish && finish > family.schoolYearEnd;
  const missing = [
    childIds.length === 0 && 'at least one student',
    given.paceUnknown && !(listing.lessons > 0) && 'how many lessons',
    days.length === 0 && 'at least one lesson day',
    !startDate && 'a start date',
    !startTime && 'a start time',
  ].filter(Boolean);
  // Family-style books suit siblings outside the grade range too: suggest them rather than flag them.
  const siblings = listing.familyStyle ? kids.filter((k) => !childIds.includes(k.id)) : [];

  const toggleKid = (id: ID) => setChildIds(childIds.includes(id) ? childIds.filter((x) => x !== id) : [...childIds, id]);
  const toggleDay = (d: Weekday) => setDays(days.includes(d) ? days.filter((x) => x !== d) : ([...days, d].sort() as Weekday[]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!startDate || !startTime) return;
    setBusy(true);
    setError('');
    try {
      // Studio packages bring their full lesson-by-lesson plan.
      const plan = content ?? (listing.packageId ? await packageContent(listing) : undefined);
      const r = useStore.getState().addListingToPlan(listing, { childIds, days, startDate, startTime, children: kids }, purchaseId, plan, extra);
      setDone({ finish: r.curriculum.targetEndDate, curriculumId: r.curriculum.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) return <Added listing={listing} curriculumId={done.curriculumId} startDate={startDate!} days={days.length} finish={done.finish} onClose={onClose} />;

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add to your plan"
      footer={
        <Stack gap={space.xs}>
          {error ? <T color={c.danger} accessibilityLiveRegion="polite">{error}</T> : null}
          <Actions>
            <Button kind="secondary" title={intro ? 'Later' : 'Cancel'} onPress={onClose} />
            <Button title="Add to plan" disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} loading={busy} onPress={save} />
          </Actions>
        </Stack>
      }>
      {intro ? (
        <Card tint={c.successSoft}>
          <T v="heading" color={c.successInk} accessibilityLiveRegion="polite">{intro}</T>
        </Card>
      ) : null}
      <T muted>
        {listing.title}
        {given.paceUnknown ? '' : ` · ${listing.lessons} lessons · about ${listing.minutesPerLesson} min each`} · {INVOLVEMENT_LABEL[listing.parentInvolvement].toLowerCase()}
      </T>
      {given.paceUnknown ? (
        <Stack gap={6}>
          <T v="caption" muted>The seller didn’t say how many lessons it has. Count the chapters or pages you’ll split it into.</T>
          <Row gap={space.md} align="flex-start" wrap>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Field label="How many lessons?" keyboardType="number-pad" value={lessonText} onChangeText={setLessonText} example="36" />
              {numberFieldError(lessonText, 36, 2000) ? <T v="caption" color={c.dangerInk}>{numberFieldError(lessonText, 36, 2000)}</T> : null}
            </View>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Field label="Minutes each" keyboardType="number-pad" value={minuteText} onChangeText={setMinuteText} example="30" />
            </View>
          </Row>
        </Stack>
      ) : null}
      <Stack gap={6}>
        <T v="label">Who&apos;s doing it?</T>
        <Row wrap gap={6}>
          {kids.map((k) => (
            <Chip key={k.id} label={`${k.avatar} ${k.name}${!gradesKnown || fits.includes(k.id) || listing.familyStyle ? '' : ' (outside grade range)'}`} selected={childIds.includes(k.id)} onPress={() => toggleKid(k.id)} />
          ))}
        </Row>
        {siblings.length ? (
          <Row wrap gap={space.sm}>
            <T v="caption" color={c.groupInk} style={{ flexShrink: 1 }}>👨‍👩‍👧 Family-style: siblings can join in the same block.</T>
            <Button size="sm" kind="secondary" title={`Add ${namesList(siblings.map((k) => k.name))} too?`} onPress={() => setChildIds([...childIds, ...siblings.map((k) => k.id)])} />
          </Row>
        ) : null}
        {childIds.length > 1 ? (
          <T v="caption" muted>{listing.familyStyle ? 'Taught together as one family block.' : needsParent ? 'Each child gets their own block; 1-on-1 times are staggered so you’re never needed twice at once.' : 'Each child gets their own block.'}</T>
        ) : null}
      </Stack>
      <Stack gap={6}>
        <T v="label">Lesson days (suggested: {listing.lessonsPerWeek} a week)</T>
        <Row wrap gap={6}>
          {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => (
            <Chip key={d} label={WEEKDAY_SHORT[d]} selected={days.includes(d)} onPress={() => toggleDay(d)} />
          ))}
        </Row>
      </Stack>
      <Row gap={space.md} align="flex-start" wrap>
        <View style={{ flex: 1, minWidth: 180 }}>
          <DateField label="Start date" value={startDate} onChange={setStartDate} echo={false} />
        </View>
        <View style={{ flex: 1, minWidth: 180 }}>
          <TimeField label="Start time" value={startTime} onChange={setStartTime} echo={false} />
        </View>
      </Row>
      {finish ? (
        <Card tint={late ? c.accentSoft : c.primarySoft}>
          <T color={late ? c.accentInk : c.primaryInk}>
            📅 One lesson per chosen day finishes on <T color={late ? c.accentInk : c.primaryInk} style={{ fontWeight: '700' }}>{formatDate(finish, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</T>.
          </T>
          {late ? <T v="caption" color={c.accentInk}>That&apos;s after your school year ends ({formatDate(family.schoolYearEnd, { month: 'short', day: 'numeric' })}). Add a lesson day to finish on time — or keep going over the summer.</T> : null}
        </Card>
      ) : null}
    </Sheet>
  );
}

/** Done: where it lands, and (only if it's needed) where the lessons live. */
function Added({ listing, curriculumId, startDate, days, finish, onClose }: { listing: Listing; curriculumId: ID; startDate: string; days: number; finish?: string; onClose: () => void }) {
  const outline = useStore((s) => s.curricula.find((k) => k.id === curriculumId)?.outline);
  const linked = everyLessonLinked(outline);
  const [addOwn, setAddOwn] = useState(false);
  const go = (path: '/today' | '/schedule') => {
    onClose();
    router.push(path);
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Added to your plan ✓"
      footer={
        <Actions>
          <Button kind="secondary" title="See the rhythm" onPress={() => go('/schedule')} />
          <Button title="See today’s plan" onPress={() => go('/today')} />
        </Actions>
      }>
      <T>
        {listing.title} starts {formatDate(startDate, { weekday: 'long', month: 'long', day: 'numeric' })} at the pace of {days} lesson{days === 1 ? '' : 's'} a week
        {finish ? `, finishing around ${formatDate(finish, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.
      </T>
      <T muted>Lessons appear on the Rhythm and in each child&apos;s day. Finishing a lesson moves that child forward, and missed days are re-paced automatically.</T>
      {linked && !addOwn ? (
        <Card>
          <T v="label">✓ Every lesson links to the free text</T>
          <Row>
            <Button size="sm" kind="ghost" title="Add your own link or file" onPress={() => setAddOwn(true)} />
          </Row>
        </Card>
      ) : (
        <Card>
          <T v="heading">{linked ? 'Your own links and files' : 'Where do the lessons live? (optional)'}</T>
          <MaterialsEditor curriculumId={curriculumId} />
        </Card>
      )}
    </Sheet>
  );
}
