import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { CheckoutSheet } from '@/components/market/CheckoutSheet';
import { Cover, money, Stars } from '@/components/market/ListingCard';
import { ReportSheet } from '@/components/market/ReportSheet';
import { ReviewSheet } from '@/components/market/ReviewSheet';
import { formatDate } from '@/lib/dates';
import {
  CONDITION_LABEL,
  FORMAT_LABEL,
  gradeRangeLabel,
  INVOLVEMENT_LABEL,
  matchListing,
  PHILOSOPHY_SHORT,
  ratingSummary,
  SELLER_NOTE,
  sortReviews,
  type Purchase,
  type ReviewSort,
} from '@/lib/market';
import { SUBJECTS } from '@/lib/subjects';
import { useCatalog } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';
import { LICENSE_INFO, licenseName } from '@/lib/license';
import { deleteReview, loadReviews, voteHelpful, type ReportTarget } from '@/services/marketApi';
import { Button, Card, Chip, Empty, Pill, Progress, Row, Screen, Section, space, Stack, T, useColors, useConfirm } from '@/ui';

const REVIEW_SORT: Record<ReviewSort, string> = { helpful: 'Most helpful', newest: 'Newest', high: 'Highest', low: 'Lowest' };

export default function ListingDetail() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { listings, reviews: allReviews, source } = useCatalog();
  const family = useStore((s) => s.family);
  const kids = useStore((s) => s.children);
  const purchase = useStore((s) => s.purchases.find((p) => p.listingId === id));
  const inPlan = useStore((s) => !!purchase?.curriculumId && s.curricula.some((k) => k.id === purchase.curriculumId));
  const votes = useStore((s) => s.helpfulVotes);
  const studioPkg = useStudio((s) => s.packages.find((p) => p.listingId === id));
  const confirm = useConfirm();
  const [buying, setBuying] = useState(false);
  const [planning, setPlanning] = useState<{ purchase: Purchase; fresh: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewSort, setReviewSort] = useState<ReviewSort>('helpful');
  const [reporting, setReporting] = useState<(ReportTarget & { name: string }) | null>(null);
  const [starFilter, setStarFilter] = useState<number | null>(null);

  // Reload when the live catalog arrives (it replaces the sample one after launch).
  useEffect(() => {
    if (id) loadReviews(id);
  }, [id, source]);

  const l = listings.find((x) => x.id === id);
  if (!l) {
    return (
      <Screen edges={[]}>
        <Empty icon="🔎" title="That listing isn't available" body="It may have been removed by the seller." action={<Button title="Back to the marketplace" onPress={() => router.replace('/market')} />} />
      </Screen>
    );
  }

  const reviews = allReviews.filter((r) => r.listingId === l.id);
  const summary = ratingSummary(reviews);
  const shown = sortReviews(starFilter ? reviews.filter((r) => r.rating === starFilter) : reviews, reviewSort);
  const mine = reviews.find((r) => r.mine);
  const match = matchListing(l, { family, kids });
  const wide = width >= 900;

  const buyBox = (
    <Card style={wide ? { width: 300 } : undefined}>
      <T v="display" color={c.primary}>{money(l.price)}</T>
      {l.format === 'online' && l.price > 0 ? <T v="caption" muted>per month, as listed by the seller</T> : null}
      {purchase ? (
        <>
          <Pill text={`✓ In your library${purchase.demo ? ' (demo purchase)' : ''}`} bg={c.successSoft} fg={c.success} />
          {inPlan ? (
            <Button kind="secondary" title="✓ In your plan · see pacing" onPress={() => router.push('/learn')} />
          ) : (
            <Button title="Add to plan" onPress={() => setPlanning({ purchase, fresh: false })} />
          )}
        </>
      ) : l.mine ? (
        <>
          <T muted>This is your listing.</T>
          {l.suspended ? (
            <Card tint={c.accentSoft}>
              <T v="caption">🚩 Hidden by Freerange moderators after a report, so families can’t find or buy it. Families who already have it keep it. Questions or a counter-claim: support@freerangehomeschooling.com</T>
            </Card>
          ) : null}
          {studioPkg ? <Button kind="secondary" title="🎨 Edit in Studio" onPress={() => router.push({ pathname: '/studio/[id]', params: { id: studioPkg.id, tab: 'lessons' } })} /> : null}
        </>
      ) : !family ? (
        <T muted>Set up your family in Compass to get curricula and schedule their lessons.</T>
      ) : (
        <Button size="lg" title={l.price === 0 ? 'Get it free' : 'Buy'} onPress={() => setBuying(true)} />
      )}
      <T v="caption" muted>
        {l.esaEligible ? '🏛️ Approved ESA vendor. ' : ''}
        {l.sellerKind === 'open' ? `A free curriculum by ${l.seller}, organized into a lesson plan by Freerange (not affiliated with or endorsed by its author or publisher).` : l.sellerKind === 'family' ? 'Sold by a family: arrange pickup in a public place or shipping.' : `Sold by ${l.seller}${l.sellerVerified ? ' (verified publisher)' : l.sellerKind === 'creator' ? ', an independent creator' : ''}.`}
        {l.packageId ? ' Comes with a lesson-by-lesson plan: each day shows that lesson’s steps, pages, and links.' : ''}
      </T>
      {!l.mine && !l.sample ? (
        <Row>
          <Button size="sm" kind="ghost" title="🚩 Report this listing" onPress={() => setReporting({ kind: 'listing', id: l.id, name: l.title })} />
        </Row>
      ) : null}
    </Card>
  );

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: l.title }} />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.lg, alignItems: wide ? 'flex-start' : 'stretch' }}>
        <Stack style={{ flex: 1 }} gap={space.md}>
          <Row gap={space.lg} align="flex-start">
            <Cover listing={l} size={88} />
            <Stack gap={4} style={{ flex: 1 }}>
              <T v="title">{l.title}</T>
              <T muted>
                {l.sellerKind === 'open' ? `by ${l.seller}` : l.seller}
                {l.sellerVerified ? ' ✓ verified' : ''}
                {SELLER_NOTE[l.sellerKind]}
              </T>
              <Row gap={6}>
                {summary.count ? (
                  <>
                    <Stars value={summary.avg} size={18} />
                    <T v="label">{summary.avg.toFixed(1)} · {summary.count} review{summary.count === 1 ? '' : 's'}</T>
                  </>
                ) : (
                  <T v="caption" muted>No reviews yet</T>
                )}
              </Row>
              <Row wrap gap={6}>
                <Pill text={gradeRangeLabel(l.gradeMin, l.gradeMax)} />
                {l.subjects.map((s) => (
                  <Pill key={s} text={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} />
                ))}
                <Pill text={FORMAT_LABEL[l.format]} />
                {l.condition ? <Pill text={`Used · ${CONDITION_LABEL[l.condition]}`} bg={c.accentSoft} /> : null}
                {l.sample ? <Pill text="Sample listing" /> : null}
              </Row>
            </Stack>
          </Row>

          {!wide ? buyBox : null}

          {match.reasons.length ? (
            <Card tint={c.primarySoft}>
              <T v="label">✨ Why it fits your family</T>
              {match.reasons.map((r) => (
                <T key={r}>• {r}</T>
              ))}
            </Card>
          ) : null}

          <T>{l.description}</T>

          <Row wrap gap={space.md}>
            <Fact label="Lessons" value={String(l.lessons)} />
            <Fact label="Suggested pace" value={`${l.lessonsPerWeek}/week`} />
            <Fact label="Per lesson" value={`~${l.minutesPerLesson} min`} />
            <Fact label="Parent time" value={INVOLVEMENT_LABEL[l.parentInvolvement]} />
            <Fact label="Finishes in" value={`~${Math.ceil(l.lessons / l.lessonsPerWeek)} weeks`} />
          </Row>
          {l.familyStyle ? <T v="caption" color={c.group}>👨‍👩‍👧 Family-style: siblings can do it together in one block.</T> : null}
          {l.philosophies.length ? <T v="caption" muted>Teaching style: {l.philosophies.map((p) => PHILOSOPHY_SHORT[p]).join(', ')}</T> : null}

          {l.outline?.length ? <Outline outline={l.outline} /> : null}

          {l.license || l.attribution ? (
            <Card tint={c.surfaceAlt}>
              <T v="label">📜 License: {l.license ? (l.license.kind === 'all_rights_reserved' ? '© All rights reserved' : `${licenseName(l.license)} — ${LICENSE_INFO[l.license.kind].label}`) : 'see credit'}</T>
              {l.attribution ? <T v="caption">{l.attribution}</T> : null}
              {l.license && LICENSE_INFO[l.license.kind].adapt ? <T v="caption" muted>You may adapt and share it{LICENSE_INFO[l.license.kind].attribution ? ' with credit' : ''}{LICENSE_INFO[l.license.kind].shareAlike ? ', under the same license' : ''}{LICENSE_INFO[l.license.kind].commercial ? '' : ', non-commercially'}.</T> : null}
            </Card>
          ) : null}

          {l.includes.length ? (
            <Section title="What's included">
              {l.includes.map((i) => (
                <T key={i}>• {i}</T>
              ))}
            </Section>
          ) : null}

          <Section
            title="Reviews"
            action={
              mine ? (
                <Row gap={4}>
                  <Button size="sm" kind="secondary" title="Edit yours" onPress={() => setReviewing(true)} />
                  <Button size="sm" kind="ghost" title="Delete" onPress={() => confirm.ask('Delete your review?', () => deleteReview(mine.id), { confirm: 'Delete' })} />
                </Row>
              ) : !l.mine ? (
                <Button size="sm" title="Write a review" onPress={() => setReviewing(true)} />
              ) : undefined
            }>
            {summary.count ? (
              <Card>
                <Row gap={space.xl} wrap align="center">
                  <Stack gap={2} style={{ alignItems: 'center', minWidth: 110 }}>
                    <T v="display">{summary.avg.toFixed(1)}</T>
                    <Stars value={summary.avg} size={18} />
                    <T v="caption" muted>{summary.count} review{summary.count === 1 ? '' : 's'}</T>
                  </Stack>
                  <Stack gap={4} style={{ flex: 1, minWidth: 200 }}>
                    {([5, 4, 3, 2, 1] as const).map((n) => (
                      <Row key={n} gap={8}>
                        <T v="caption" style={{ width: 22 }}>{n}★</T>
                        <View style={{ flex: 1 }}>
                          <Progress value={summary.count ? summary.histogram[n] / summary.count : 0} color={c.accent} />
                        </View>
                        <T v="caption" muted style={{ width: 24, textAlign: 'right' }}>{summary.histogram[n]}</T>
                      </Row>
                    ))}
                  </Stack>
                </Row>
              </Card>
            ) : (
              <Empty icon="💬" title="No reviews yet" body={purchase ? 'You own this — be the first to share how it went.' : 'Be the first to review it after you try it.'} />
            )}
            {summary.count ? (
              <Stack gap={space.sm}>
                <Row wrap gap={6}>
                  {(Object.keys(REVIEW_SORT) as ReviewSort[]).map((k) => (
                    <Chip key={k} label={REVIEW_SORT[k]} selected={reviewSort === k} onPress={() => setReviewSort(k)} />
                  ))}
                </Row>
                <Row wrap gap={6}>
                  <Chip label="All stars" selected={starFilter === null} onPress={() => setStarFilter(null)} />
                  {[5, 4, 3, 2, 1].map((n) => (
                    <Chip key={n} label={`${n}★ (${summary.histogram[n as 1]})`} selected={starFilter === n} onPress={() => setStarFilter(n)} />
                  ))}
                </Row>
              </Stack>
            ) : null}
            <Stack gap={space.sm}>
              {shown.map((r) => (
                <Card key={r.id} tint={r.mine ? c.primarySoft : undefined}>
                  <Row gap={8} wrap>
                    <Stars value={r.rating} />
                    <T v="heading" style={{ flex: 1 }}>{r.title}</T>
                  </Row>
                  <T v="caption" muted>
                    {r.mine ? 'You' : r.author}
                    {r.childGrade ? ` · used with ${r.childGrade}` : ''} · {formatDate(r.createdAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}
                    {r.verified ? ' · ✓ Verified purchase' : ''}
                  </T>
                  <T>{r.body}</T>
                  {r.mine && r.hidden ? <T v="caption" color={c.accent}>🚩 Hidden by moderators. Other families don’t see this review.</T> : null}
                  {!r.mine ? (
                    <Row>
                      <Button size="sm" kind="ghost" title={`👍 Helpful${r.helpful ? ` (${r.helpful})` : ''}${votes.includes(r.id) ? ' ✓' : ''}`} onPress={() => voteHelpful(r.id)} />
                      {!r.sample ? <Button size="sm" kind="ghost" title="Report" onPress={() => setReporting({ kind: 'review', id: r.id, name: `${r.author}’s review` })} /> : null}
                    </Row>
                  ) : null}
                </Card>
              ))}
            </Stack>
          </Section>
        </Stack>
        {wide ? buyBox : null}
      </View>

      <ReportSheet target={reporting ?? undefined} name={reporting?.name} onClose={() => setReporting(null)} />
      <CheckoutSheet
        listing={l}
        visible={buying}
        onClose={() => setBuying(false)}
        onPurchased={(p) => {
          setBuying(false);
          setPlanning({ purchase: p, fresh: true });
        }}
      />
      {planning ? <AddToPlanSheet listing={l} purchaseId={planning.purchase.id} intro={planning.fresh ? '🎉 It’s in your library! Want to schedule it now?' : undefined} visible onClose={() => setPlanning(null)} /> : null}
      <ReviewSheet listing={l} existing={mine} visible={reviewing} onClose={() => setReviewing(false)} />
      {confirm.element}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: c.surface }}>
      <T v="caption" muted>{label}</T>
      <T v="label">{value}</T>
    </View>
  );
}

/** Unit and lesson titles — what's inside before buying. */
function Outline({ outline }: { outline: NonNullable<import('@/lib/market').Listing['outline']> }) {
  const [open, setOpen] = useState(false);
  const total = outline.reduce((a, u) => a + u.lessons.length, 0);
  const shown = open ? outline : outline.slice(0, 2);
  const offsets = shown.map((_, i) => shown.slice(0, i).reduce((a, u) => a + u.lessons.length, 0));
  return (
    <Section title="What's inside" subtitle={`${total} lessons in ${outline.length} unit${outline.length === 1 ? '' : 's'} · each one schedules into your day`}>
      {shown.map((u, i) => (
        <View key={`${u.title}-${i}`} style={{ gap: 2 }}>
          <T v="label">{u.title}</T>
          {u.lessons.map((t, j) => (
            <T key={`${j}-${t}`} v="caption">
              {offsets[i] + j + 1}. {t}
            </T>
          ))}
        </View>
      ))}
      {outline.length > 2 ? <Button size="sm" kind="ghost" title={open ? 'Show less' : `Show all ${outline.length} units`} onPress={() => setOpen(!open)} /> : null}
    </Section>
  );
}
