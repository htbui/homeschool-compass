import { Text, View } from 'react-native';

import { formatDate } from '@/lib/dates';
import type { Listing } from '@/lib/market';
import { currentPrice, onSale, savePercent } from '@/lib/pricing';
import { Pill, Row, T, useColors } from '@/ui';

export const money = (n: number) => (n === 0 ? 'Free' : `$${n % 1 === 0 ? n : n.toFixed(2)}`);

/** A price, with the original crossed out and "Save X%" when it's lower. */
export function Price({ price, was, size = 'heading' }: { price: number; was?: number; size?: 'heading' | 'title' | 'display' }) {
  const c = useColors();
  const save = was !== undefined ? savePercent(was, price) : 0;
  return (
    <View style={{ alignItems: size === 'heading' ? 'flex-end' : 'flex-start', gap: 2 }}>
      <Row gap={6} align="flex-end">
        {save ? (
          <T v="caption" muted>
            <Text style={{ textDecorationLine: 'line-through' }} accessibilityLabel={`was ${money(was!)}`}>{money(was!)}</Text>
          </T>
        ) : null}
        <T v={size} color={c.primary}>{money(price)}</T>
      </Row>
      {save ? <Pill text={`Save ${save}%`} bg={c.accentSoft} fg={c.text} /> : null}
    </View>
  );
}

/** A listing's price today (its sale applied). */
export function PriceTag({ listing, size }: { listing: Listing; size?: 'heading' | 'title' | 'display' }) {
  return <Price price={currentPrice(listing)} was={onSale(listing) ? listing.price : undefined} size={size} />;
}

/** "🏷️ 25% off until Nov 21". */
export function SaleNote({ listing }: { listing: Listing }) {
  const c = useColors();
  if (!onSale(listing)) return null;
  return <T v="caption" color={c.accentInk}>🏷️ {listing.salePercent}% off until {formatDate(listing.saleEndsAt!.slice(0, 10), { month: 'short', day: 'numeric' })}</T>;
}
