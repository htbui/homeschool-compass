import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { formatGiftCode, normalizeGiftCode } from '@/lib/gifts';
import type { Purchase } from '@/lib/market';
import { cloudEnabled } from '@/services/cloud';
import { claimGift, previewGift, type GiftPreview } from '@/services/giftApi';
import { useAccount } from '@/store/useAccount';
import { useCatalog } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { Button, Card, Empty, Screen, space, Stack, T, useColors } from '@/ui';

/** A gift link: see what it is and claim it into this family's library. */
export default function GiftLink() {
  const c = useColors();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = normalizeGiftCode(raw ?? '');
  const family = useStore((s) => s.family);
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

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: 'A gift for you' }} />
      {needsAccount ? (
        <Empty icon="🎁" title="Someone sent you a curriculum" body="Sign in or create a free account to claim it into your family's library." action={<Button title="Sign in" onPress={() => router.push('/account')} />} />
      ) : gift === undefined && !error ? (
        <T muted>Opening your gift…</T>
      ) : gift === null ? (
        <Empty icon="🔎" title="That gift code isn't valid" body={`Check the code (${formatGiftCode(code)}) with the person who sent it.`} action={<Button title="Go to the marketplace" onPress={() => router.replace('/market')} />} />
      ) : gift ? (
        <Stack gap={space.lg}>
          <Card tint={c.successSoft}>
            <T v="title">🎁 {gift.title}</T>
            <T muted>From {gift.giverName} · {gift.seller}</T>
            {gift.note ? <T>“{gift.note}”</T> : null}
          </Card>
          {claimed ? (
            <Stack>
              <T v="heading">🎉 It’s in your library.</T>
              <Button title="Add it to your plan" disabled={!listing} reason="Open it from Marketplace → My library" onPress={() => setPlanning(true)} />
              <Button kind="secondary" title="Go to my library" onPress={() => router.replace({ pathname: '/market', params: { view: 'library' } })} />
            </Stack>
          ) : gift.status === 'claimed' ? (
            <T muted>This gift has already been claimed.</T>
          ) : gift.status !== 'ready' ? (
            <T muted>This gift isn’t available any more.</T>
          ) : !family ? (
            <T muted>Set up your family first, then open this link again to claim it.</T>
          ) : (
            <Button size="lg" title="Claim my gift" loading={busy} onPress={claim} />
          )}
        </Stack>
      ) : null}
      {error ? <T color={c.danger}>{error}</T> : null}
      {planning && listing && claimed ? <AddToPlanSheet listing={listing} purchaseId={claimed.id} visible onClose={() => setPlanning(false)} /> : null}
    </Screen>
  );
}
