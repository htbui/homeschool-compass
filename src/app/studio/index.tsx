import { Redirect, router, Stack as RouterStack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { money } from '@/components/market/ListingCard';
import { formatDate } from '@/lib/dates';
import { LICENSE_INFO, licenseName } from '@/lib/license';
import { lessonTotal, ORIGIN_LABEL, type CurriculumPackage } from '@/lib/package';
import { EsaBadge, VerifiedBadge } from '@/components/market/SellerBadges';
import { LOCAL_CREATOR_ID, stateList, type ApplicationStatus, type BadgeApplication } from '@/lib/creators';
import { followerCount, myBadges, type MyBadges } from '@/services/creatorApi';
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
  const [followers, setFollowers] = useState<number>();
  const [badges, setBadges] = useState<MyBadges>();

  useEffect(() => {
    let alive = true;
    loadStudio()
      .catch(() => {})
      .then(() => Promise.all([creatorStats(), followerCount(), myBadges().catch(() => undefined)]))
      .then(([s, f, b]) => {
        if (!alive) return;
        setStats(s);
        setFollowers(f);
        setBadges(b);
      });
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
        <Row gap={6} wrap>
          <Button size="sm" kind="ghost" title="🏪 My storefront" onPress={() => router.push({ pathname: '/creator/[id]', params: { id: userId ?? LOCAL_CREATOR_ID } })} />
          <Button size="sm" kind="secondary" title="Edit profile" onPress={() => router.push('/studio/setup')} />
        </Row>
      </Row>
      {profile.verified || profile.esaStates?.length ? (
        <Row wrap gap={6} style={{ marginTop: space.sm }}>
          {profile.verified ? <VerifiedBadge /> : null}
          {profile.esaStates?.length ? <EsaBadge states={profile.esaStates} /> : null}
        </Row>
      ) : null}

      <Row wrap gap={space.md} style={{ marginTop: space.lg }} align="stretch">
        <Stat label="Published" value={String(published.length)} />
        <Stat label="Drafts" value={String(drafts.length)} />
        {userId ? <Stat label="Families reached" value={String(totals.sales)} /> : null}
        {userId ? <Stat label="Sales" value={dollars(totals.revenue)} sub="before fees" /> : null}
        {followers !== undefined ? <Stat label="Followers" value={String(followers)} sub="families following your shop" /> : null}
      </Row>
      {!userId ? <T v="caption" muted style={{ marginTop: space.sm }}>Sign in (Settings → Account) to publish to everyone and see sales. Until then, publishing lists curricula on this device only.</T> : null}

      <Section title="Make a curriculum" subtitle="Start fresh, or bring in lessons you already have.">
        <Button size="lg" icon="＋" title="New curriculum" onPress={() => router.push('/studio/new')} />
      </Section>

      <Section title="Teach and sell">
        <Row wrap gap={space.md} align="stretch">
          <Card onPress={() => router.push('/studio/classes')} style={{ flex: 1, minWidth: 240 }}>
            <T v="heading">👩‍🏫 Co-op classes</T>
            <T v="caption" muted>Share a plan with 5–30 families. Each family goes at its own pace, and you see how far everyone has got.</T>
          </Card>
          <Card onPress={() => router.push('/studio/promotions')} style={{ flex: 1, minWidth: 240 }}>
            <T v="heading">🏷️ Sales, bundles & coupons</T>
            <T v="caption" muted>Put a curriculum on sale, sell several together for less, or make coupon codes.</T>
          </Card>
        </Row>
      </Section>

      {packages.length === 0 ? (
        <Empty icon="📝" title="Nothing here yet" body="Write a curriculum from scratch, turn a free online course into a lesson plan, or import a spreadsheet of lessons." />
      ) : null}
      {published.length ? <PackageList title="Published" items={published} stats={stats} /> : null}
      {drafts.length ? <PackageList title="Drafts" items={drafts} stats={stats} /> : null}
      {privateOnes.length ? <PackageList title="Private (family use only)" subtitle="Conversions of books you own, or sources whose license doesn’t allow sharing." items={privateOnes} stats={stats} /> : null}
      <Section title="Badges" subtitle="Freerange checks each application; badges show on your storefront and every listing.">
        <Row wrap gap={space.md} align="stretch">
          <BadgeCard
            title="✓ Verified creator"
            body="Show families that Freerange checked who made your curricula."
            on={!!profile.verified}
            onText="You’re verified."
            app={badges?.latest.verified}
            onPress={() => router.push({ pathname: '/studio/badge', params: { kind: 'verified' } })}
          />
          <BadgeCard
            title="🏛️ ESA vendor"
            body="Already approved by a state ESA program? Show families which states."
            on={!!profile.esaStates?.length}
            onText={profile.esaStates?.length ? `Listed in ${stateList(profile.esaStates)}.` : ''}
            app={badges?.latest.esa}
            onPress={() => router.push({ pathname: '/studio/badge', params: { kind: 'esa' } })}
          />
        </Row>
      </Section>
      <View style={{ height: space.xl }} />
      <Card tint={c.surfaceAlt}>
        <T v="heading">How licensing works</T>
        <T v="caption">Your own work: you choose the license and price. Adapted from a free online curriculum: it keeps the source’s license, credits the source, and must be free if the source is non-commercial. Converted from a book you own: private to your family.</T>
      </Card>
    </Screen>
  );
}

const APP_STATUS: Partial<Record<ApplicationStatus, string>> = { pending: '⏳ Waiting for review', declined: 'Not approved yet: see the note', revoked: 'Removed by Freerange: see the note' };

function BadgeCard({ title, body, on, onText, app, onPress }: { title: string; body: string; on: boolean; onText: string; app?: BadgeApplication; onPress: () => void }) {
  const c = useColors();
  const status = app && app.status !== 'approved' ? APP_STATUS[app.status] : undefined;
  return (
    <Card onPress={onPress} tint={on ? c.successSoft : undefined} style={{ flex: 1, minWidth: 240 }}>
      <T v="heading">{title}</T>
      <T v="caption" muted>{on ? onText : body}</T>
      <T v="label" color={c.primary}>{status ?? (on ? 'Details ›' : 'Apply ›')}</T>
    </Card>
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
              {s?.status === 'suspended' ? <T v="caption" color={c.accent}>🚩 Hidden by Freerange moderators after a report. Families who have it keep it. Questions: support@freerangehomeschooling.com</T> : null}
              {s ? <T v="caption">{s.sales} famil{s.sales === 1 ? 'y' : 'ies'} · {dollars(s.revenue)} · {s.ratingCount ? `★ ${s.ratingAvg.toFixed(1)} (${s.ratingCount})` : 'no reviews yet'}</T> : null}
            </Card>
          );
        })}
      </Stack>
    </Section>
  );
}
