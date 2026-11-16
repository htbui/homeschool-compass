import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useMeetupTips } from '@/components/community/SafetyTips';
import { VerifiedBadge } from '@/components/community/VerifiedBadge';
import { timeAgo } from '@/lib/notifications';
import { cloudEnabled } from '@/services/cloud';
import { myConnections, type Connection } from '@/services/communityApi';
import { refreshConversations } from '@/services/inbox';
import { myBlocks, unblockFamily } from '@/services/messagesApi';
import { useAccount } from '@/store/useAccount';
import { useInbox } from '@/store/useInbox';
import { useStore } from '@/store/useStore';
import { Button, Card, Empty, Pill, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

const openThread = (familyId: string) => router.push({ pathname: '/messages/[familyId]', params: { familyId } });

/** Conversations with connected families, newest first. */
export default function Messages() {
  const c = useColors();
  const live = useAccount((s) => cloudEnabled && !!s.userId && !!s.familyId && !s.conflict);
  const conversations = useInbox((s) => s.conversations);
  const loaded = useInbox((s) => s.loaded);
  const [connections, setConnections] = useState<Connection[] | undefined>();
  const [blocks, setBlocks] = useState<Awaited<ReturnType<typeof myBlocks>>>([]);
  const [error, setError] = useState('');
  const tips = useMeetupTips();
  const tipsSeen = useStore((s) => !!s.meetupTipsSeenAt);

  useFocusEffect(
    useCallback(() => {
      if (!live) return;
      let alive = true;
      refreshConversations();
      myConnections()
        .then((x) => alive && setConnections(x.filter((k) => k.status === 'accepted')))
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
      myBlocks()
        .then((b) => alive && setBlocks(b))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [live]),
  );

  if (!live) {
    return (
      <Screen edges={[]}>
        <Empty
          icon="💬"
          title="Messages need an account"
          body={
            cloudEnabled
              ? 'Sign in to message families you’ve connected with in Community. Messages are private between your two families.'
              : 'Messages turn on when this app is connected to the Freerange service. Everything else keeps working on this device.'
          }
          action={cloudEnabled ? <Button title="Sign in or create an account" onPress={() => router.push('/account')} /> : undefined}
        />
      </Screen>
    );
  }

  const talking = new Set(conversations.map((x) => x.familyId));
  const fresh = (connections ?? []).filter((k) => !talking.has(k.familyId));

  return (
    <Screen edges={[]}>
      <T muted>Private messages with families you’ve connected with, or about a used curriculum you’re buying or selling. Only your two families can read them.</T>
      {/* Until they're read once; after that they're in each conversation's ⋯ menu. */}
      {!tipsSeen ? (
        <Row wrap style={{ marginTop: space.sm }}>
          <Button size="sm" kind="ghost" icon="🛟" title="Meetup safety tips" onPress={tips.show} />
        </Row>
      ) : null}
      {error ? <T color={c.danger}>{error}</T> : null}

      <Section title="Conversations">
        {!loaded ? (
          <T muted>Loading…</T>
        ) : conversations.length === 0 ? (
          <Empty icon="💬" title="No messages yet" body="Connect with a family in Community, then say hello here." action={<Button kind="secondary" title="Find families" onPress={() => router.navigate('/community')} />} />
        ) : (
          <Stack gap={space.sm}>
            {conversations.map((x) => (
              <Card key={x.conversationId} tint={x.unread ? c.primarySoft : undefined} onPress={() => openThread(x.familyId)}>
                <Row wrap style={{ justifyContent: 'space-between' }}>
                  <Row wrap gap={6} style={{ flex: 1 }}>
                    <T v="heading">{x.displayName}</T>
                    {x.verified ? <VerifiedBadge /> : null}
                    {x.blocked ? <Pill text="Blocked" /> : null}
                  </Row>
                  {x.unread ? <Pill text={`${x.unread} new`} bg={c.primary} fg={c.primaryText} /> : null}
                </Row>
                {x.listingTitle ? <T v="caption" muted numberOfLines={1}>🏷️ About “{x.listingTitle}”</T> : null}
                {x.lastBody ? (
                  <T v="caption" numberOfLines={2}>
                    {x.lastFromMe ? 'You: ' : ''}
                    {x.lastBody}
                  </T>
                ) : null}
                {x.lastAt ? <T v="caption" muted>{timeAgo(x.lastAt)}</T> : null}
              </Card>
            ))}
          </Stack>
        )}
      </Section>

      {fresh.length ? (
        <Section title="Say hello" subtitle="Families you’re connected with but haven’t messaged yet.">
          <Stack gap={space.sm}>
            {fresh.map((k) => (
              <Card key={k.familyId}>
                <Row wrap style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, minWidth: 160, gap: 2 }}>
                    <Row wrap gap={6}>
                      <T v="heading">{k.displayName}</T>
                      {k.verified ? <VerifiedBadge /> : null}
                    </Row>
                    <T v="caption" muted>{k.band}</T>
                  </View>
                  <Button size="sm" title="Message" onPress={() => openThread(k.familyId)} />
                </Row>
              </Card>
            ))}
          </Stack>
        </Section>
      ) : null}
      {blocks.length ? (
        <Section title="Blocked families" subtitle="They can’t message you, send requests, or see you in the finder. They aren’t told.">
          <Stack gap={space.sm}>
            {blocks.map((b) => (
              <Card key={b.familyId}>
                <Row wrap style={{ justifyContent: 'space-between' }}>
                  <T v="heading" style={{ flex: 1, minWidth: 140 }}>{b.displayName}</T>
                  <Button
                    size="sm"
                    kind="secondary"
                    title="Unblock"
                    accessibilityLabel={`Unblock ${b.displayName}`}
                    onPress={() =>
                      unblockFamily(b.familyId)
                        .then(refreshConversations)
                        .then(() => myBlocks().then(setBlocks))
                        .catch((e: Error) => setError(e.message))
                    }
                  />
                </Row>
              </Card>
            ))}
          </Stack>
        </Section>
      ) : null}
      {tips.element}
    </Screen>
  );
}
