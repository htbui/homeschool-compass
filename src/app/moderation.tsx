import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { formatDate } from '@/lib/dates';
import { isModerator, moderate, moderationQueue, type QueueItem, type ReportReason } from '@/services/marketApi';
import { decideVerification, verificationQueue, type VerificationRequest } from '@/services/verification';
import { useAccount } from '@/store/useAccount';
import { Button, Card, Empty, Field, Pill, Row, Screen, Section, Stack, T, useColors } from '@/ui';

const KIND_LABEL: Record<QueueItem['kind'], string> = { listing: '📦 Listing', review: '💬 Review', message: '✉️ Message' };
const HIDE_LABEL: Record<QueueItem['kind'], string> = { listing: 'Take it down', review: 'Hide review', message: 'Hide message' };

const REASON_LABEL: Record<ReportReason, string> = {
  copyright: '©️ Copyright / license',
  inappropriate: '🚫 Not appropriate',
  misleading: '🤔 Misleading',
  spam: '📣 Spam or scam',
  personal_info: '🔒 Private information',
  other: 'Other',
};

/** The moderators' queue: everything with open reports, copyright claims first. */
export default function Moderation() {
  const c = useColors();
  const userId = useAccount((s) => s.userId);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [error, setError] = useState('');

  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await isModerator();
      return { ok, queue: ok ? await moderationQueue() : [], requests: ok ? await verificationQueue() : [] };
    })()
      .then((r) => {
        if (!alive) return;
        setAllowed(r.ok);
        setItems(r.queue);
        setRequests(r.requests);
        setError('');
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [userId, tick]);

  if (allowed === false) {
    return (
      <Screen edges={[]}>
        <Empty icon="🔒" title="Moderators only" body="This page is for the Freerange team." action={<Button title="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }
  return (
    <Screen edges={[]}>
      <T v="display">Moderation</T>
      <T muted>Reports from families and creators. Three reports from different people hide an item until you decide.</T>
      {error ? <T color={c.danger}>{error}</T> : null}
      <Section title={items ? `Open reports (${items.length})` : 'Open reports'} action={<Button size="sm" kind="secondary" title="Refresh" onPress={load} />}>
        {items === null ? (
          <T muted>Loading…</T>
        ) : items.length === 0 ? (
          <Empty icon="✅" title="Nothing to review" body="New reports show up here." />
        ) : (
          <Stack>
            {items.map((it) => (
              <QueueCard key={`${it.kind}:${it.id}`} item={it} onDone={load} />
            ))}
          </Stack>
        )}
      </Section>
      {requests.length ? (
        <Section title={`Verification requests (${requests.length})`} subtitle="Check each family (for example a short video call with a parent) before marking it verified.">
          <Stack>
            {requests.map((r) => (
              <VerificationCard key={r.familyId} request={r} onDone={load} />
            ))}
          </Stack>
        </Section>
      ) : null}
    </Screen>
  );
}

function VerificationCard({ request: r, onDone }: { request: VerificationRequest; onDone: () => void }) {
  const c = useColors();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const decide = async (decision: 'verified' | 'declined') => {
    setBusy(decision);
    setError('');
    try {
      await decideVerification(r.familyId, decision, note);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const day = (iso: string) => formatDate(iso.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <Card>
      <Row wrap gap={6}>
        <Pill text="🛡️ Verification" />
        <Pill text={r.emailVerified ? '✉️ Email confirmed' : '✉️ Email not confirmed'} bg={r.emailVerified ? c.primarySoft : c.accentSoft} fg={c.text} />
      </Row>
      <T v="heading">{r.displayName}</T>
      <T v="caption" muted>Asked {day(r.requestedAt)} · on Freerange since {day(r.familySince)} · {r.connections} connection{r.connections === 1 ? '' : 's'}</T>
      {r.bio ? <T v="caption">{r.bio}</T> : null}
      {r.note ? <T v="caption">“{r.note}”</T> : null}
      <T v="caption">Reach them: {[r.contact, r.emails].filter(Boolean).join(' · ') || 'no contact details'}</T>
      <Field label="Note (kept with the decision)" value={note} onChangeText={setNote} placeholder="Video call with parent, 11/14" />
      {error ? <T v="caption" color={c.danger}>{error}</T> : null}
      <Row wrap style={{ justifyContent: 'flex-end' }}>
        <Button size="sm" kind="ghost" title="Not yet" loading={busy === 'declined'} onPress={() => decide('declined')} />
        <Button size="sm" title="Mark verified" loading={busy === 'verified'} onPress={() => decide('verified')} />
      </Row>
    </Card>
  );
}

function QueueCard({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const c = useColors();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const hidden = item.state === 'suspended' || item.state === 'hidden';
  const act = async (action: 'hide' | 'restore' | 'dismiss') => {
    setBusy(action);
    setError('');
    try {
      await moderate(item, action, note);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Card tint={item.reasons.includes('copyright') ? c.accentSoft : undefined}>
      <Row wrap gap={6}>
        <Pill text={KIND_LABEL[item.kind]} />
        <Pill text={hidden ? '🙈 Hidden now' : '👀 Visible'} bg={hidden ? c.accentSoft : c.primarySoft} fg={c.text} />
        <Pill text={`${item.count} report${item.count === 1 ? '' : 's'}`} />
      </Row>
      <T v="heading">{item.kind === 'review' ? `Review on “${item.title}”` : item.title}</T>
      <T v="caption" muted>{item.kind === 'listing' ? `Seller: ${item.owner}` : `By ${item.owner}`} · latest {formatDate(item.latest.slice(0, 10), { month: 'short', day: 'numeric' })}</T>
      {item.excerpt ? <T v="caption">“{item.excerpt}”</T> : null}
      <Stack gap={4}>
        {item.reports.map((r, i) => (
          <T key={`${r.at}-${i}`} v="caption">
            <T v="caption" style={{ fontWeight: '700' }}>{REASON_LABEL[r.reason]}</T>
            {r.details ? ` — ${r.details}` : ''}
            {r.contact ? ` · contact: ${r.contact}` : ''}
          </T>
        ))}
      </Stack>
      {item.listingId ? (
        <Row>
          <Button size="sm" kind="ghost" title="Open the listing" onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.listingId! } })} />
        </Row>
      ) : null}
      <Field label="Note (kept with the decision)" value={note} onChangeText={setNote} placeholder="Copyright claim upheld: chapters 1–3 copied" />
      {error ? <T v="caption" color={c.danger}>{error}</T> : null}
      <Row wrap style={{ justifyContent: 'flex-end' }}>
        <Button size="sm" kind="ghost" title={hidden ? 'Dismiss and show it again' : 'Dismiss'} loading={busy === 'dismiss'} onPress={() => act('dismiss')} />
        {hidden ? <Button size="sm" kind="secondary" title="Keep hidden" loading={busy === 'hide'} onPress={() => act('hide')} /> : <Button size="sm" kind="danger" title={HIDE_LABEL[item.kind]} loading={busy === 'hide'} onPress={() => act('hide')} />}
      </Row>
    </Card>
  );
}
