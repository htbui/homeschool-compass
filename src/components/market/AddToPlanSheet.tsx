import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MaterialsEditor } from '@/components/LessonMaterials';
import { formatDate, WEEKDAY_SHORT } from '@/lib/dates';
import { defaultLessonDays, finishDateFor, INVOLVEMENT_LABEL, matchListing, nextStartDate, suggestStartTime, type Listing } from '@/lib/market';
import type { ID, Weekday } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, DateField, Row, Sheet, space, Stack, T, TimeField, useColors } from '@/ui';

/**
 * Turn a curriculum into a paced plan: who's doing it, which days, when.
 * Creates a Curriculum (pacing) and RhythmBlocks (schedule) in one step.
 */
export function AddToPlanSheet({ listing, purchaseId, visible, onClose, intro }: { listing: Listing; purchaseId?: ID; visible: boolean; onClose: () => void; intro?: string }) {
  return visible ? <PlanForm listing={listing} purchaseId={purchaseId} onClose={onClose} intro={intro} /> : null;
}

function PlanForm({ listing, purchaseId, onClose, intro }: { listing: Listing; purchaseId?: ID; onClose: () => void; intro?: string }) {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const kids = useStore((s) => s.children);
  const blocks = useStore((s) => s.blocks);
  const fits = matchListing(listing, { family, kids }).fitsKids;
  const [childIds, setChildIds] = useState<ID[]>(fits.length ? (listing.familyStyle ? fits : fits.slice(0, 1)) : kids.slice(0, 1).map((k) => k.id));
  const [days, setDays] = useState<Weekday[]>(defaultLessonDays(listing.lessonsPerWeek, family.schoolDays));
  const [startDate, setStartDate] = useState<string | undefined>(nextStartDate(family.schoolDays));
  const needsParent = listing.parentInvolvement !== 'low';
  const [startTime, setStartTime] = useState<string | undefined>(() => suggestStartTime(blocks, childIds, days, listing.minutesPerLesson, needsParent));
  const [done, setDone] = useState<{ finish?: string; curriculumId: ID } | null>(null);

  const finish = startDate ? finishDateFor(startDate, days, listing.lessons) : undefined;
  const late = finish && finish > family.schoolYearEnd;
  const missing = [childIds.length === 0 && 'at least one student', days.length === 0 && 'at least one lesson day', !startDate && 'a start date', !startTime && 'a start time'].filter(Boolean);

  const toggleKid = (id: ID) => setChildIds(childIds.includes(id) ? childIds.filter((x) => x !== id) : [...childIds, id]);
  const toggleDay = (d: Weekday) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() as Weekday[]);

  const save = () => {
    if (!startDate || !startTime) return;
    const r = useStore.getState().addListingToPlan(listing, { childIds, days, startDate, startTime, children: kids }, purchaseId);
    setDone({ finish: r.curriculum.targetEndDate, curriculumId: r.curriculum.id });
  };

  if (done) {
    return (
      <Sheet visible onClose={onClose} title="Added to your plan ✓">
        <T>
          {listing.title} starts {formatDate(startDate!, { weekday: 'long', month: 'long', day: 'numeric' })} at the pace of {days.length} lesson{days.length === 1 ? '' : 's'} a week
          {done.finish ? `, finishing around ${formatDate(done.finish, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.
        </T>
        <T muted>Lessons appear on the Rhythm and in each child&apos;s day. Finishing a lesson moves that child forward, and missed days are re-paced automatically.</T>
        <Card>
          <T v="heading">Where do the lessons live?</T>
          <MaterialsEditor curriculumId={done.curriculumId} />
        </Card>
        <Row wrap style={{ justifyContent: 'flex-end' }}>
          <Button kind="secondary" title="See pacing" onPress={() => { onClose(); router.push('/learn'); }} />
          <Button title="See the rhythm" onPress={() => { onClose(); router.push('/schedule'); }} />
        </Row>
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={onClose} title="Add to your plan">
      {intro ? <Card tint={c.successSoft}><T v="heading">{intro}</T></Card> : null}
      <T muted>{listing.title} · {listing.lessons} lessons · about {listing.minutesPerLesson} min each · {INVOLVEMENT_LABEL[listing.parentInvolvement].toLowerCase()}</T>
      <Stack gap={6}>
        <T v="label">Who&apos;s doing it?</T>
        <Row wrap gap={6}>
          {kids.map((k) => (
            <Chip key={k.id} label={`${k.avatar} ${k.name}${fits.includes(k.id) ? '' : ' (outside grade range)'}`} selected={childIds.includes(k.id)} onPress={() => toggleKid(k.id)} />
          ))}
        </Row>
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
          <DateField label="Start date" value={startDate} onChange={setStartDate} />
        </View>
        <View style={{ flex: 1, minWidth: 180 }}>
          <TimeField label="Start time" value={startTime} onChange={setStartTime} />
        </View>
      </Row>
      {finish ? (
        <Card tint={late ? c.accentSoft : c.primarySoft}>
          <T>
            📅 One lesson per chosen day finishes on <T style={{ fontWeight: '700' }}>{formatDate(finish, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</T>.
          </T>
          {late ? <T v="caption">That&apos;s after your school year ends ({formatDate(family.schoolYearEnd, { month: 'short', day: 'numeric' })}). Add a lesson day to finish on time — or keep going over the summer.</T> : null}
        </Card>
      ) : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button kind="secondary" title={intro ? 'Later' : 'Cancel'} onPress={onClose} />
        <Button title="Add to plan" disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={save} />
      </Row>
    </Sheet>
  );
}
