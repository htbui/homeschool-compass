import { useEffect, useState } from 'react';

import { needsAccount } from '@/components/AccountNote';
import { ShareCode } from '@/components/ShareCode';
import { formatDate } from '@/lib/dates';
import { formatGiftCode, GIFT_NOTE_MAX, isEmail, type SentGift } from '@/lib/gifts';
import type { Purchase } from '@/lib/market';
import type { Quote } from '@/lib/pricing';
import { getStateLaw } from '@/lib/states';
import type { FundingSource, ID } from '@/lib/types';
import { checkout, priceQuote, recordCheckout, type CheckoutItem } from '@/services/checkout';
import { giftableFamilies } from '@/services/giftApi';
import { useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { Actions, Button, Card, Chip, Field, Row, Segmented, Sheet, space, Stack, T, useColors } from '@/ui';

import { Cover } from './ListingCard';
import { money, Price } from './PriceTag';

const FUNDING: { value: FundingSource; label: string }[] = [
  { value: 'esa', label: '🏛️ ESA / state funds' },
  { value: 'tax', label: '🧾 Tax-deductible' },
  { value: 'out_of_pocket', label: '💳 Out of pocket' },
];

/**
 * Confirm a purchase (a listing or a bundle), apply a coupon code, tag how
 * it's funded, and record it (plus an expense entry). As a gift, pick who
 * it's for instead and get the one-time code to pass on.
 */
export function CheckoutSheet({ item, visible, onClose, onPurchased, asGift }: { item: CheckoutItem; visible: boolean; onClose: () => void; onPurchased?: (p: Purchase[]) => void; asGift?: boolean }) {
  const title = asGift ? 'Give as a gift' : item.kind === 'listing' && item.listing.price === 0 ? 'Get this curriculum' : 'Checkout';
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {visible ? <CheckoutForm item={item} asGift={!!asGift} onClose={onClose} onPurchased={onPurchased} /> : null}
    </Sheet>
  );
}

function CheckoutForm({ item: given, asGift, onClose, onPurchased }: { item: CheckoutItem; asGift: boolean; onClose: () => void; onPurchased?: (p: Purchase[]) => void }) {
  const c = useColors();
  // What's being bought stays fixed while the sheet is open.
  const [item] = useState(given);
  const family = useStore((s) => s.family);
  const expenses = useStore((s) => s.expenses);
  const award = useStore((s) => s.esaAnnualAward);
  const source = useMarket((s) => s.source);
  const law = family ? getStateLaw(family.stateCode) : undefined;
  const hasEsa = !!law?.funding.some((f) => f.kind === 'esa' || f.kind === 'allotment');
  const head = item.kind === 'listing' ? item.listing : { ...item.bundle, esaEligible: false };
  const [funding, setFunding] = useState<FundingSource>(hasEsa && head.esaEligible ? 'esa' : 'out_of_pocket');
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<string | undefined>();
  const [q, setQ] = useState<Quote | null>(null);
  const [couponError, setCouponError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<SentGift | null>(null);
  // Gift: an email address or a connected family.
  const [to, setTo] = useState<'email' | 'family'>('email');
  const [email, setEmail] = useState('');
  const [families, setFamilies] = useState<{ familyId: ID; name: string }[]>([]);
  const [familyId, setFamilyId] = useState<ID | undefined>();
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    priceQuote(item, applied)
      .then((r) => {
        if (!alive) return;
        setQ(r);
        // A refused code falls back to the price without it; keep saying why until a code works.
        if (applied) setCouponError('');
      })
      .catch((e: Error) => {
        if (!alive) return;
        if (applied) {
          setCouponError(e.message);
          setApplied(undefined);
        } else setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [item, applied]);

  useEffect(() => {
    if (asGift) giftableFamilies().then(setFamilies);
  }, [asGift]);

  if (sent) {
    return (
      <Stack>
        <Card tint={c.successSoft}>
          <T v="heading">🎁 Your gift is ready</T>
          <T>{sent.title} for {sent.recipientLabel}.{sent.price > 0 ? ` You paid ${money(sent.price)}${sent.demo ? ' (demo — no card charged)' : ''}.` : ''}</T>
        </Card>
        <ShareCode
          label="Their one-time gift code"
          code={sent.code}
          display={formatGiftCode(sent.code)}
          path={`/gift/${sent.code}`}
          message={`🎁 A gift for you on Freerange: ${sent.title}.${sent.note ? ` “${sent.note}”` : ''}`}
        />
        <T v="caption" muted>
          {sent.recipientFamily
            ? 'It’s waiting in their Marketplace library under Gifts. You can also send them the code.'
            : 'Freerange doesn’t email gifts yet, so send them this code or link. If they sign up with that email, it also waits in their library.'}
          {source === 'sample' ? ' (On this device it’s a demo: you can redeem the code yourself under My library → Gifts.)' : ''}
        </T>
        <T v="caption" muted>See whether it’s been claimed under Marketplace → My library → Gifts.</T>
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button title="Done" onPress={onClose} />
        </Row>
      </Stack>
    );
  }

  const total = q?.total ?? 0;
  const free = total === 0;
  const esaSpent = expenses.filter((e) => e.fundingSource === 'esa').reduce((a, e) => a + e.amount, 0);
  const esaLeft = award - esaSpent;
  const recipientOk = to === 'email' ? isEmail(email) : !!familyId;
  const missing = [!q && 'a price', asGift && !recipientOk && (to === 'email' ? 'their email address' : 'a family'), note.length > GIFT_NOTE_MAX && `a shorter note (${GIFT_NOTE_MAX} characters at most)`].filter(Boolean);
  const familyName = families.find((f) => f.familyId === familyId)?.name;

  const buy = async () => {
    setBusy(true);
    setError('');
    try {
      const gift = asGift ? (to === 'email' ? { email: email.trim(), note } : { familyId, label: familyName, note }) : undefined;
      const r = await checkout(item, asGift || free ? 'out_of_pocket' : funding, { coupon: applied, gift });
      if (r.status === 'done') {
        recordCheckout(r);
        if (r.gift) setSent(r.gift);
        else onPurchased?.(r.purchases);
      } else if (r.status === 'error' || r.status === 'pending') setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  const action = asGift ? (free ? 'Send the gift' : `Buy the gift for ${money(total)}`) : free ? 'Get it free' : `Buy for ${money(total)}`;

  return (
    <>
      <Row gap={space.md}>
        <Cover listing={head} size={56} />
        <Stack gap={2} style={{ flex: 1 }}>
          <T v="heading">{head.title}</T>
          <T v="caption" muted>{head.seller}{item.kind === 'bundle' ? ` · bundle of ${item.bundle.listingIds.length}` : ''}</T>
        </Stack>
        {q ? <Price price={q.total} was={q.listPrice > q.total ? q.listPrice : undefined} size="title" /> : null}
      </Row>

      {q ? (
        <Stack gap={2}>
          {q.listPrice > q.price ? (
            <T v="caption" muted>
              {q.kind === 'bundle' ? `Bundle price ${money(q.price)} instead of ${money(q.listPrice)} separately` : `On sale: ${q.salePercent}% off${q.saleEndsAt ? ` until ${formatDate(q.saleEndsAt.slice(0, 10), { month: 'short', day: 'numeric' })}` : ''}`}
            </T>
          ) : null}
          {q.couponCode ? <T v="caption" color={c.successInk}>✓ Coupon {q.couponCode}: −{money(q.discount)}</T> : null}
          {q.kind === 'bundle' ? (
            <Stack gap={2}>
              {q.items.map((i) => (
                <T key={i.listingId} v="caption">• {i.title}</T>
              ))}
              {q.owned.length ? <T v="caption" muted>You already have {q.owned.length} of these, so {q.owned.length === 1 ? 'it isn’t' : 'they aren’t'} charged again.</T> : null}
            </Stack>
          ) : null}
        </Stack>
      ) : !error ? (
        <T muted>Working out the price…</T>
      ) : null}

      {item.kind === 'bundle' || head.price > 0 ? (
        <Stack gap={4}>
          <Row gap={space.sm} align="flex-end">
            <Stack gap={0} style={{ flex: 1 }}>
              <Field placeholder="Coupon code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" accessibilityLabel="Coupon code" />
            </Stack>
            <Button kind="secondary" title={applied ? 'Applied ✓' : 'Apply'} disabled={!code.trim() || code.trim() === applied} onPress={() => setApplied(code.trim())} />
          </Row>
          {couponError ? <T v="caption" color={c.danger}>{couponError}</T> : null}
        </Stack>
      ) : null}

      {asGift ? (
        <Stack gap={6}>
          <T v="label">Who’s it for?</T>
          {families.length ? (
            <Segmented<'email' | 'family'>
              value={to}
              onChange={setTo}
              options={[
                { value: 'email', label: '✉️ By email' },
                { value: 'family', label: '👨‍👩‍👧 A connected family' },
              ]}
            />
          ) : null}
          {to === 'email' ? (
            <Field placeholder="their@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="off" accessibilityLabel="Their email address" />
          ) : (
            <Row wrap gap={6}>
              {families.map((f) => (
                <Chip key={f.familyId} label={f.name} selected={familyId === f.familyId} onPress={() => setFamilyId(f.familyId)} />
              ))}
            </Row>
          )}
          <Field label="Note (optional)" placeholder="Happy homeschooling!" value={note} onChangeText={setNote} multiline maxLength={GIFT_NOTE_MAX} />
          <T v="caption" muted>They get a one-time code to claim it, and it goes into their library. Gifts aren’t paid with ESA funds.</T>
        </Stack>
      ) : !free && q ? (
        <Stack gap={6}>
          <T v="label">How are you paying for it?</T>
          <Row wrap gap={6}>
            {FUNDING.map((f) => (
              <Chip key={f.value} label={f.label} selected={funding === f.value} onPress={() => setFunding(f.value)} />
            ))}
          </Row>
          {funding === 'esa' && !head.esaEligible ? <T v="caption" color={c.danger}>This seller isn&apos;t a listed ESA vendor — check your program&apos;s rules before using state funds.</T> : null}
          {funding === 'esa' && award > 0 ? <T v="caption" muted>ESA balance after this: {money(Math.max(0, esaLeft - total))} of {money(award)}</T> : null}
          <T v="caption" muted>It&apos;s added to your expense tracker automatically, tagged for {funding === 'esa' ? 'ESA reimbursement' : funding === 'tax' ? 'tax records' : 'your budget'}.</T>
        </Stack>
      ) : null}
      {!free && source === 'sample' ? (
        <Card tint={c.accentSoft}>
          <T v="caption">🧪 Demo checkout: no card is charged on this device. {needsAccount('Real purchases go through secure checkout once you sign in to Freerange.', 'Real purchases go through secure checkout in the connected app.')}</T>
        </Card>
      ) : !free ? (
        <T v="caption" muted>🔒 You&apos;ll pay on a secure checkout page; Freerange never sees your card.</T>
      ) : null}
      {error ? <T color={c.danger}>{error}</T> : null}
      <Actions>
        <Button kind="secondary" title="Cancel" onPress={onClose} />
        <Button title={action} loading={busy} disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={buy} />
      </Actions>
    </>
  );
}
