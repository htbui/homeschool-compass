import { Redirect, router, Stack as RouterStack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { money } from '@/components/market/ListingCard';
import { formatDate } from '@/lib/dates';
import { LICENSE_INFO, licenseName } from '@/lib/license';
import { lessonTotal, ORIGIN_LABEL, type CurriculumPackage } from '@/lib/package';
import { creatorStats, loadStudio, type ListingStats } from '@/services/studioApi';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';
import { Button, Card, Empty, Pill, Row, Screen, Section, space, Stack, Stat, T, useColors } from '@/ui';

const dollars = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;

/** Book conversions and sources whose license never allows sharing an adaptation. */
const privateForGood = (p: CurriculumPackage) =>
  p.origin.kind === 'owned_book' || (p.origin.kind === 'open_web' && p.license.kind !== 'unknown' && !LICENSE_INFO[p.license.kind].adapt);

/** Studio home: the creator's curricula, sales, and the switch back to the family planner. */
export default function StudioHome() {
  const c = useColors();
  const profile = useStudio((s) => s.profile);
  const packages = useStudio((s) => s.packages);
  const family = useStore((s) => s.family);
  const userId = useAccount((s) => s.userId);
  const [stats, setStats] = useState<Record<string, ListingStats>>({});

  useEffect(() => {
    let alive = true;
    loadStudio()
      .catch(() => {})
      .then(() => creatorStats())
      .then((s) => alive && setStats(s));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!profile) return <Redirect href="/studio/setup" />;

  const published = packages.filter((p) => p.status === 'published');
  const privateOnes = packages.filter((p) => p.status !== 'published' && privateForGood(p));
  const drafts = packages.filter((p) => p.status !== 'published' && !privateForGood(p));
  const totals = Object.values(stats).reduce((a, s) => ({ sales: a.sales + s.sales, revenue: a.revenue + s.revenue }), { sales: 0, revenue: 0 });

  const toCompass = () => {
    useStudio.getState().setActive(false);
    router.replace(family ? '/today' : '/onboarding');
  };

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ headerRight: () => <Button size="sm" kind="ghost" title={family ? '🧭 Switch to Compass' : '🧭 Set up a family'} onPress={toCompass} /> }} />
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <Stack gap={2} style={{ flex: 1, minWidth: 220 }}>
          <T v="display">🎨 {profile.name}</T>
          <T muted>{profile.bio || 'Your Studio: make, convert, and publish curricula.'}</T>
        </Stack>
        <Button size="sm" kind="secondary" title="Edit profile" onPress={() => router.push('/studio/setup')} />
      </Row>

      <Row wrap gap={space.md} style={{ marginTop: space.lg }} align="stretch">
        <Stat label="Published" value={String(published.length)} />
        <Stat label="Drafts" value={String(drafts.length)} />
        {userId ? <Stat label="Families reached" value={String(totals.sales)} /> : null}
        {userId ? <Stat label="Sales" value={dollars(totals.revenue)} sub="before fees" /> : null}
      </Row>
      {!userId ? <T v="caption" muted style={{ marginTop: space.sm }}>Sign in (Settings → Account) to publish to everyone and see sales. Until then, publishing lists curricula on this device only.</T> : null}

      <Section title="Make a curriculum" subtitle="Start fresh, or bring in lessons you already have.">
        <Button size="lg" icon="＋" title="New curriculum" onPress={() => router.push('/studio/new')} />
      </Section>

      {packages.length === 0 ? (
        <Empty icon="📝" title="Nothing here yet" body="Write a curriculum from scratch, turn a free online course into a lesson plan, or import a spreadsheet of lessons." />
      ) : null}
      {published.length ? <PackageList title="Published" items={published} stats={stats} /> : null}
      {drafts.length ? <PackageList title="Drafts" items={drafts} stats={stats} /> : null}
      {privateOnes.length ? <PackageList title="Private (family use only)" subtitle="Conversions of books you own, or sources whose license doesn’t allow sharing." items={privateOnes} stats={stats} /> : null}
      <View style={{ height: space.xl }} />
      <Card tint={c.surfaceAlt}>
        <T v="heading">How licensing works</T>
        <T v="caption">Your own work: you choose the license and price. Adapted from a free online curriculum: it keeps the source’s license, credits the source, and must be free if the source is non-commercial. Converted from a book you own: private to your family.</T>
      </Card>
    </Screen>
  );
}

function PackageList({ title, subtitle, items, stats }: { title: string; subtitle?: string; items: CurriculumPackage[]; stats: Record<string, ListingStats> }) {
  const c = useColors();
  return (
    <Section title={title} subtitle={subtitle}>
      <Stack>
        {items.map((p) => {
          const s = p.listingId ? stats[p.listingId] : undefined;
          return (
            <Card key={p.id} onPress={() => router.push({ pathname: '/studio/[id]', params: { id: p.id } })}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <T v="heading" style={{ flex: 1 }}>{p.cover} {p.title || 'Untitled curriculum'}</T>
                {p.status === 'published' ? <Pill text={`v${p.version} · ${p.price ? money(p.price) : 'Free'}`} bg={c.successSoft} fg={c.text} /> : <Pill text="Draft" />}
              </Row>
              <T v="caption" muted>
                {ORIGIN_LABEL[p.origin.kind]} · {lessonTotal(p.units)} lessons · {p.license.kind === 'unknown' ? LICENSE_INFO.unknown.label : licenseName(p.license)} · edited {formatDate(p.updatedAt.slice(0, 10), { month: 'short', day: 'numeric' })}
              </T>
              {s ? <T v="caption">{s.sales} famil{s.sales === 1 ? 'y' : 'ies'} · {dollars(s.revenue)} · {s.ratingCount ? `★ ${s.ratingAvg.toFixed(1)} (${s.ratingCount})` : 'no reviews yet'}</T> : null}
            </Card>
          );
        })}
      </Stack>
    </Section>
  );
}
