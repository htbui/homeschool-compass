import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { CONDITION_LABEL, FORMAT_LABEL, gradeRangeLabel, SELLER_NOTE, type Listing } from '@/lib/market';
import { SUBJECTS } from '@/lib/subjects';
import { Card, Pill, Row, space, T, useColors } from '@/ui';

export const money = (n: number) => (n === 0 ? 'Free' : `$${n % 1 === 0 ? n : n.toFixed(2)}`);

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

export function ListingCard({ listing: l, owned, reasons }: { listing: Listing; owned?: boolean; reasons?: string[] }) {
  const c = useColors();
  return (
    <Card onPress={() => router.push({ pathname: '/listing/[id]', params: { id: l.id } })} style={{ flex: 1 }}>
      <Row align="flex-start" gap={space.md}>
        <Cover listing={l} />
        <View style={{ flex: 1, gap: 3 }}>
          <T v="heading" numberOfLines={2}>{l.title}</T>
          <T v="caption" muted numberOfLines={1}>
            {l.sellerKind === 'open' ? `by ${l.seller}` : l.seller}
            {l.sellerVerified ? ' ✓' : ''}
            {SELLER_NOTE[l.sellerKind]}
          </T>
          <Row gap={6}>
            {l.ratingCount ? (
              <>
                <Stars value={l.ratingAvg} />
                <T v="caption" muted>{l.ratingAvg.toFixed(1)} ({l.ratingCount})</T>
              </>
            ) : (
              <T v="caption" muted>No reviews yet</T>
            )}
          </Row>
        </View>
        <T v="heading" color={c.primary}>{money(l.price)}</T>
      </Row>
      <Row wrap gap={6}>
        {owned ? <Pill text="✓ Owned" bg={c.successSoft} fg={c.success} /> : null}
        <Pill text={gradeRangeLabel(l.gradeMin, l.gradeMax)} />
        {l.subjects.slice(0, 2).map((s) => (
          <Pill key={s} text={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} />
        ))}
        <Pill text={FORMAT_LABEL[l.format]} />
        {l.condition ? <Pill text={`Used · ${CONDITION_LABEL[l.condition]}`} bg={c.accentSoft} /> : null}
        {l.esaEligible ? <Pill text="ESA ✓" bg={c.primarySoft} /> : null}
        {l.sample ? <Pill text="Sample" /> : null}
      </Row>
      {reasons?.length ? <T v="caption" color={c.primary}>✨ {reasons.join(' · ')}</T> : null}
    </Card>
  );
}
