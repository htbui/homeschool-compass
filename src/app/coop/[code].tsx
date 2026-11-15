import { Redirect, Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { Cover } from '@/components/market/ListingCard';
import { classToListing, normalizeClassCode, type CoopClass } from '@/lib/coop';
import { INVOLVEMENT_LABEL, gradeRangeLabel, type PackageContent } from '@/lib/market';
import { cloudEnabled } from '@/services/cloud';
import { joinClass, previewClass } from '@/services/coopApi';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, Empty, Field, Row, Screen, space, Stack, T, useColors } from '@/ui';

/** A co-op invite link: see the class, join it, and schedule it at your own pace. */
export default function JoinCoopClass() {
  const c = useColors();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = normalizeClassCode(raw ?? '');
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);
  const userId = useAccount((s) => s.userId);
  const [cls, setCls] = useState<CoopClass | null | undefined>(undefined);
  const already = useStore((s) => s.curricula.find((k) => !!k.coopClassId && k.coopClassId === cls?.id));
  const [label, setLabel] = useState(family?.familyName ?? '');
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState<{ cls: CoopClass; content: PackageContent } | null>(null);
  const needsAccount = cloudEnabled && !userId;

  const kid = !!family && mode.kind === 'kid';

  useEffect(() => {
    if (needsAccount || kid) return;
    previewClass(code)
      .then((x) => setCls(x ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [code, needsAccount, kid]);

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      setJoined(await joinClass(code, label, share));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Joining a class is for grown-ups: an invite link opened in kid mode goes back to the kid's day.
  if (family && mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: 'Join a co-op class' }} />
      {needsAccount ? (
        <Empty icon="👩‍🏫" title="You’re invited to a co-op class" body="Sign in or create a free account to join, then open this link again." action={<Button title="Sign in" onPress={() => router.push('/account')} />} />
      ) : cls === undefined && !error ? (
        <T muted>Looking up the class…</T>
      ) : cls === null ? (
        <Empty icon="🔎" title="That class code isn't valid" body="Ask the teacher for a new invite code — they may have changed it." action={<Button title="Back to My Curriculum" onPress={() => router.replace('/learn')} />} />
      ) : cls ? (
        <Stack gap={space.lg}>
          <Row gap={space.lg} align="flex-start">
            <Cover listing={cls} size={72} />
            <Stack gap={4} style={{ flex: 1 }}>
              <T v="title">{cls.title}</T>
              <T muted>👩‍🏫 {cls.teacherName} · {cls.families} of {cls.maxFamilies} families</T>
              <T v="caption" muted>
                {cls.lessons ?? '?'} lessons · {gradeRangeLabel(cls.gradeMin, cls.gradeMax)} · {cls.lessonsPerWeek}/week suggested · {INVOLVEMENT_LABEL[cls.parentInvolvement].toLowerCase()}
              </T>
            </Stack>
          </Row>
          {cls.description ? <T>{cls.description}</T> : null}
          <Card tint={c.surfaceAlt}>
            <T v="caption">Your family goes at its own pace: the lessons land in your kids’ days like any curriculum. When the teacher changes the plan, you’ll see “Update available” and choose whether to take it. The teacher sees how many lessons each of your students has finished.</T>
          </Card>
          {already || joined ? null : !family ? (
            <T muted>Set up your family first, then open this link again.</T>
          ) : cls.status !== 'open' && !cls.joined ? (
            <T muted>This class isn’t taking new families right now.</T>
          ) : cls.families >= cls.maxFamilies && !cls.joined ? (
            <T muted>This class is full.</T>
          ) : (
            <Stack>
              <Field label="How the teacher sees your family" placeholder="The Rivera family" value={label} onChangeText={setLabel} maxLength={60} />
              <Stack gap={4}>
                <Chip label={share ? '✓ Show my kids’ first names to the teacher' : 'Show my kids’ first names to the teacher'} selected={share} onPress={() => setShare(!share)} />
                <T v="caption" muted>{share ? 'The teacher sees each kid’s first name next to their progress.' : 'Off: the teacher sees “Student 1”, “Student 2” and how far each has got, never names.'} You can change this later.</T>
              </Stack>
              <Button size="lg" title="Join the class" loading={busy} disabled={!label.trim()} reason="Add how the teacher sees your family" onPress={join} />
            </Stack>
          )}
          {already && !joined ? (
            <Card tint={c.successSoft}>
              <T>✓ You’re in this class. It’s in My Curriculum.</T>
              <Button kind="secondary" title="See my curriculum" onPress={() => router.replace('/learn')} />
            </Card>
          ) : null}
        </Stack>
      ) : null}
      {error ? <T color={c.danger}>{error}</T> : null}
      {joined && family ? (
        <AddToPlanSheet
          visible
          listing={classToListing(joined.cls, joined.content)}
          content={joined.content}
          extra={{ coopClassId: joined.cls.id, coopTeacher: joined.cls.teacherName, coopShareNames: share, listingId: undefined }}
          intro={`🎉 You’re in ${joined.cls.teacherName}’s class! Choose your pace.`}
          onClose={() => router.replace('/learn')}
        />
      ) : null}
    </Screen>
  );
}
