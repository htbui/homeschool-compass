import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { formatDate } from '@/lib/dates';
import { formatGiftCode, GIFT_STATUS, normalizeGiftCode, type IncomingGift, type SentGift } from '@/lib/gifts';
import { cancelGift, claimGift, incomingGifts, sentGifts } from '@/services/giftApi';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';
import { Button, Card, Field, Pill, Row, Section, space, Stack, T, useColors, useConfirm } from '@/ui';

import { money } from './PriceTag';

const day = (iso: string) => formatDate(iso.slice(0, 10), { month: 'short', day: 'numeric' });

/** Gifts: redeem a code, claim gifts sent to this family, and see what's happened to the ones you sent. */
export function GiftsPanel() {
  const c = useColors();
  const userId = useAccount((s) => s.userId);
  const localGifts = useStore((s) => s.localGifts);
  const confirm = useConfirm();
  const [incoming, setIncoming] = useState<IncomingGift[]>([]);
  const [sent, setSent] = useState<SentGift[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const [i, s] = await Promise.all([incomingGifts().catch(() => []), sentGifts().catch(() => [])]);
    setIncoming(i);
    setSent(s);
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.all([incomingGifts().catch(() => []), sentGifts().catch(() => [])]).then(([i, s]) => {
      if (!alive) return;
      setIncoming(i);
      setSent(s);
    });
    return () => {
      alive = false;
    };
  }, [userId, localGifts]);

  const claim = async (giftCode: string) => {
    setBusy(giftCode);
    setMessage(null);
    try {
      const p = await claimGift(giftCode);
      setCode('');
      setMessage({ ok: true, text: `🎉 ${p.title} is in your library${p.giftFrom ? `, a gift from ${p.giftFrom}` : ''}.` });
      await refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="🎁 Gifts" subtitle="Curricula other families gave you, and the ones you gave.">
      <Card>
        <T v="label">Have a gift code?</T>
        <Row gap={space.sm} align="flex-end">
          <Stack gap={0} style={{ flex: 1 }}>
            <Field placeholder="Gift code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoComplete="off" accessibilityLabel="Gift code" />
          </Stack>
          <Button title="Redeem" disabled={normalizeGiftCode(code).length < 6} loading={busy === code} onPress={() => claim(code)} />
        </Row>
        {message ? <T color={message.ok ? c.success : c.danger}>{message.text}</T> : null}
      </Card>
      {incoming.length ? (
        <Stack>
          <T v="label">Waiting for you</T>
          {incoming.map((g) => (
            <Card key={g.id} tint={c.successSoft}>
              <T v="heading">🎁 {g.title}</T>
              <T v="caption" muted>From {g.giverName} · {day(g.createdAt)}</T>
              {g.note ? <T>“{g.note}”</T> : null}
              <Row>
                <Button size="sm" title="Claim it" loading={busy === g.code} onPress={() => claim(g.code)} />
              </Row>
            </Card>
          ))}
        </Stack>
      ) : null}
      {sent.length ? (
        <Stack>
          <T v="label">Gifts you sent</T>
          {sent.map((g) => (
            <Card key={g.id}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <T v="heading" style={{ flex: 1 }}>{g.title}</T>
                <Pill text={GIFT_STATUS[g.status]} bg={g.status === 'claimed' ? c.successSoft : undefined} fg={g.status === 'claimed' ? c.success : undefined} />
              </Row>
              <T v="caption" muted>
                For {g.recipientLabel} · {day(g.createdAt)} · {g.price > 0 ? `${money(g.price)}${g.demo ? ' (demo)' : ''}` : 'free'}
                {g.claimedAt ? ` · claimed ${day(g.claimedAt)}` : ''}
              </T>
              {g.status === 'ready' ? <T v="caption" selectable>Code: {formatGiftCode(g.code)}</T> : null}
              <Row wrap>
                {g.listingId ? <Button size="sm" kind="ghost" title="View curriculum" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: g.listingId } })} /> : null}
                {g.status === 'ready' && g.price === 0 ? (
                  <Button size="sm" kind="ghost" title="Take back" onPress={() => confirm.ask(`Take back ${g.title}?`, () => cancelGift(g).then(refresh), { confirm: 'Take back', body: 'The code stops working.' })} />
                ) : null}
              </Row>
            </Card>
          ))}
        </Stack>
      ) : null}
      {confirm.element}
    </Section>
  );
}
