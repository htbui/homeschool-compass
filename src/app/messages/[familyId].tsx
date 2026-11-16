import { Stack as RouterStack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewInstance } from 'react-native';

import { needsAccount } from '@/components/AccountNote';
import { useMeetupTips } from '@/components/community/SafetyTips';
import { goBackOr } from '@/components/HeaderBack';
import { VerifiedBadge } from '@/components/community/VerifiedBadge';
import { ReportSheet } from '@/components/market/ReportSheet';
import { formatDate } from '@/lib/dates';
import { myConnections, type Connection } from '@/services/communityApi';
import { onMessage, refreshConversations } from '@/services/inbox';
import { blockFamily, markConversationRead, messagesLive, sendMessage, threadMessages, unblockFamily, type Message } from '@/services/messagesApi';
import type { ReportTarget } from '@/services/marketApi';
import { useInbox } from '@/store/useInbox';
import { useStore } from '@/store/useStore';
import { Button, Card, Empty, Field, Row, Screen, space, T, useColors, useConfirm } from '@/ui';

const MAX = 2000;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** One conversation with a connected family, or with a family about a used curriculum one of you is selling. */
export default function Thread() {
  const c = useColors();
  const { familyId } = useLocalSearchParams<{ familyId: string }>();
  const convo = useInbox((s) => s.conversations.find((x) => x.familyId === familyId));
  const tipsSeen = useStore((s) => !!s.meetupTipsSeenAt);
  const [connection, setConnection] = useState<Connection | null | undefined>();
  const [loaded, setLoaded] = useState<{ cid: string; list: Message[] } | undefined>();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  const scroll = useRef<ScrollViewInstance>(null);
  const tips = useMeetupTips();
  const confirm = useConfirm();
  const live = messagesLive();
  const conversationId = convo?.conversationId;
  const messages = !conversationId ? [] : loaded?.cid === conversationId ? loaded.list : undefined;

  // Who this is (works before the first message, too).
  useEffect(() => {
    if (!live) return;
    let alive = true;
    myConnections()
      .then((all) => alive && setConnection(all.find((k) => k.familyId === familyId && k.status === 'accepted') ?? null))
      .catch(() => alive && setConnection(null));
    return () => {
      alive = false;
    };
  }, [familyId, live, convo?.blocked]);

  // Load the conversation, and reload when a message arrives; opening it marks it read.
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    const load = () =>
      threadMessages(conversationId)
        .then((m) => {
          if (!alive) return;
          setLoaded({ cid: conversationId, list: m });
          markConversationRead(conversationId).then(refreshConversations).catch(() => {});
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    load();
    const off = onMessage((cid) => cid === conversationId && load());
    return () => {
      alive = false;
      off();
    };
  }, [conversationId]);

  if (!live) {
    return (
      <Screen edges={[]}>
        <Empty icon="💬" title="Messages need an account" body={needsAccount('Sign in to message families you’ve connected with.', 'Messages turn on when this app is connected to the Freerange service.')} action={<Button title="Back" onPress={() => goBackOr('/messages/thread')} />} />
      </Screen>
    );
  }

  const name = convo?.displayName ?? connection?.displayName ?? 'Family';
  const verified = convo?.verified ?? connection?.verified ?? false;
  const blocked = !!convo?.blocked;
  const canMessage = convo ? convo.canMessage : !!connection;
  const loading = messages === undefined || (!convo && connection === undefined);

  const send = async () => {
    const body = draft.trim();
    if (!body || !familyId) return;
    setSending(true);
    setError('');
    try {
      const sent = await sendMessage(familyId, body);
      setDraft('');
      setLoaded((l) => ({ cid: sent.conversationId, list: [...(l?.cid === sent.conversationId ? l.list : []), { id: sent.id, fromMe: true, body, hidden: false, at: sent.at }] }));
      await refreshConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = () =>
    blocked
      ? unblockFamily(familyId!).then(refreshConversations).catch((e) => setError(e.message))
      : confirm.ask(`Block ${name}?`, () => blockFamily(familyId!).then(refreshConversations).catch((e) => setError(e.message)), {
          confirm: 'Block',
          body: 'You won’t get messages or connection requests from each other, and your connection ends (they lose your contact details). They aren’t told. You can unblock later.',
        });

  return (
    <Screen edges={['bottom']} scroll={false} padded={false}>
      <RouterStack.Screen options={{ title: name }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm }}>
          <Row wrap style={{ justifyContent: 'space-between' }}>
            <Row wrap gap={6} style={{ flex: 1 }}>
              <T v="heading">{name}</T>
              {verified ? <VerifiedBadge /> : null}
            </Row>
            <Button size="sm" kind="ghost" title={blocked ? 'Unblock' : 'Block'} onPress={toggleBlock} />
          </Row>
          {convo?.listingId ? (
            <Card tint={c.surfaceAlt} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: convo.listingId! } })} label={`About ${convo.listingTitle ?? 'a listing'}. Open the listing`}>
              <T v="caption">
                🏷️ About {convo.seller ? 'their' : 'your'} listing “{convo.listingTitle ?? 'a curriculum'}” ›
              </T>
            </Card>
          ) : null}
          {!tipsSeen ? (
            <Card tint={c.accentSoft}>
              <Row wrap style={{ justifyContent: 'space-between' }}>
                <T v="caption" style={{ flex: 1, minWidth: 180 }}>🛟 Planning a first meetup? Read our quick safety tips first.</T>
                <Button size="sm" kind="secondary" title="Safety tips" onPress={tips.show} />
              </Row>
            </Card>
          ) : null}
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.sm }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {loading ? <T muted>Loading…</T> : null}
          {messages && messages.length === 0 && !loading ? (
            <T muted style={{ textAlign: 'center', marginTop: space.xl }}>
              {canMessage ? `Say hello to ${name}! Only your two families can read this conversation.` : ''}
            </T>
          ) : null}
          {(messages ?? []).map((m, i, all) => {
            const day = m.at.slice(0, 10);
            const showDay = i === 0 || all[i - 1].at.slice(0, 10) !== day;
            return (
              <View key={m.id} style={{ gap: 4 }}>
                {showDay ? <T v="caption" muted style={{ textAlign: 'center' }}>{formatDate(day)}</T> : null}
                <View
                  style={{
                    alignSelf: m.fromMe ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    backgroundColor: m.fromMe ? c.primary : c.surface,
                    borderColor: c.border,
                    borderWidth: m.fromMe ? 0 : 1,
                    borderRadius: 16,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    opacity: m.hidden ? 0.6 : 1,
                  }}>
                  <T color={m.fromMe ? c.primaryText : c.text}>{m.body}</T>
                  <T v="caption" color={m.fromMe ? c.primaryText : c.textMuted}>
                    {clock(m.at)}
                    {m.hidden ? ' · hidden by a moderator' : ''}
                  </T>
                </View>
                {!m.fromMe ? (
                  <View style={{ alignSelf: 'flex-start' }}>
                    <Button size="sm" kind="ghost" title="Report" accessibilityLabel="Report this message" onPress={() => setReporting({ kind: 'message', id: m.id })} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: 4, borderTopWidth: 1, borderColor: c.border, paddingTop: space.sm }}>
          {error ? <T v="caption" color={c.danger}>{error}</T> : null}
          {canMessage && !blocked ? (
            <Row align="flex-end" gap={space.sm}>
              <View style={{ flex: 1 }}>
                <Field placeholder={`Message ${name}`} multiline value={draft} onChangeText={(t) => setDraft(t.slice(0, MAX))} accessibilityLabel="Message" />
              </View>
              <Button title="Send" loading={sending} disabled={!draft.trim()} onPress={send} />
            </Row>
          ) : (
            <T v="caption" muted>
              {blocked ? `You blocked ${name}. Unblock to message again.` : `You can message ${name} while you’re connected.`}
            </T>
          )}
          {draft.length > MAX - 200 ? <T v="caption" muted>{MAX - draft.length} characters left</T> : null}
        </View>
      </KeyboardAvoidingView>
      <ReportSheet target={reporting} name={`A message from ${name}`} onClose={() => setReporting(undefined)} />
      {tips.element}
      {confirm.element}
    </Screen>
  );
}
