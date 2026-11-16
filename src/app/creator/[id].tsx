import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { needsAccount } from '@/components/AccountNote';
import { BundleCard } from '@/components/market/BundleCard';
import { ListingCard, Stars } from '@/components/market/ListingCard';
import { EsaBadge, VerifiedBadge } from '@/components/market/SellerBadges';
import { storefrontSummary, type Badge } from '@/lib/creators';
import { isModerator } from '@/services/marketApi';
import { loadStorefront, revokeBadge, setFollowing, type Storefront } from '@/services/creatorApi';
import { openMaterial } from '@/services/materials';
import { useAccount } from '@/store/useAccount';
import { useBundles, useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';
import { Button, Card, Empty, Field, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

/** A creator's storefront: who they are, their badges, and everything they sell. */
export default function CreatorStorefront() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useAccount((s) => s.userId);
  const source = useMarket((s) => s.source);
  const family = useStore((s) => s.family);
  const purchases = useStore((s) => s.purchases);
  const bundles = useBundles();
  const following = useStore((s) => (s.followedCreators ?? []).includes(id ?? ''));
  const [store, setStore] = useState<Storefront | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [moderator, setModerator] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!id) return;
    loadStorefront(id)
      .then((s) => alive && setStore(s ?? null))
      .catch((e) => alive && (setError(e instanceof Error ? e.message : String(e)), setStore(null)));
    isModerator().then((m) => alive && setModerator(m));
    return () => {
      alive = false;
    };
  }, [id, userId, source, tick]);

  if (store === undefined) {
    return (
      <Screen edges={[]}>
        <T muted>Loading…</T>
      </Screen>
    );
  }
  if (!store) {
    return (
      <Screen edges={[]}>
        <Empty icon="🏪" title="That storefront isn’t available" body={error || (source === 'sample' ? needsAccount('Creator storefronts need the live Marketplace. Sign in under Settings → Account.', 'Creator storefronts need the live Marketplace.') : 'The creator may have closed their shop.')} action={<Button title="Back to the marketplace" onPress={() => router.replace('/market')} />} />
      </Screen>
    );
  }

  const summary = storefrontSummary(store.listings);
  const owned = new Set(purchases.map((p) => p.listingId));
  const cols = width >= 1400 ? 3 : width >= 760 ? 2 : 1;
  const storeBundles = bundles.filter((b) => b.creatorUser === store.id || (store.mine && b.mine));
  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      await setFollowing(store.id, !following);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: store.name }} />
      {/* Name and Follow share a row at every width, so Follow never floats on its own on phones. */}
      <Row style={{ justifyContent: 'space-between' }} align="flex-start" gap={space.md}>
        <T v="display" style={{ flex: 1 }}>🏪 {store.name}</T>
        {store.mine ? null : (
          <Button kind={following ? 'secondary' : 'primary'} title={following ? '✓ Following' : '＋ Follow'} accessibilityLabel={following ? `Following ${store.name}` : `Follow ${store.name}`} loading={busy} onPress={toggle} />
        )}
      </Row>
      <Stack gap={space.xs}>
        {store.mine ? (
          <T v="caption" muted>This is your storefront.</T>
        ) : (
          <T v="caption" muted>
            {following ? 'You follow this creator: ' : 'Follow to see '}their newest curricula at the top of Marketplace → Browse{userId ? '' : ' (saved on this device)'}.
          </T>
        )}
        <Row wrap gap={6}>
          {store.verified ? <VerifiedBadge /> : null}
          {store.esaStates.length ? <EsaBadge states={store.esaStates} homeState={family?.stateCode} /> : null}
        </Row>
        {store.bio ? <T>{store.bio}</T> : null}
        <Row gap={6} wrap>
          {summary.reviews ? (
            <>
              <Stars value={summary.avg} size={18} />
              <T v="label">{summary.avg.toFixed(1)} · {summary.reviews} review{summary.reviews === 1 ? '' : 's'} ·</T>
            </>
          ) : null}
          <T v="caption" muted>{summary.listings} curricul{summary.listings === 1 ? 'um' : 'a'}{storeBundles.length ? ` · ${storeBundles.length} bundle${storeBundles.length === 1 ? '' : 's'}` : ''}</T>
        </Row>
        {store.website ? (
          <Row>
            <Button size="sm" kind="ghost" title={`🔗 ${store.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}`} onPress={() => openMaterial({ id: 'site', label: store.name, url: store.website })} />
          </Row>
        ) : null}
      </Stack>
      {error ? <T color={c.danger}>{error}</T> : null}

      {storeBundles.length ? (
        <Section title="🎁 Bundles" subtitle="Their curricula together, for less.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {storeBundles.map((b) => (
              <View key={b.id} style={{ width: cols === 1 ? '100%' : `${100 / cols - 2}%`, flexGrow: 1 }}>
                <BundleCard bundle={b} listings={store.listings} owned={owned} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Curricula">
        {store.listings.length === 0 ? (
          <Empty icon="📭" title="Nothing for sale right now" body={store.mine ? 'Publish a curriculum from Studio and it shows up here.' : 'Follow to keep an eye on this creator.'} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {summary.sorted.map((l) => (
              <View key={l.id} style={{ width: cols === 1 ? '100%' : `${100 / cols - 2}%`, flexGrow: 1 }}>
                <ListingCard listing={l} owned={owned.has(l.id)} hideSeller />
              </View>
            ))}
          </View>
        )}
      </Section>

      {moderator && (store.verified || store.esaStates.length) ? <RevokeCard store={store} onDone={() => setTick((t) => t + 1)} /> : null}
    </Screen>
  );
}

/** For moderators: take a badge away. */
function RevokeCard({ store, onDone }: { store: Storefront; onDone: () => void }) {
  const c = useColors();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<Badge | ''>('');
  const [error, setError] = useState('');
  const revoke = async (badge: Badge) => {
    setBusy(badge);
    setError('');
    try {
      await revokeBadge(store.id, badge, note);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Section title="Freerange team">
      <Card tint={c.surfaceAlt}>
        <T v="caption">Badges come off every listing at once. The creator can apply again from Studio.</T>
        <Field label="Note (kept with the decision)" value={note} onChangeText={setNote} placeholder="Website no longer belongs to this creator" />
        {error ? <T v="caption" color={c.danger}>{error}</T> : null}
        <Row wrap style={{ justifyContent: 'flex-end' }}>
          {store.verified ? <Button size="sm" kind="danger" title="Remove verified badge" loading={busy === 'verified'} onPress={() => revoke('verified')} /> : null}
          {store.esaStates.length ? <Button size="sm" kind="danger" title="Remove ESA vendor status" loading={busy === 'esa'} onPress={() => revoke('esa')} /> : null}
        </Row>
      </Card>
    </Section>
  );
}
