import { router } from 'expo-router';
import { View } from 'react-native';

import type { Listing } from '@/lib/market';
import { bundleSummary, type Bundle } from '@/lib/pricing';
import type { ID } from '@/lib/types';
import { Card, Pill, Row, space, T, useColors } from '@/ui';

import { Cover } from './ListingCard';
import { Price } from './PriceTag';

/** A creator's bundle in the Marketplace: what's in it and what it saves. */
export function BundleCard({ bundle, listings, owned }: { bundle: Bundle; listings: Listing[]; owned: Set<ID> }) {
  const c = useColors();
  const s = bundleSummary(bundle, listings, owned);
  if (s.items.length < 2) return null;
  const all = s.items.length === s.owned.length;
  return (
    <Card onPress={() => router.push({ pathname: '/bundle/[id]', params: { id: bundle.id } })} style={{ flex: 1 }}>
      <Row align="flex-start" gap={space.md}>
        <Cover listing={bundle} />
        <View style={{ flex: 1, gap: 3 }}>
          <T v="heading" numberOfLines={2}>{bundle.title}</T>
          <T v="caption" muted numberOfLines={1}>{bundle.seller} · bundle of {s.items.length}</T>
          <T v="caption" numberOfLines={2}>{s.items.map((l) => l.title).join(' · ')}</T>
        </View>
        {all ? null : <Price price={s.price} was={s.listTotal} />}
      </Row>
      <Row wrap gap={6}>
        <Pill text="🎁 Bundle" bg={c.primarySoft} />
        {all ? <Pill text="✓ Owned" bg={c.successSoft} fg={c.success} /> : s.owned.length ? <Pill text={`You have ${s.owned.length} of ${s.items.length}`} /> : null}
        {bundle.mine ? <Pill text="Yours" /> : null}
      </Row>
    </Card>
  );
}
