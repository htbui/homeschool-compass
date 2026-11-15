import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AddToPlanSheet } from '@/components/market/AddToPlanSheet';
import { CheckoutSheet } from '@/components/market/CheckoutSheet';
import { Cover, ListingCard } from '@/components/market/ListingCard';
import { money, Price } from '@/components/market/PriceTag';
import type { Listing, Purchase } from '@/lib/market';
import { bundleSummary } from '@/lib/pricing';
import { useBundles, useCatalog } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { Button, Card, Empty, Pill, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

/** A creator's bundle: what's in it, what it saves, and buying it in one go. */
export default function BundleDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bundles = useBundles();
  const { listings } = useCatalog();
  const family = useStore((s) => s.family);
  const purchases = useStore((s) => s.purchases);
  const [buying, setBuying] = useState(false);
  const [bought, setBought] = useState<Purchase[] | null>(null);
  const [planning, setPlanning] = useState<{ listing: Listing; purchase: Purchase } | null>(null);

  const b = bundles.find((x) => x.id === id);
  const owned = new Set(purchases.filter((p) => p.status !== 'pending').map((p) => p.listingId));
  const s = b ? bundleSummary(b, listings, owned) : undefined;
  if (!b || !s || s.items.length < 2) {
    return (
      <Screen edges={[]}>
        <Empty icon="🎁" title="That bundle isn't available" body="The creator may have taken it down." action={<Button title="Back to the marketplace" onPress={() => router.replace('/market')} />} />
      </Screen>
    );
  }
  const all = s.owned.length === s.items.length;

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: b.title }} />
      <Row gap={space.lg} align="flex-start">
        <Cover listing={b} size={88} />
        <Stack gap={4} style={{ flex: 1 }}>
          <T v="title">{b.title}</T>
          <T muted>{b.seller} · bundle of {s.items.length} curricula</T>
          {b.description ? <T>{b.description}</T> : null}
        </Stack>
      </Row>

      <Card style={{ marginTop: space.lg }}>
        {all ? (
          <Pill text="✓ You have everything in this bundle" bg={c.successSoft} fg={c.success} />
        ) : (
          <>
            <Price price={s.price} was={s.listTotal} size="display" />
            <T v="caption" muted>
              {money(s.listTotal)} if bought separately
              {s.owned.length ? ` · you already have ${s.owned.length}, so ${s.owned.length === 1 ? 'it isn’t' : 'they aren’t'} counted` : ''}
            </T>
            {b.mine ? (
              <T muted>This is your bundle.</T>
            ) : !family ? (
              <T muted>Set up your family in Compass to get curricula and schedule their lessons.</T>
            ) : (
              <Button size="lg" title={s.price === 0 ? 'Get the bundle free' : `Buy the bundle`} onPress={() => setBuying(true)} />
            )}
          </>
        )}
      </Card>

      {bought ? (
        <Card tint={c.successSoft} style={{ marginTop: space.md }}>
          <T v="heading">🎉 {bought.length} {bought.length === 1 ? 'curriculum is' : 'curricula are'} in your library</T>
          <T v="caption">Add each one to your plan when you’re ready to start it.</T>
        </Card>
      ) : null}

      <Section title="What's in it">
        <Stack>
          {s.items.map((l) => {
            const p = purchases.find((x) => x.listingId === l.id);
            return (
              <Stack key={l.id} gap={4}>
                <ListingCard listing={l} owned={owned.has(l.id)} />
                {p && !p.curriculumId ? (
                  <Row style={{ justifyContent: 'flex-end' }}>
                    <Button size="sm" title="Add to plan" onPress={() => setPlanning({ listing: l, purchase: p })} />
                  </Row>
                ) : null}
              </Stack>
            );
          })}
        </Stack>
      </Section>

      <CheckoutSheet
        item={{ kind: 'bundle', bundle: b }}
        visible={buying}
        onClose={() => setBuying(false)}
        onPurchased={(ps) => {
          setBuying(false);
          setBought(ps);
        }}
      />
      {planning ? <AddToPlanSheet listing={planning.listing} purchaseId={planning.purchase.id} visible onClose={() => setPlanning(null)} /> : null}
    </Screen>
  );
}
