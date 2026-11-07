import { useState } from 'react';

import { getStateLaw } from '@/lib/states';
import type { Listing, Purchase } from '@/lib/market';
import type { FundingSource } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { useMarket } from '@/store/useMarket';
import { checkout } from '@/services/checkout';
import { Button, Card, Chip, Row, Sheet, space, Stack, T, useColors } from '@/ui';

import { Cover, money } from './ListingCard';

const FUNDING: { value: FundingSource; label: string }[] = [
  { value: 'esa', label: '🏛️ ESA / state funds' },
  { value: 'tax', label: '🧾 Tax-deductible' },
  { value: 'out_of_pocket', label: '💳 Out of pocket' },
];

/** Confirm a purchase, tag how it's funded, and record it (plus an expense entry). */
export function CheckoutSheet({ listing, visible, onClose, onPurchased }: { listing: Listing; visible: boolean; onClose: () => void; onPurchased: (p: Purchase) => void }) {
  const c = useColors();
  const family = useStore((s) => s.family);
  const expenses = useStore((s) => s.expenses);
  const award = useStore((s) => s.esaAnnualAward);
  const source = useMarket((s) => s.source);
  const law = family ? getStateLaw(family.stateCode) : undefined;
  const hasEsa = !!law?.funding.some((f) => f.kind === 'esa' || f.kind === 'allotment');
  const [funding, setFunding] = useState<FundingSource>(hasEsa && listing.esaEligible ? 'esa' : 'out_of_pocket');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const free = listing.price === 0;
  const esaSpent = expenses.filter((e) => e.fundingSource === 'esa').reduce((a, e) => a + e.amount, 0);
  const esaLeft = award - esaSpent;

  const buy = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await checkout(listing, free ? 'out_of_pocket' : funding);
      if (r.status === 'done') {
        if (!useStore.getState().purchases.some((p) => p.id === r.purchase.id)) useStore.getState().recordPurchase(r.purchase);
        onPurchased(r.purchase);
      } else if (r.status === 'error' || r.status === 'pending') setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={free ? 'Get this curriculum' : 'Checkout'}>
      <Row gap={space.md}>
        <Cover listing={listing} size={56} />
        <Stack gap={2} style={{ flex: 1 }}>
          <T v="heading">{listing.title}</T>
          <T v="caption" muted>{listing.seller}</T>
        </Stack>
        <T v="title" color={c.primary}>{money(listing.price)}</T>
      </Row>
      {!free ? (
        <Stack gap={6}>
          <T v="label">How are you paying for it?</T>
          <Row wrap gap={6}>
            {FUNDING.map((f) => (
              <Chip key={f.value} label={f.label} selected={funding === f.value} onPress={() => setFunding(f.value)} />
            ))}
          </Row>
          {funding === 'esa' && !listing.esaEligible ? <T v="caption" color={c.danger}>This seller isn&apos;t a listed ESA vendor — check your program&apos;s rules before using state funds.</T> : null}
          {funding === 'esa' && award > 0 ? <T v="caption" muted>ESA balance after this: {money(Math.max(0, esaLeft - listing.price))} of {money(award)}</T> : null}
          <T v="caption" muted>It&apos;s added to your expense tracker automatically, tagged for {funding === 'esa' ? 'ESA reimbursement' : funding === 'tax' ? 'tax records' : 'your budget'}.</T>
        </Stack>
      ) : null}
      {source === 'sample' && !free ? (
        <Card tint={c.accentSoft}>
          <T v="caption">🧪 Demo checkout: this is a sample listing, so no card is charged. Real purchases go through secure checkout once you sign in to Kinship.</T>
        </Card>
      ) : !free ? (
        <T v="caption" muted>🔒 You&apos;ll pay on a secure checkout page; Kinship never sees your card.</T>
      ) : null}
      {error ? <T color={c.danger}>{error}</T> : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button kind="secondary" title="Cancel" onPress={onClose} />
        <Button title={free ? 'Get it free' : `Buy for ${money(listing.price)}`} loading={busy} onPress={buy} />
      </Row>
    </Sheet>
  );
}
