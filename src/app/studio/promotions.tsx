import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AccountNote } from '@/components/AccountNote';
import { money, Price, SaleNote } from '@/components/market/PriceTag';
import { addDays, formatDate, todayKey } from '@/lib/dates';
import type { Listing } from '@/lib/market';
import { parseCount } from '@/lib/parse';
import { bundleIssues, bundleSummary, couponIssues, couponLabel, currentPrice, normalizeCode, onSale, saleIssues, SALE_MAX, SALE_MIN, type Bundle, type Coupon } from '@/lib/pricing';
import { deleteCoupon, myBundles, myCoupons, removeBundle, saveBundle, saveCoupon, setSale } from '@/services/promoApi';
import { useAccount } from '@/store/useAccount';
import { useCatalog } from '@/store/useMarket';
import { Actions, Button, Card, Chip, DateField, Empty, Field, MoneyField, Pill, Row, Screen, Section, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

/** End of the chosen day, as a timestamp. */
const endOf = (d: string) => new Date(`${d}T23:59:00`).toISOString();
const day = (iso: string) => formatDate(iso.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' });

/** Studio promotions: sales on single curricula, bundles, and coupon codes. Checkout always reprices on the server. */
export default function Promotions() {
  const c = useColors();
  const userId = useAccount((s) => s.userId);
  const { listings } = useCatalog();
  const mine = listings.filter((l) => l.mine && l.packageId && !l.suspended);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [saleFor, setSaleFor] = useState<Listing | null>(null);
  const [bundleDraft, setBundleDraft] = useState<Bundle | 'new' | null>(null);
  const [couponOpen, setCouponOpen] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirm();
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [b, k] = await Promise.all([myBundles(), myCoupons()]);
      setBundles(b);
      setCoupons(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const title = (id?: string) => (id ? (listings.find((l) => l.id === id)?.title ?? 'A removed curriculum') : 'Everything in your shop');

  return (
    <Screen edges={[]}>
      <T v="display">🏷️ Sales, bundles & coupons</T>
      <T muted>Prices are always worked out by Freerange at checkout, so what families pay matches what you set here.</T>
      {!userId ? <AccountNote style={{ marginTop: space.sm }} signIn="Without an account these stay on this device, like your listings. Sign in so families everywhere see them." deviceOnly="Sales, bundles, and coupons stay here too, like your listings." /> : null}
      {error ? <T color={c.danger}>{error}</T> : null}

      {mine.length === 0 ? (
        <Section title="Nothing published yet">
          <Empty icon="🚀" title="Publish a curriculum first" body="Sales, bundles, and coupons are for curricula you’ve published to the Marketplace." action={<Button title="Back to Studio" onPress={() => router.replace('/studio')} />} />
        </Section>
      ) : (
        <>
          <Section title="Sales" subtitle={`Take ${SALE_MIN}–${SALE_MAX}% off one curriculum until a date you choose.`}>
            <Stack>
              {mine.map((l) => (
                <Card key={l.id}>
                  <Row style={{ justifyContent: 'space-between' }} wrap>
                    <T v="heading" style={{ flex: 1 }}>{l.cover} {l.title}</T>
                    <Price price={currentPrice(l)} was={onSale(l) ? l.price : undefined} />
                  </Row>
                  <SaleNote listing={l} />
                  {l.price === 0 ? (
                    <T v="caption" muted>Free, so there’s nothing to discount.</T>
                  ) : (
                    <Row wrap>
                      <Button size="sm" kind="secondary" title={onSale(l) ? 'Change sale' : 'Put on sale'} onPress={() => setSaleFor(l)} />
                      {l.salePercent ? <Button size="sm" kind="ghost" title="End sale" onPress={() => setSale(l, undefined, undefined).catch((e) => setError(e.message))} /> : null}
                    </Row>
                  )}
                </Card>
              ))}
            </Stack>
          </Section>

          <Section title="Bundles" subtitle="Two or more of your curricula together, for less than buying them one by one." action={<Button size="sm" icon="＋" title="New bundle" disabled={mine.length < 2} onPress={() => setBundleDraft('new')} />}>
            {mine.length < 2 ? <T muted>Publish at least two curricula to make a bundle.</T> : null}
            {bundles.length === 0 && mine.length >= 2 ? <T muted>No bundles yet.</T> : null}
            <Stack>
              {bundles.map((b) => {
                const s = bundleSummary(b, listings);
                return (
                  <Card key={b.id}>
                    <Row style={{ justifyContent: 'space-between' }} wrap>
                      <T v="heading" style={{ flex: 1 }}>{b.cover} {b.title}</T>
                      <Price price={s.price} was={s.listTotal} />
                    </Row>
                    <T v="caption" muted>{s.items.map((l) => l.title).join(' · ')}</T>
                    <Row wrap>
                      <Button size="sm" kind="secondary" title="Edit" onPress={() => setBundleDraft(b)} />
                      <Button size="sm" kind="ghost" title="View in Marketplace" onPress={() => router.push({ pathname: '/bundle/[id]', params: { id: b.id } })} />
                      <Button size="sm" kind="ghost" title="Remove" onPress={() => confirm.ask(`Remove “${b.title}”?`, () => removeBundle(b.id).then(load).catch((e) => setError(e.message)), { confirm: 'Remove', body: 'Families who bought it keep everything in it.' })} />
                    </Row>
                  </Card>
                );
              })}
            </Stack>
          </Section>

          <Section title="Coupon codes" subtitle="Percent or dollars off, for one curriculum or your whole shop (bundles too)." action={<Button size="sm" icon="＋" title="New coupon" onPress={() => setCouponOpen(true)} />}>
            {coupons.length === 0 ? <T muted>No coupons yet.</T> : null}
            <Stack>
              {coupons.map((k) => {
                const expired = !!k.expiresAt && Date.parse(k.expiresAt) <= now;
                const usedUp = !!k.maxUses && k.uses >= k.maxUses;
                return (
                  <Card key={k.id}>
                    <Row style={{ justifyContent: 'space-between' }} wrap>
                      <T v="heading" style={{ flex: 1, letterSpacing: 1 }} selectable>{k.code}</T>
                      <Pill text={!k.active ? 'Paused' : expired ? 'Expired' : usedUp ? 'Used up' : 'Active'} tone={k.active && !expired && !usedUp ? 'success' : undefined} />
                    </Row>
                    <T v="caption">
                      {couponLabel(k)} · {title(k.listingId)} · used {k.uses}{k.maxUses ? ` of ${k.maxUses}` : ''} time{k.uses === 1 && !k.maxUses ? '' : 's'}
                      {k.expiresAt ? ` · ${expired ? 'expired' : 'until'} ${day(k.expiresAt)}` : ''}
                    </T>
                    <Row wrap>
                      <Button size="sm" kind="secondary" title={k.active ? 'Pause' : 'Turn back on'} onPress={() => saveCoupon({ ...k, active: !k.active }).then(load).catch((e) => setError(e.message))} />
                      <Button size="sm" kind="ghost" title="Delete" onPress={() => confirm.ask(`Delete ${k.code}?`, () => deleteCoupon(k.id).then(load).catch((e) => setError(e.message)), { confirm: 'Delete' })} />
                    </Row>
                  </Card>
                );
              })}
            </Stack>
          </Section>
        </>
      )}

      {saleFor ? <SaleSheet listing={saleFor} onClose={() => setSaleFor(null)} /> : null}
      {bundleDraft ? <BundleSheet existing={bundleDraft === 'new' ? undefined : bundleDraft} mine={mine} onClose={() => { setBundleDraft(null); load(); }} /> : null}
      {couponOpen ? <CouponSheet mine={mine} existing={coupons} onClose={() => { setCouponOpen(false); load(); }} /> : null}
      {confirm.element}
    </Screen>
  );
}

function SaleSheet({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const c = useColors();
  const [pct, setPct] = useState(listing.salePercent ? String(listing.salePercent) : '20');
  const [ends, setEnds] = useState<string | undefined>(listing.saleEndsAt?.slice(0, 10) ?? addDays(todayKey(), 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const n = parseCount(pct);
  const endsAt = ends ? endOf(ends) : undefined;
  const issues = saleIssues(n, endsAt, listing.price);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await setSale(listing, n, endsAt);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible onClose={onClose} title={`Sale: ${listing.title}`}>
      <Field label="Percent off" keyboardType="number-pad" value={pct} onChangeText={setPct} />
      <DateField label="Last day of the sale" value={ends} onChange={setEnds} />
      {n && !issues.length ? <T>Families pay {money(currentPrice({ price: listing.price, salePercent: n, saleEndsAt: endsAt }))} instead of {money(listing.price)}.</T> : null}
      {error ? <T color={c.danger}>{error}</T> : null}
      <Actions>
        <Button kind="secondary" title="Cancel" onPress={onClose} />
        <Button title="Start the sale" loading={busy} disabled={issues.length > 0} reason={`Still needed: ${issues.join(', ')}`} onPress={save} />
      </Actions>
    </Sheet>
  );
}

function BundleSheet({ existing, mine, onClose }: { existing?: Bundle; mine: Listing[]; onClose: () => void }) {
  const c = useColors();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [ids, setIds] = useState<string[]>(existing?.listingIds ?? []);
  const [price, setPrice] = useState<number | undefined>(existing?.price);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picked = mine.filter((l) => ids.includes(l.id));
  const sum = picked.reduce((a, l) => a + l.price, 0);
  const issues = bundleIssues({ title, listingIds: ids, price: price ?? NaN }, mine);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await saveBundle({ id: existing?.id, title, description, listingIds: ids, price: price ?? 0, cover: '🎁', color: picked[0]?.color ?? '#2F6B5E' });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible onClose={onClose} title={existing ? 'Edit bundle' : 'New bundle'}>
      <Field label="Bundle name" placeholder="Pond science year" value={title} onChangeText={setTitle} maxLength={160} />
      <Field label="Description (optional)" value={description} onChangeText={setDescription} multiline />
      <Stack gap={6}>
        <T v="label">What’s in it</T>
        <Row wrap gap={6}>
          {mine.map((l) => (
            <Chip key={l.id} label={`${l.cover} ${l.title} · ${money(l.price)}`} selected={ids.includes(l.id)} onPress={() => setIds(ids.includes(l.id) ? ids.filter((x) => x !== l.id) : [...ids, l.id])} />
          ))}
        </Row>
      </Stack>
      <View>
        <MoneyField label={`Bundle price${sum ? ` (separately: ${money(sum)})` : ''}`} value={price} onChange={setPrice} />
      </View>
      {error ? <T color={c.danger}>{error}</T> : null}
      <Actions>
        <Button kind="secondary" title="Cancel" onPress={onClose} />
        <Button title="Save bundle" loading={busy} disabled={issues.length > 0} reason={`Still needed: ${issues.join(', ')}`} onPress={save} />
      </Actions>
    </Sheet>
  );
}

function CouponSheet({ mine, existing, onClose }: { mine: Listing[]; existing: Coupon[]; onClose: () => void }) {
  const c = useColors();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<Coupon['kind']>('percent');
  const [amount, setAmount] = useState('10');
  const [listingId, setListingId] = useState<string | undefined>();
  const [maxUses, setMaxUses] = useState('');
  const [expires, setExpires] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const n = Number(amount.replace(/[$%\s]/g, ''));
  const uses = maxUses.trim() ? (parseCount(maxUses) ?? 0) : undefined;
  const draft = { code, kind, amount: Number.isFinite(n) ? n : 0, maxUses: uses, expiresAt: expires ? endOf(expires) : undefined };
  const issues = couponIssues(draft, existing);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await saveCoupon({ ...draft, code: normalizeCode(code), listingId, active: true });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible onClose={onClose} title="New coupon code">
      <Field label="Code" placeholder="SPRING25" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoComplete="off" maxLength={24} />
      <Row wrap gap={6}>
        <Chip label="% off" selected={kind === 'percent'} onPress={() => setKind('percent')} />
        <Chip label="$ off" selected={kind === 'fixed'} onPress={() => setKind('fixed')} />
      </Row>
      <Field label={kind === 'percent' ? 'Percent off' : 'Dollars off'} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <Stack gap={6}>
        <T v="label">Works on</T>
        <Row wrap gap={6}>
          <Chip label="Everything in my shop" selected={!listingId} onPress={() => setListingId(undefined)} />
          {mine.map((l) => (
            <Chip key={l.id} label={`${l.cover} ${l.title}`} selected={listingId === l.id} onPress={() => setListingId(l.id)} />
          ))}
        </Row>
      </Stack>
      <Field label="How many times it can be used (optional)" placeholder="No limit" keyboardType="number-pad" value={maxUses} onChangeText={setMaxUses} />
      <DateField label="Last day it works (optional)" value={expires} onChange={setExpires} />
      {error ? <T color={c.danger}>{error}</T> : null}
      <Actions>
        <Button kind="secondary" title="Cancel" onPress={onClose} />
        <Button title="Create coupon" loading={busy} disabled={issues.length > 0} reason={`Still needed: ${issues.join(', ')}`} onPress={save} />
      </Actions>
    </Sheet>
  );
}
