import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { ShareCode } from '@/components/ShareCode';
import { furthest, MAX_FAMILIES, rosterSummary, studentLabel, type ClassMember, type CoopClass } from '@/lib/coop';
import { formatDate } from '@/lib/dates';
import type { PackageContent } from '@/lib/market';
import { lessonTotal } from '@/lib/package';
import { parseCount } from '@/lib/parse';
import { sameOutline } from '@/lib/planUpdate';
import { classContent, classRoster, classSettings, endClass, newInviteCode, removeFamily, sendClassUpdate, teachingClasses } from '@/services/coopApi';
import { useStudio } from '@/store/useStudio';
import { Button, Card, Chip, Empty, Field, Progress, Row, Screen, Section, space, Stack, Stat, T, useColors, useConfirm } from '@/ui';

const day = (iso: string) => formatDate(iso.slice(0, 10), { month: 'short', day: 'numeric' });

/** One co-op class: invite code, sending updates, the roster, and settings. */
export default function CoopClassScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cls, setCls] = useState<CoopClass | null | undefined>(undefined);
  const [roster, setRoster] = useState<ClassMember[]>([]);
  const [content, setContent] = useState<PackageContent | undefined>();
  const pkg = useStudio((s) => s.packages.find((p) => p.id === cls?.packageId));
  const [note, setNote] = useState('');
  const [max, setMax] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sentMsg, setSentMsg] = useState('');
  const confirm = useConfirm();

  const fetchAll = useCallback(async () => {
    const found = (await teachingClasses()).find((x) => x.id === id) ?? null;
    const [r, k] = found ? await Promise.all([classRoster(found), classContent(found.id)]) : [[], undefined];
    return { found, r, k };
  }, [id]);
  const show = useCallback(({ found, r, k }: Awaited<ReturnType<typeof fetchAll>>) => {
    setCls(found);
    if (found) setMax(String(found.maxFamilies));
    setRoster(r);
    setContent(k);
  }, []);
  const load = useCallback(() => fetchAll().then(show), [fetchAll, show]);
  useEffect(() => {
    let alive = true;
    fetchAll()
      .then((x) => alive && show(x))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [fetchAll, show]);

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (cls === undefined) return <Screen edges={[]}><T muted>{error || 'Loading…'}</T></Screen>;
  if (cls === null) return <Screen edges={[]}><Empty icon="🏫" title="That class isn't here" body="It may have ended." action={<Button title="All classes" onPress={() => router.replace('/studio/classes')} />} /></Screen>;

  const total = lessonTotal(content?.units) || cls.lessons || 1;
  const summary = rosterSummary(roster, total);
  const changed = !!pkg && !!content && (!sameOutline(content.units, pkg.units) || content.license?.kind !== pkg.license.kind);
  const maxN = parseCount(max);

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: cls.title }} />
      <T v="display">{cls.cover} {cls.title}</T>
      <T muted>Version {cls.version} · {total} lessons · {cls.status === 'open' ? 'open to new families' : 'closed to new families'}</T>

      <Row wrap gap={space.md} style={{ marginTop: space.lg }} align="stretch">
        <Stat label="Families" value={`${summary.families} / ${cls.maxFamilies}`} />
        <Stat label="Students" value={String(summary.students)} />
        <Stat label="Average progress" value={`${Math.round(summary.average * 100)}%`} />
        <Stat label="Finished" value={String(summary.finished)} sub="students" />
      </Row>

      {cls.code ? (
        <View style={{ marginTop: space.lg }}>
          <ShareCode label="Invite code" code={cls.code} path={`/coop/${cls.code}`} message={`Join my co-op class “${cls.title}” on Freerange. Each family goes at its own pace.`} />
          <T v="caption" muted>Families enter the code under My Curriculum → ＋ Add → Join a co-op class, or open the link.</T>
        </View>
      ) : null}

      <Section title="Send your changes" subtitle="Families see “Update available” and choose when to take it. Everyone keeps their place.">
        {!pkg ? (
          <T muted>The curriculum for this class isn’t in your Studio any more, so there’s nothing new to send.</T>
        ) : changed ? (
          <Stack>
            <T>You’ve changed “{pkg.title}” since version {cls.version}.</T>
            <Field label="What’s new (families see this)" placeholder="Added two lessons on frogs" value={note} onChangeText={setNote} multiline />
            <Row>
              <Button
                title={`Send version ${cls.version + 1} to the class`}
                loading={busy === 'send'}
                onPress={() =>
                  run('send', async () => {
                    await sendClassUpdate(cls, pkg, note);
                    setNote('');
                    setSentMsg(`Version ${cls.version + 1} sent.`);
                  })
                }
              />
              <Button kind="ghost" title="Edit lessons" onPress={() => router.push({ pathname: '/studio/[id]', params: { id: pkg.id, tab: 'lessons' } })} />
            </Row>
          </Stack>
        ) : (
          <Row wrap>
            <T muted style={{ flex: 1 }}>{sentMsg || 'Families have your latest lessons.'}</T>
            <Button size="sm" kind="secondary" title="Edit lessons" onPress={() => router.push({ pathname: '/studio/[id]', params: { id: pkg.id, tab: 'lessons' } })} />
          </Row>
        )}
      </Section>

      <Section title="Roster" subtitle="Lessons finished by each family’s students. Kids show as “Student 1, 2…” unless the family shares first names.">
        {roster.length === 0 ? (
          <Empty icon="👋" title="No families yet" body="Share the invite code. Families show up here when they join." />
        ) : (
          <Stack>
            {roster.map((m) => (
              <Card key={m.familyId}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <T v="heading" style={{ flex: 1 }}>{m.label}</T>
                  <T v="caption" muted>joined {day(m.joinedAt)}</T>
                </Row>
                {m.progress.length === 0 ? (
                  <T v="caption" muted>Hasn’t scheduled it yet.</T>
                ) : (
                  m.progress.map((s, i) => (
                    <Stack key={i} gap={2}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <T v="label">{studentLabel(s, i)}</T>
                        <T v="caption">{Math.min(s.done, total)} / {total} lessons{s.done >= total ? ' 🎓' : s.done ? ` · reached lesson ${Math.min(s.done + 1, total)}` : ''}</T>
                      </Row>
                      <Progress value={Math.min(s.done, total) / total} />
                    </Stack>
                  ))
                )}
                <Row wrap style={{ justifyContent: 'space-between' }}>
                  <T v="caption" muted>
                    {m.onVersion && m.onVersion < cls.version ? `On version ${m.onVersion} (hasn’t taken version ${cls.version} yet)` : m.onVersion ? `On version ${m.onVersion}` : ''}
                    {furthest(m.progress) ? ` · updated ${day(m.updatedAt)}` : ''}
                  </T>
                  <Button size="sm" kind="ghost" title="Remove" onPress={() => confirm.ask(`Remove ${m.label} from the class?`, () => run('remove', () => removeFamily(cls, m.familyId)), { confirm: 'Remove', body: 'They keep the plan they have, but stop getting your updates, and you stop seeing their progress.' })} />
                </Row>
              </Card>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Settings">
        <Card>
          <Row gap={space.md} align="flex-end" wrap>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Field label={`Room for (1–${MAX_FAMILIES} families)`} keyboardType="number-pad" value={max} onChangeText={setMax} />
            </View>
            <Chip label={cls.status === 'open' ? '✓ Open to new families' : 'Closed to new families'} selected={cls.status === 'open'} onPress={() => run('open', () => classSettings(cls, cls.maxFamilies, cls.status !== 'open'))} />
            <Button size="sm" kind="secondary" title="Save" disabled={!maxN || maxN > MAX_FAMILIES || maxN === cls.maxFamilies} loading={busy === 'max'} onPress={() => run('max', () => classSettings(cls, maxN!, cls.status === 'open'))} />
          </Row>
          <Row wrap>
            <Button size="sm" kind="secondary" title="New invite code" loading={busy === 'code'} onPress={() => confirm.ask('Make a new invite code?', () => run('code', () => newInviteCode(cls)), { confirm: 'New code', body: 'The old code and link stop working. Families already in the class stay.' })} />
            <Button size="sm" kind="danger" title="End the class" onPress={() => confirm.ask(`End “${cls.title}”?`, () => run('end', async () => { await endClass(cls); router.replace('/studio/classes'); }), { confirm: 'End class', body: 'Families keep the plan and their progress, but get no more updates. This can’t be undone.' })} />
          </Row>
        </Card>
      </Section>
      {error ? <T color={c.danger}>{error}</T> : null}
      {confirm.element}
    </Screen>
  );
}
