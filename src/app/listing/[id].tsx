import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { CheckoutSheet } from '@/components/market/CheckoutSheet';
import { Cover, Stars } from '@/components/market/ListingCard';
import { MessageSellerButton } from '@/components/market/MessageSeller';
import { money, PriceTag, SaleNote } from '@/components/market/PriceTag';
import { ReportSheet } from '@/components/market/ReportSheet';
import { ReviewSheet } from '@/components/market/ReviewSheet';
import { EsaBadge, VerifiedBadge } from '@/components/market/SellerBadges';
import { stateList, storefrontId } from '@/lib/creators';
import { formatDate } from '@/lib/dates';
import {
  CONDITION_LABEL,
  gradeRangeLabel,
  INVOLVEMENT_LABEL,
  matchListing,
  PHILOSOPHY_SHORT,
  progressLabel,
  ratingSummary,
  SELLER_NOTE,
  sortReviews,
  type Listing,
  type Purchase,
  type ReviewSort,
} from '@/lib/market';
import { formatLabel, licenseHeading, splitCredit } from '@/lib/marketView';
import { SUBJECTS } from '@/lib/subjects';
import { bundleSummary } from '@/lib/pricing';
import { useBundles, useCatalog } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';
import { useAccount } from '@/store/useAccount';
import { LICENSE_INFO, licenseName, licenseUrl } from '@/lib/license';
import { checkout, recordCheckout } from '@/services/checkout';
import { cloudEnabled } from '@/services/cloud';
import { deleteReview, loadReviews, voteHelpful, type ReportTarget } from '@/services/marketApi';
import { Button, Card, Chip, ConfirmButton, Empty, Pill, Progress, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

const REVIEW_SORT: Record<ReviewSort, string> = { helpful: 'Most helpful', newest: 'Newest', progress: 'Most progress', high: 'Highest', low: 'Lowest' };
/** Sorting and star filters only help once there are a handful of reviews. */
const REVIEW_CONTROLS_MIN = 5;

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
  const signedIn = useAccount((s) => !!s.userId);
  const studioPkg = useStudio((s) => s.packages.find((p) => p.listingId === id));
  const [buying, setBuying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [gifting, setGifting] = useState(false);
  const bundles = useBundles();
  const owned = useStore((s) => s.purchases);
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
  const controls = summary.count >= REVIEW_CONTROLS_MIN;
  const shown = sortReviews(controls && starFilter ? reviews.filter((r) => r.rating === starFilter) : reviews, controls ? reviewSort : 'helpful');
  const mine = reviews.find((r) => r.mine);
  const match = matchListing(l, { family, kids });
  const inBundles = bundles.filter((b) => b.listingIds.includes(l.id));
  const ownedIds = new Set(owned.map((p) => p.listingId));
  const store = storefrontId(l);
  const wide = width >= 900;
  const usedFromFamily = l.sellerKind === 'family' && !l.mine;
  // Reports go to moderators: only possible with an account. The device-only build doesn't offer them.
  const canReport = !l.mine && !l.sample && cloudEnabled;

  // Free curricula: one tap claims it and goes straight to scheduling (no confirm sheet).
  const claimFree = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      const r = await checkout({ kind: 'listing', listing: l }, 'out_of_pocket');
      if (r.status === 'done') {
        recordCheckout(r);
        const p = r.purchases.find((x) => x.listingId === l.id) ?? r.purchases[0];
        if (p) setPlanning({ purchase: p, fresh: true });
      } else if (r.status === 'error' || r.status === 'pending') setClaimError(r.message);
    } finally {
      setClaiming(false);
    }
  };

  // Sticky on the web at desktop width, so "Buy" stays in reach on long listings.
  const sticky = wide && Platform.OS === 'web' ? ({ position: 'sticky', top: space.lg } as unknown as ViewStyle) : undefined;

  const buyBox = (
    <Card style={wide ? [{ width: 300 }, sticky] : undefined}>
      <PriceTag listing={l} size="display" />
      <SaleNote listing={l} />
      {l.format === 'online' && l.price > 0 ? <T v="caption" muted>per month, as listed by the seller</T> : null}
      {purchase ? (
        <>
          <Pill text={`✓ In your library${purchase.demo ? ' (demo purchase)' : ''}`} tone="success" />
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
              <T v="caption" color={c.accentInk}>🚩 Hidden by Freerange moderators after a report, so families can’t find or buy it. Families who already have it keep it. Questions or a counter-claim: support@freerangehomeschooling.com</T>
            </Card>
          ) : null}
          {studioPkg ? <Button kind="secondary" title="🎨 Edit in Studio" onPress={() => router.push({ pathname: '/studio/[id]', params: { id: studioPkg.id, tab: 'lessons' } })} /> : null}
        </>
      ) : !family ? (
        <T muted>Set up your family in Compass to get curricula and schedule their lessons.</T>
      ) : l.price === 0 && l.sellerKind !== 'family' ? (
        <>
          <Button size="lg" title="Get it free" loading={claiming} onPress={claimFree} accessibilityHint="Adds it to your library, then lets you schedule it" />
          <T v="caption" muted>One tap adds it to your library; then pick the days to schedule it.</T>
          {claimError ? <T v="caption" color={c.dangerInk} accessibilityLiveRegion="polite">{claimError}</T> : null}
        </>
      ) : (
        <Button size="lg" title={l.price === 0 ? 'Get it free' : 'Buy'} onPress={() => setBuying(true)} />
      )}
      {usedFromFamily && family ? <MessageSellerButton listing={l} /> : null}
      {usedFromFamily && purchase ? (
        <Card tint={c.primarySoft}>
          <T v="label" color={c.primaryInk}>Next: arrange pickup or shipping</T>
          <T v="caption" color={c.primaryInk}>Agree on a public place and time with the seller (or shipping) in Messages.</T>
          <MessageSellerButton listing={l} kind="primary" title="💬 Message the seller" />
        </Card>
      ) : null}
      {!l.mine && family && l.sellerKind !== 'family' ? <Button kind="secondary" title={l.price === 0 ? '🎁 Send to a friend' : '🎁 Give as a gift'} onPress={() => setGifting(true)} /> : null}
      {inBundles.map((b) => {
        const s = bundleSummary(b, listings, ownedIds);
        return s.items.length > 1 && s.owned.length < s.items.length ? (
          <Card key={b.id} tint={c.primarySoft} onPress={() => router.push({ pathname: '/bundle/[id]', params: { id: b.id } })} label={`Bundle: ${b.title}`}>
            <T v="label" color={c.primaryInk}>🎁 In the bundle “{b.title}”</T>
            <T v="caption" color={c.primaryInk}>
              {s.items.length} curricula for {money(s.price)}
              {s.save ? ` · save ${s.save}% on today’s prices` : ` · ${money(s.nowTotal)} separately today`}
            </T>
          </Card>
        ) : null;
      })}
      {l.sellerKind === 'family' && (l.pickupArea || l.ships) ? (
        <Stack gap={2}>
          {l.pickupArea ? <T v="caption">📍 Pickup around {l.pickupArea}</T> : null}
          {l.ships ? <T v="caption">📦 The seller can ship it</T> : null}
        </Stack>
      ) : null}
      <T v="caption" muted>
        {l.esaEligible ? `🏛️ Approved ESA vendor${l.esaStates?.length ? ` in ${stateList(l.esaStates)}` : ''}; reimbursement goes through your state program. ` : ''}
        {l.sellerKind === 'open'
          ? `A free curriculum by ${l.seller}, organized into a lesson plan by Freerange (not affiliated with or endorsed by its author or publisher).`
          : l.sellerKind === 'family'
            ? 'Sold by a family. Message them to check the condition and arrange pickup in a public place, or shipping.'
            : `Sold by ${l.seller}${l.sellerKind === 'creator' ? ', an independent creator' : ''}${l.sellerVerified ? ' (Freerange checked who they are)' : ''}.`}
        {l.packageId ? ' Comes with a lesson-by-lesson plan: each day shows that lesson’s steps, pages, and links.' : ''}
      </T>
    </Card>
  );

  const credit = l.attribution ? splitCredit(l.attribution) : undefined;
  const deed = l.license ? licenseUrl(l.license) : undefined;

  return (
    <Screen edges={[]}>
      {/* The page's own heading names the curriculum, so the bar keeps its short "Curriculum" title (MKT-28). */}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: space.lg, alignItems: wide ? 'flex-start' : 'stretch' }}>
        <Stack style={{ flex: 1 }} gap={space.md}>
          {l.photos?.length ? <Photos photos={l.photos} title={l.title} /> : null}
          <Row gap={space.lg} align="flex-start">
            <Cover listing={l} size={88} />
            <Stack gap={4} style={{ flex: 1 }}>
              <T v="title" role="heading">{l.title}</T>
              <T muted>
                {l.sellerKind === 'open' ? `by ${l.seller}` : l.seller}
                {SELLER_NOTE[l.sellerKind]}
              </T>
              {/* Other creators' storefronts need the live Marketplace: don't link to a dead end from the sample catalog. */}
              {store && (l.mine || source !== 'sample') ? (
                <Row>
                  <Button size="sm" kind="ghost" title={`🏪 More from ${l.seller} ›`} onPress={() => router.push({ pathname: '/creator/[id]', params: { id: store } })} />
                </Row>
              ) : null}
              {summary.count ? (
                <Row gap={6}>
                  <Stars value={summary.avg} size={18} />
                  <T v="label">{summary.avg.toFixed(1)} · {summary.count} review{summary.count === 1 ? '' : 's'}</T>
                </Row>
              ) : null}
              <Row wrap gap={6}>
                {l.sellerVerified ? <VerifiedBadge /> : null}
                {l.esaEligible ? <EsaBadge states={l.esaStates} homeState={family?.stateCode} /> : null}
                <Pill text={gradeRangeLabel(l.gradeMin, l.gradeMax)} />
                {l.subjects.map((s) => (
                  <Pill key={s} text={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} />
                ))}
                <Pill text={formatLabel(l)} />
                {l.condition ? <Pill text={`Used · ${CONDITION_LABEL[l.condition]}`} tone="accent" /> : null}
                {l.sample ? <Pill text="Sample listing" /> : null}
              </Row>
            </Stack>
          </Row>

          {!wide ? buyBox : null}

          {match.reasons.length ? (
            <Card tint={c.primarySoft}>
              <T v="label" color={c.primaryInk}>✨ Why it fits your family</T>
              {match.reasons.map((r) => (
                <T key={r} color={c.primaryInk}>• {r}</T>
              ))}
            </Card>
          ) : null}

          <T>{l.description}</T>

          {l.paceUnknown ? (
            <Card tint={c.surfaceAlt}>
              <T v="caption">📏 The seller didn’t add lesson details. You’ll choose the number of lessons and the pace when you add it to your plan.</T>
            </Card>
          ) : (
            <Row wrap gap={space.md}>
              <Fact label="Lessons" value={String(l.lessons)} />
              <Fact label="Suggested pace" value={`${l.lessonsPerWeek}/week`} />
              <Fact label="Per lesson" value={`~${l.minutesPerLesson} min`} />
              <Fact label="Parent time" value={INVOLVEMENT_LABEL[l.parentInvolvement]} />
              <Fact label="Finishes in" value={`~${Math.ceil(l.lessons / l.lessonsPerWeek)} weeks`} />
            </Row>
          )}
          {l.familyStyle ? <T v="caption" color={c.groupInk}>👨‍👩‍👧 Family-style: siblings can do it together in one block.</T> : null}
          {l.philosophies.length ? <T v="caption" muted>Teaching style: {l.philosophies.map((p) => PHILOSOPHY_SHORT[p]).join(', ')}</T> : null}

          {l.outline?.length ? <Outline outline={l.outline} /> : null}

          {l.license || credit ? (
            <Card tint={c.surfaceAlt}>
              <T v="label">📜 {l.license ? (l.license.kind === 'all_rights_reserved' ? '© All rights reserved' : licenseHeading(licenseName(l.license), LICENSE_INFO[l.license.kind].label)) : 'Credit'}</T>
              {credit ? <T v="caption">{credit.text}</T> : null}
              {l.license && LICENSE_INFO[l.license.kind].adapt ? <T v="caption" muted>You may adapt and share it{LICENSE_INFO[l.license.kind].attribution ? ' with credit' : ''}{LICENSE_INFO[l.license.kind].shareAlike ? ', under the same license' : ''}{LICENSE_INFO[l.license.kind].commercial ? '' : ', non-commercially'}.</T> : null}
              <Row wrap gap={space.md}>
                {credit?.url ? <ExternalLink href={credit.url} label={credit.linkLabel ?? 'See the original'} /> : null}
                {credit?.more?.map((u, i) => <ExternalLink key={u} href={u} label={`Source ${i + 2}`} />)}
                {deed ? <ExternalLink href={deed} label="License terms" /> : null}
              </Row>
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
                  <ConfirmButton title="Delete" question="Delete your review?" confirm="Delete" onConfirm={() => deleteReview(mine.id)} />
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
            {controls ? (
              <Stack gap={space.sm}>
                <View role="radiogroup" aria-label="Sort reviews" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {(Object.keys(REVIEW_SORT) as ReviewSort[]).map((k) => (
                    <Chip key={k} role="radio" label={REVIEW_SORT[k]} selected={reviewSort === k} onPress={() => setReviewSort(k)} />
                  ))}
                </View>
                <View role="radiogroup" aria-label="Filter by stars" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip role="radio" label="All stars" selected={starFilter === null} onPress={() => setStarFilter(null)} />
                  {[5, 4, 3, 2, 1].map((n) => (
                    <Chip key={n} role="radio" label={`${n}★ (${summary.histogram[n as 1]})`} selected={starFilter === n} onPress={() => setStarFilter(n)} />
                  ))}
                </View>
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
                  {r.progress ? (
                    <T v="caption" color={r.progress.done >= r.progress.total ? c.primaryInk : undefined} style={{ fontWeight: '600' }}>
                      {r.progress.done >= r.progress.total ? '🏁' : '📖'} {progressLabel(r.progress)}
                    </T>
                  ) : null}
                  <T>{r.body}</T>
                  {r.mine && r.hidden ? <T v="caption" color={c.accentInk}>🚩 Hidden by moderators. Other families don’t see this review.</T> : null}
                  {!r.mine ? (
                    <Row>
                      <Button size="sm" kind="ghost" title={`👍 Helpful${r.helpful ? ` (${r.helpful})` : ''}${votes.includes(r.id) ? ' ✓' : ''}`} onPress={() => voteHelpful(r.id)} />
                      {!r.sample && cloudEnabled ? <Button size="sm" kind="ghost" title="Report" accessibilityLabel={`Report ${r.author}’s review`} onPress={() => (signedIn ? setReporting({ kind: 'review', id: r.id, name: `${r.author}’s review` }) : router.push('/account'))} /> : null}
                    </Row>
                  ) : null}
                </Card>
              ))}
            </Stack>
          </Section>

          {/* Away from the buy box, so it's never mistaken for a purchase action. */}
          {canReport ? (
            <Row style={{ marginTop: space.lg }}>
              {signedIn ? (
                <Button size="sm" kind="ghost" title="🚩 Report this listing" onPress={() => setReporting({ kind: 'listing', id: l.id, name: l.title })} />
              ) : (
                <Button size="sm" kind="ghost" title="🚩 Sign in to report this listing" onPress={() => router.push('/account')} />
              )}
            </Row>
          ) : null}
        </Stack>
        {wide ? buyBox : null}
      </View>

      <ReportSheet target={reporting ?? undefined} name={reporting?.name} onClose={() => setReporting(null)} />
      <CheckoutSheet
        item={{ kind: 'listing', listing: l }}
        visible={buying}
        onClose={() => setBuying(false)}
        onPurchased={(ps) => {
          setBuying(false);
          const p = ps.find((x) => x.listingId === l.id) ?? ps[0];
          if (p) setPlanning({ purchase: p, fresh: true });
        }}
      />
      <CheckoutSheet item={{ kind: 'listing', listing: l }} asGift visible={gifting} onClose={() => setGifting(false)} />
      {planning ? <AddToPlanSheet listing={l} purchaseId={planning.purchase.id} intro={planning.fresh ? '🎉 It’s in your library! Want to schedule it now?' : undefined} visible onClose={() => setPlanning(null)} /> : null}
      <ReviewSheet listing={l} existing={mine} visible={reviewing} onClose={() => setReviewing(false)} />
    </Screen>
  );
}

/** A link that leaves the app (a real link on the web, so it can open in a new tab). */
function ExternalLink({ href, label }: { href: string; label: string }) {
  const c = useColors();
  return (
    <Link href={href as `https://${string}`} target="_blank" rel="noopener noreferrer" accessibilityRole="link" style={{ color: c.primaryInk, fontWeight: '700', fontSize: 13, paddingVertical: 12 }}>
      {label} ↗
    </Link>
  );
}

/** A family seller's photos, one screen wide each, swiped sideways. */
function Photos({ photos, title }: { photos: NonNullable<Listing['photos']>; title: string }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [at, setAt] = useState(0);
  const w = Math.min(width - space.lg * 2, 560);
  return (
    <View style={{ gap: 6 }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={photos.length > 1}
        onScroll={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / w))}
        scrollEventThrottle={64}
        style={{ width: w, borderRadius: 16 }}
        accessibilityLabel={`Photos of ${title}`}>
        {photos.map((uri, i) => (
          <Image key={`${i}-${uri.slice(-16)}`} source={{ uri }} resizeMode="cover" accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} style={{ width: w, height: Math.round(w * 0.66), backgroundColor: c.surfaceAlt }} />
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <T v="caption" muted style={{ textAlign: 'center' }}>
          {Math.min(at, photos.length - 1) + 1} / {photos.length} · swipe for more
        </T>
      ) : null}
    </View>
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
function Outline({ outline }: { outline: NonNullable<Listing['outline']> }) {
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
