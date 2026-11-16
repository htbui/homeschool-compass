import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { formatGiftCode, normalizeGiftCode } from '@/lib/gifts';
import { cloudEnabled } from '@/services/cloud';
import { claimGift, previewGift, type GiftPreview } from '@/services/giftApi';
import { useAccount } from '@/store/useAccount';
import { useCatalog } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { Cover } from '@/components/market/ListingCard';
import { gradeRangeLabel, type Listing, type Purchase } from '@/lib/market';
import { formatLabel } from '@/lib/marketView';
import { SUBJECTS } from '@/lib/subjects';
import { Button, Card, Empty, Pill, Row, Screen, space, Stack, T, useColors } from '@/ui';

/** A gift link: see what it is and claim it into this family's library. */
export default function GiftLink() {
  const c = useColors();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = normalizeGiftCode(raw ?? '');
  const family = useStore((s) => s.family);
  const purchases = useStore((s) => s.purchases);
  const curricula = useStore((s) => s.curricula);
  const userId = useAccount((s) => s.userId);
  const { listings } = useCatalog();
  const [gift, setGift] = useState<GiftPreview | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<Purchase | null>(null);
  const [planning, setPlanning] = useState(false);
  const needsAccount = cloudEnabled && !userId;

  useEffect(() => {
    if (needsAccount) return;
    previewGift(code)
      .then((g) => setGift(g ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [code, needsAccount]);

  const claim = async () => {
    setBusy(true);
    setError('');
    try {
      setClaimed(await claimGift(code));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const listing = listings.find((l) => l.id === (claimed?.listingId ?? gift?.listingId));
  const mine = purchases.find((p) => p.listingId === (claimed?.listingId ?? gift?.listingId));
  // This family already has it (they claimed it earlier, on this or another device).
  const ownedHere = !!mine;
  const inPlan = !!mine?.curriculumId && curricula.some((k) => k.id === mine.curriculumId);

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: 'A gift for you' }} />
      {needsAccount ? (
        <Empty icon="🎁" title="Someone sent you a curriculum" body="Sign in or create a free account to claim it into your family's library." action={<Button title="Sign in" onPress={() => router.push('/account')} />} />
      ) : gift === undefined && !error ? (
        <T muted>Opening your gift…</T>
      ) : gift === null ? (
        <Empty
          icon="🔎"
          title="That gift code isn't valid"
          body={`Check the code (${formatGiftCode(code)}) with the person who sent it, or type it under Marketplace → My library → Gifts.`}
          action={
            <Row wrap style={{ justifyContent: 'center' }}>
              {family ? <Button title="Go to my library" onPress={() => router.replace({ pathname: '/market', params: { view: 'library' } })} /> : null}
              <Button kind="secondary" title="Browse free curricula" onPress={() => router.replace('/market')} />
            </Row>
          }
        />
      ) : gift ? (
        <Stack gap={space.lg}>
          <Card tint={c.successSoft}>
            <T v="title" color={c.successInk}>🎁 A gift from {gift.giverName}</T>
            {gift.note ? <T color={c.successInk}>“{gift.note}”</T> : null}
          </Card>
          <GiftDetails title={gift.title} seller={gift.seller} listing={listing} />
          {claimed || (gift.status === 'claimed' && ownedHere) ? (
            <Stack>
              <T v="heading" accessibilityLiveRegion="polite">🎉 It’s in your library.</T>
              {inPlan ? (
                <Button title="✓ In your plan · see pacing" kind="secondary" onPress={() => router.push('/learn')} />
              ) : (
                <Button title="Add it to your plan" disabled={!listing} reason="Open it from Marketplace → My library" onPress={() => setPlanning(true)} />
              )}
              <Button kind="secondary" title="Go to my library" onPress={() => router.replace({ pathname: '/market', params: { view: 'library' } })} />
            </Stack>
          ) : gift.status !== 'ready' ? (
            <Stack>
              <T muted>{gift.status === 'claimed' ? 'This gift has already been claimed by another family.' : 'This gift isn’t available any more. Ask the person who sent it.'}</T>
              {/* Gift links are often the first thing a family opens: never leave them on a dead end. */}
              <Row wrap>
                {family ? <Button title="Go to my library" onPress={() => router.replace({ pathname: '/market', params: { view: 'library' } })} /> : null}
                <Button kind="secondary" title="Browse free curricula" onPress={() => router.replace('/market')} />
              </Row>
            </Stack>
          ) : !family ? (
            <Stack>
              <T muted>Set up your family first, then open this link again to claim it.</T>
              <Button title="Set up my family" onPress={() => router.push('/onboarding')} />
            </Stack>
          ) : (
            <Button size="lg" title="Claim my gift" loading={busy} onPress={claim} />
          )}
        </Stack>
      ) : null}
      {error ? <T color={c.danger}>{error}</T> : null}
      {planning && listing && (claimed ?? mine) ? <AddToPlanSheet listing={listing} purchaseId={(claimed ?? mine)!.id} visible onClose={() => setPlanning(false)} /> : null}
    </Screen>
  );
}

/** What the gift is: the listing's cover, grades, subjects, and a peek inside, so a new family knows what they're claiming. */
function GiftDetails({ title, seller, listing }: { title: string; seller: string; listing?: Listing }) {
  const units = listing?.outline ?? [];
  const lessons = units.reduce((n, u) => n + u.lessons.length, 0) || listing?.lessons;
  return (
    <Card>
      <Row gap={space.md} align="flex-start">
        {listing ? <Cover listing={listing} size={64} /> : null}
        <Stack gap={4} style={{ flex: 1 }}>
          <T v="heading">{title}</T>
          <T v="caption" muted>{listing?.sellerKind === 'open' ? `by ${seller}` : seller}</T>
          {listing ? (
            <Row wrap gap={6}>
              <Pill text={gradeRangeLabel(listing.gradeMin, listing.gradeMax)} />
              {listing.subjects.slice(0, 3).map((s) => (
                <Pill key={s} text={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} />
              ))}
              <Pill text={formatLabel(listing)} />
              {lessons && !listing.paceUnknown ? <Pill text={`${lessons} lessons`} /> : null}
            </Row>
          ) : null}
        </Stack>
      </Row>
      {listing?.description ? <T numberOfLines={4}>{listing.description}</T> : null}
      {units.length ? (
        <Stack gap={2}>
          <T v="label">What’s inside</T>
          {units.slice(0, 3).map((u, i) => (
            <T key={`${i}-${u.title}`} v="caption">• {u.title} ({u.lessons.length} lessons)</T>
          ))}
          {units.length > 3 ? <T v="caption" muted>…and {units.length - 3} more unit{units.length - 3 === 1 ? '' : 's'}</T> : null}
        </Stack>
      ) : null}
      {listing ? (
        <Row>
          <Button size="sm" kind="ghost" title="See the full listing ›" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: listing.id } })} />
        </Row>
      ) : null}
    </Card>
  );
}
