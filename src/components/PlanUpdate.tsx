import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { PackageContent } from '@/lib/market';
import type { FlatLesson } from '@/lib/package';
import { diffOutline, progressMoves } from '@/lib/planUpdate';
import type { Curriculum, ID } from '@/lib/types';
import { loadRelease, releaseUpdates, releaseVersions, studioUpdates, type PlanUpdateInfo } from '@/services/planUpdates';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';
import { Button, Card, Pill, Row, Sheet, space, Stack, T, useColors } from '@/ui';

/** Newer versions of this family's scheduled plans, keyed by curriculum id. Rechecked when the screen is focused. */
export function usePlanUpdates(): Record<ID, PlanUpdateInfo> {
  const curricula = useStore((s) => s.curricula);
  const packages = useStudio((s) => s.packages);
  const creator = useStudio((s) => s.profile?.name);
  const userId = useAccount((s) => s.userId);
  const [versions, setVersions] = useState<Record<ID, number>>({});
  const listingIds = curricula.map((c) => c.listingId ?? '').join(',');
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // Recheck when the plans' listings or the account change.
      releaseVersions(listingIds ? useStore.getState().curricula : [], userId)
        .then((v) => alive && setVersions(v))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [listingIds, userId]),
  );
  return useMemo(() => ({ ...releaseUpdates(curricula, packages, versions), ...studioUpdates(curricula, packages, creator) }), [curricula, packages, versions, creator]);
}

/** The banner on a curriculum card. */
export function UpdateBanner({ info, onPress }: { info: PlanUpdateInfo; onPress: () => void }) {
  const c = useColors();
  return (
    <Card tint={c.primarySoft}>
      <Row wrap style={{ justifyContent: 'space-between' }}>
        <T style={{ flex: 1, minWidth: 180 }}>
          {info.source === 'release' ? `✨ Update available: version ${info.version}` : '✏️ You changed this plan in Studio'}
        </T>
        <Button size="sm" title="Review update" onPress={onPress} />
      </Row>
    </Card>
  );
}

const MAX_LISTED = 6;

function LessonList({ title, lessons }: { title: string; lessons: FlatLesson[] }) {
  if (!lessons.length) return null;
  return (
    <Stack gap={2}>
      <T v="label">{title}</T>
      {lessons.slice(0, MAX_LISTED).map((l) => (
        <T key={l.id} v="caption">• Lesson {l.n}: {l.title}{l.unit ? ` (${l.unit})` : ''}</T>
      ))}
      {lessons.length > MAX_LISTED ? <T v="caption" muted>…and {lessons.length - MAX_LISTED} more</T> : null}
    </Stack>
  );
}

/** Preview what changes and where each kid lands, then update or skip. */
export function PlanUpdateSheet({ curriculum, info, onClose }: { curriculum?: Curriculum; info?: PlanUpdateInfo; onClose: () => void }) {
  return (
    <Sheet visible={!!curriculum && !!info} onClose={onClose} title={info?.source === 'studio' ? 'Update from Studio' : 'Update this plan'}>
      {curriculum && info ? <UpdatePreview key={`${curriculum.id}:${info.key}`} curriculum={curriculum} info={info} onClose={onClose} /> : null}
    </Sheet>
  );
}

function UpdatePreview({ curriculum, info, onClose }: { curriculum: Curriculum; info: PlanUpdateInfo; onClose: () => void }) {
  const c = useColors();
  const kids = useStore((s) => s.children);
  const { updatePlan, skipPlanUpdate } = useStore.getState();
  const [loaded, setLoaded] = useState<PackageContent | undefined>(info.content);
  const [error, setError] = useState('');

  useEffect(() => {
    if (info.content) return;
    let alive = true;
    loadRelease(curriculum)
      .then((r) => alive && (r ? setLoaded(r) : setError('This version isn’t available any more.')))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [curriculum, info.content]);

  if (error) return <T color={c.danger}>{error}</T>;
  if (!loaded) return <T muted>Loading the new version…</T>;

  const diff = diffOutline(curriculum.outline, loaded.units);
  const moves = progressMoves(curriculum, loaded.units);
  const unchanged = !diff.added.length && !diff.removed.length && !diff.changed.length && !diff.moved;
  const name = (id: ID) => kids.find((k) => k.id === id)?.name ?? 'Student';

  return (
    <Stack gap={space.lg}>
      <T v="heading">{curriculum.name}</T>
      {loaded.note ? (
        <Card tint={c.surfaceAlt}>
          <T v="label">What’s new{info.version ? ` in version ${info.version}` : ''}</T>
          <T>{loaded.note}</T>
        </Card>
      ) : null}
      <Row wrap gap={6}>
        <Pill text={`${diff.before} → ${diff.after} lessons`} />
        {diff.added.length ? <Pill text={`＋ ${diff.added.length} new`} bg={c.primarySoft} fg={c.text} /> : null}
        {diff.changed.length ? <Pill text={`✏️ ${diff.changed.length} changed`} /> : null}
        {diff.removed.length ? <Pill text={`− ${diff.removed.length} removed`} bg={c.accentSoft} fg={c.text} /> : null}
        {diff.moved ? <Pill text={`↕ ${diff.moved} reordered`} /> : null}
      </Row>
      {unchanged ? <T muted>The lessons are the same; only details like the license or credit line changed.</T> : null}
      <LessonList title="New lessons" lessons={diff.added} />
      <LessonList title="Changed lessons" lessons={diff.changed} />
      <LessonList title="Removed lessons" lessons={diff.removed} />

      <Stack gap={4}>
        <T v="label">Everyone keeps their place</T>
        {moves.map((m) => (
          <Stack key={m.childId} gap={2}>
            <T v="caption">
              {name(m.childId)}:{' '}
              {m.lastDone ? `finished through “${m.lastDone.title}”, lesson ${m.before} → ${m.after} of ${diff.after}` : `starts at lesson 1 of ${diff.after}`}
            </T>
            {m.skippedNew.length ? (
              <T v="caption" muted>
                {m.skippedNew.length === 1 ? `New lesson “${m.skippedNew[0].title}” comes before` : `${m.skippedNew.length} new lessons come before`} {name(m.childId)}’s spot, so {m.skippedNew.length === 1 ? 'it counts' : 'they count'} as done. Use −1 on the card to go back to {m.skippedNew.length === 1 ? 'it' : 'them'}.
              </T>
            ) : null}
          </Stack>
        ))}
        <T v="caption" muted>Finished lessons keep their history. Today’s not-started lessons switch to the new version.</T>
      </Stack>

      <Row wrap style={{ justifyContent: 'flex-end' }}>
        <Button
          kind="ghost"
          title={info.source === 'release' ? 'Skip this version' : 'Keep the plan as it is'}
          onPress={() => {
            skipPlanUpdate(curriculum.id, info.key);
            onClose();
          }}
        />
        <Button
          title="Update my plan"
          disabled={!loaded.units.some((u) => u.lessons.length)}
          reason="The new version has no lessons"
          onPress={() => {
            updatePlan(curriculum.id, loaded);
            onClose();
          }}
        />
      </Row>
    </Stack>
  );
}
