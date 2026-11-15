import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { formatDate } from '@/lib/dates';
import { stateList } from '@/lib/creators';
import { badgeQueue, decideBadge, type BadgeQueueItem } from '@/services/creatorApi';
import { isModerator, moderate, moderationQueue, type QueueItem, type ReportReason } from '@/services/marketApi';
import { useAccount } from '@/store/useAccount';
import { Button, Card, Empty, Field, Pill, Row, Screen, Section, Segmented, Stack, T, useColors } from '@/ui';

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
  const [apps, setApps] = useState<BadgeQueueItem[] | null>(null);
  const [tab, setTab] = useState<'reports' | 'badges'>('reports');
  const [error, setError] = useState('');

  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await isModerator();
      const [queue, badges] = ok ? await Promise.all([moderationQueue(), badgeQueue()]) : [[], []];
      return { ok, queue, badges };
    })()
      .then((r) => {
        if (!alive) return;
        setAllowed(r.ok);
        setItems(r.queue);
        setApps(r.badges);
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
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'reports', label: `🚩 Reports${items?.length ? ` (${items.length})` : ''}` },
          { value: 'badges', label: `✓ Badge applications${apps?.length ? ` (${apps.length})` : ''}` },
        ]}
      />
      {error ? <T color={c.danger}>{error}</T> : null}
      {tab === 'badges' ? (
        <Section title={apps ? `Waiting for review (${apps.length})` : 'Waiting for review'} subtitle="Creators asking for the verified badge or an ESA vendor listing. Approving adds the badge to every listing they sell." action={<Button size="sm" kind="secondary" title="Refresh" onPress={load} />}>
          {apps === null ? (
            <T muted>Loading…</T>
          ) : apps.length === 0 ? (
            <Empty icon="✅" title="No applications" body="New applications show up here." />
          ) : (
            <Stack>
              {apps.map((a) => (
                <BadgeCard key={a.id} app={a} onDone={load} />
              ))}
            </Stack>
          )}
        </Section>
      ) : (
        <>
          <T muted>Reports from families and creators. Three reports from different people hide an item until you decide.</T>
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
        </>
      )}
    </Screen>
  );
}

/** One creator's application: what they told us, and approve or decline. */
function BadgeCard({ app: a, onDone }: { app: BadgeQueueItem; onDone: () => void }) {
  const c = useColors();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const act = async (decision: 'approve' | 'decline') => {
    setBusy(decision);
    setError('');
    try {
      await decideBadge(a.id, decision, note);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const fact = (label: string, value?: string) => (value ? <T v="caption"><T v="caption" style={{ fontWeight: '700' }}>{label}:</T> {value}</T> : null);
  return (
    <Card>
      <Row wrap gap={6}>
        <Pill text={a.badge === 'verified' ? '✓ Verified creator' : '🏛️ ESA vendor'} bg={c.primarySoft} fg={c.text} />
        <Pill text={a.sellerType === 'publisher' ? '🏢 Publisher' : '🎨 Independent creator'} />
        {a.verified ? <Pill text="Already verified" bg={c.successSoft} fg={c.success} /> : null}
        {a.esaStates.length ? <Pill text={`ESA now: ${a.esaStates.join(', ')}`} /> : null}
      </Row>
      <T v="heading">{a.creatorName}</T>
      <T v="caption" muted>{a.listingCount} active listing{a.listingCount === 1 ? '' : 's'} · applied {formatDate(a.createdAt.slice(0, 10), { month: 'short', day: 'numeric' })}{a.creatorWebsite ? ` · profile site ${a.creatorWebsite}` : ''}</T>
      {a.creatorBio ? <T v="caption">“{a.creatorBio}”</T> : null}
      <Stack gap={4}>
        {fact(a.badge === 'esa' ? 'Business name (W-9)' : 'Who they are', a.legalName)}
        {fact('Website or portfolio', a.website)}
        {fact(a.badge === 'esa' ? 'Notes' : 'How they made their curricula', a.about)}
        {fact('Sample', a.sampleUrl)}
        {a.badge === 'esa' ? fact('Approved in', stateList(a.states)) : null}
        {fact('Vendor IDs or links', a.vendorInfo)}
      </Stack>
      <Row>
        <Button size="sm" kind="ghost" title="Open their storefront" onPress={() => router.push({ pathname: '/creator/[id]', params: { id: a.userId } })} />
      </Row>
      <T v="caption" muted>{a.badge === 'esa' ? 'Check each state program’s public vendor list before approving.' : 'Check that the website or portfolio is really theirs and matches the curricula they sell.'}</T>
      <Field label="Note to the creator (kept with the decision)" value={note} onChangeText={setNote} placeholder={a.badge === 'esa' ? 'Found you on the AZ vendor list' : 'Portfolio matches; welcome!'} />
      {error ? <T v="caption" color={c.danger}>{error}</T> : null}
      <Row wrap style={{ justifyContent: 'flex-end' }}>
        <Button size="sm" kind="ghost" title="Decline" loading={busy === 'decline'} onPress={() => act('decline')} />
        <Button size="sm" title="Approve" loading={busy === 'approve'} onPress={() => act('approve')} />
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
        <Pill text={item.kind === 'listing' ? '📦 Listing' : '💬 Review'} />
        <Pill text={hidden ? '🙈 Hidden now' : '👀 Visible'} bg={hidden ? c.accentSoft : c.primarySoft} fg={c.text} />
        <Pill text={`${item.count} report${item.count === 1 ? '' : 's'}`} />
      </Row>
      <T v="heading">{item.kind === 'review' ? `Review on “${item.title}”` : item.title}</T>
      <T v="caption" muted>{item.kind === 'review' ? `By ${item.owner}` : `Seller: ${item.owner}`} · latest {formatDate(item.latest.slice(0, 10), { month: 'short', day: 'numeric' })}</T>
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
        {hidden ? <Button size="sm" kind="secondary" title="Keep hidden" loading={busy === 'hide'} onPress={() => act('hide')} /> : <Button size="sm" kind="danger" title={item.kind === 'listing' ? 'Take it down' : 'Hide review'} loading={busy === 'hide'} onPress={() => act('hide')} />}
      </Row>
    </Card>
  );
}
