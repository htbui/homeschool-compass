import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { CONDITION_LABEL, gradeRangeLabel, SELLER_NOTE, type Listing } from '@/lib/market';
import { formatLabel, listingCardLabel } from '@/lib/marketView';
import { currentPrice } from '@/lib/pricing';
import { SUBJECTS } from '@/lib/subjects';
import { Card, Pill, Row, space, T, useColors } from '@/ui';

import { money, PriceTag } from './PriceTag';
import { VerifiedBadge } from './SellerBadges';

export { money } from './PriceTag';

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const c = useColors();
  const full = Math.round(value);
  return (
    <Text accessibilityLabel={`${value} out of 5 stars`} style={{ color: c.accent, fontSize: size, letterSpacing: 1 }}>
      {'★'.repeat(full)}
      <Text style={{ color: c.border }}>{'★'.repeat(5 - full)}</Text>
    </Text>
  );
}

export function Cover({ listing, size = 64 }: { listing: Pick<Listing, 'cover' | 'color'>; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: `${listing.color}26`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.5 }}>{listing.cover}</Text>
    </View>
  );
}

/**
 * A listing in a grid or list. Screen readers hear one sentence ("Burgess Bird Book, by Thornton
 * Burgess, free, grades 1–4"). `hideSeller` on a creator's own storefront; `footer` puts actions
 * (like "Add to plan") inside the card, with a "View" button since the card itself can't be tapped then.
 */
export function ListingCard({ listing: l, owned, reasons, hideSeller, footer }: { listing: Listing; owned?: boolean; reasons?: string[]; hideSeller?: boolean; footer?: ReactNode }) {
  const c = useColors();
  const grades = gradeRangeLabel(l.gradeMin, l.gradeMax);
  const label = listingCardLabel(l, money(currentPrice(l)), grades, owned);
  const open = () => router.push({ pathname: '/listing/[id]', params: { id: l.id } });
  return (
    <Card onPress={footer ? undefined : open} label={footer ? undefined : label} style={{ flex: 1 }}>
      <Row align="flex-start" gap={space.md}>
        <Cover listing={l} />
        <View style={{ flex: 1, gap: 3 }}>
          <T v="heading" numberOfLines={3}>{l.title}</T>
          {hideSeller ? null : (
            <T v="caption" muted numberOfLines={1}>
              {l.sellerKind === 'open' ? `by ${l.seller}` : l.seller}
              {SELLER_NOTE[l.sellerKind]}
            </T>
          )}
          {/* No "No reviews yet" on every card: the row only appears once there's something to show. */}
          {l.ratingCount ? (
            <Row gap={6}>
              <Stars value={l.ratingAvg} />
              <T v="caption" muted>{l.ratingAvg.toFixed(1)} ({l.ratingCount})</T>
            </Row>
          ) : null}
        </View>
        {owned ? <Pill text="✓ Owned" tone="success" /> : <PriceTag listing={l} />}
      </Row>
      <Row wrap gap={6}>
        {l.sellerVerified ? <VerifiedBadge plain /> : null}
        <Pill text={grades} />
        {l.subjects.slice(0, 2).map((s) => (
          <Pill key={s} text={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} />
        ))}
        <Pill text={formatLabel(l)} />
        {l.condition ? <Pill text={`Used · ${CONDITION_LABEL[l.condition]}`} tone="accent" /> : null}
        {l.photos?.length ? <Pill text={`📷 ${l.photos.length} photo${l.photos.length === 1 ? '' : 's'}`} /> : null}
        {l.esaEligible ? <Pill text={`ESA ✓${l.esaStates?.length && l.esaStates.length <= 3 ? ` ${l.esaStates.join(' ')}` : ''}`} tone="primary" /> : null}
        {l.sample ? <Pill text="Sample" /> : null}
      </Row>
      {reasons?.length ? <T v="caption" color={c.primaryInk}>✨ {reasons.join(' · ')}</T> : null}
      {footer ? (
        <Row wrap style={{ justifyContent: 'flex-end' }}>
          {footer}
        </Row>
      ) : null}
    </Card>
  );
}
