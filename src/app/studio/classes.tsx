import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Cover } from '@/components/market/ListingCard';
import { MAX_FAMILIES, type CoopClass } from '@/lib/coop';
import { parseCount } from '@/lib/parse';
import { classIssues, createClass, teachingClasses } from '@/services/coopApi';
import { useAccount } from '@/store/useAccount';
import { useStudio } from '@/store/useStudio';
import { Button, Card, Chip, Empty, Field, Pill, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

/** The teacher's co-op classes, and starting a new one from a Studio curriculum. */
export default function CoopClasses() {
  const c = useColors();
  const packages = useStudio((s) => s.packages);
  const userId = useAccount((s) => s.userId);
  const [classes, setClasses] = useState<CoopClass[] | null>(null);
  const [pkgId, setPkgId] = useState<string | undefined>();
  const [max, setMax] = useState(String(MAX_FAMILIES));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      teachingClasses()
        .then((x) => alive && setClasses(x))
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
      return () => {
        alive = false;
      };
    }, []),
  );

  const eligible = packages.filter((p) => !classIssues(p).length);
  const pkg = packages.find((p) => p.id === pkgId);
  const maxN = parseCount(max);
  const missing = [!pkg && 'a curriculum', !(maxN && maxN >= 1 && maxN <= MAX_FAMILIES) && `room for 1–${MAX_FAMILIES} families`].filter(Boolean);

  const create = async () => {
    if (!pkg || !maxN) return;
    setBusy(true);
    setError('');
    try {
      const cls = await createClass(pkg, maxN);
      router.push({ pathname: '/studio/class/[id]', params: { id: cls.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <T v="display">👩‍🏫 Co-op classes</T>
      <T muted>Teach one plan to a group of families. They join with an invite code, schedule it at their own pace, and get your changes as updates. You see how many lessons each student has finished (names only if a family chooses to share them).</T>
      {!userId ? <T v="caption" muted style={{ marginTop: space.sm }}>Without an account, classes stay on this device (your own family can join to try it). Sign in (Settings → Account) so other families can join.</T> : null}

      <Section title="Your classes">
        {classes === null ? (
          <T muted>Loading…</T>
        ) : classes.length === 0 ? (
          <Empty icon="🏫" title="No classes yet" body="Start one below from a curriculum you made in Studio." />
        ) : (
          <Stack>
            {classes.map((k) => (
              <Card key={k.id} onPress={() => router.push({ pathname: '/studio/class/[id]', params: { id: k.id } })}>
                <Row gap={space.md}>
                  <Cover listing={k} size={44} />
                  <Stack gap={2} style={{ flex: 1 }}>
                    <T v="heading">{k.title}</T>
                    <T v="caption" muted>{k.families} of {k.maxFamilies} families · version {k.version}{k.code ? ` · code ${k.code}` : ''}</T>
                  </Stack>
                  {k.status === 'closed' ? <Pill text="Closed to new families" /> : <Pill text="Open" bg={c.successSoft} fg={c.success} />}
                </Row>
              </Card>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Start a class" subtitle="Families get the lessons of one of your Studio curricula. Book conversions stay private, and adapted sources keep their license.">
        {eligible.length === 0 ? (
          <T muted>Make a curriculum in Studio first (with at least one lesson).</T>
        ) : (
          <Stack>
            <Row wrap gap={6}>
              {eligible.map((p) => (
                <Chip key={p.id} label={`${p.cover} ${p.title}`} selected={pkgId === p.id} onPress={() => setPkgId(p.id)} />
              ))}
            </Row>
            <Field label={`Room for how many families? (up to ${MAX_FAMILIES})`} keyboardType="number-pad" value={max} onChangeText={setMax} />
            {error ? <T color={c.danger}>{error}</T> : null}
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button title="Start the class" loading={busy} disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={create} />
            </Row>
          </Stack>
        )}
      </Section>
    </Screen>
  );
}
