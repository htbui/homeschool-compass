import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { markNoticesRead, useNotices } from '@/hooks/useNotices';
import { groupNotices, timeAgo, type NoticeLink, type ReadNotice } from '@/lib/notifications';
import { cloudEnabled } from '@/services/cloud';
import { useInboxLive } from '@/services/inbox';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';
import { Button, Card, Empty, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

function open(link: NoticeLink) {
  switch (link.to) {
    case 'thread':
      return router.push({ pathname: '/messages/[familyId]', params: { familyId: link.familyId } });
    case 'messages':
      return router.push('/messages');
    case 'today':
      return router.navigate('/today');
    case 'community':
      return router.navigate('/community');
    case 'learn':
      return router.navigate({ pathname: '/learn', params: { review: link.curriculumId } });
    case 'market':
      return router.navigate({ pathname: '/market', params: { view: 'selling' } });
  }
}

/** The parent's notifications center (never shown in kid mode). */
export default function Notifications() {
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);
  const signedIn = useAccount((s) => !!s.userId);
  useInboxLive(mode.kind === 'parent');
  const { items, unread } = useNotices();

  if (!family) return <Redirect href="/onboarding" />;
  if (mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;

  return (
    <Screen edges={[]}>
      <Row wrap style={{ justifyContent: 'space-between' }}>
        <T muted style={{ flex: 1, minWidth: 200 }}>
          {unread ? `${unread} unread` : 'You’re all caught up.'}
        </T>
        <Button size="sm" kind="secondary" title="Mark all read" disabled={!unread} onPress={() => markNoticesRead(items.filter((n) => !n.read))} />
      </Row>
      <View style={{ marginTop: space.lg }}>
        {items.length === 0 ? (
          <Empty
            icon="🔔"
            title="Nothing new"
            body={
              signedIn
                ? 'Help requests, messages, field trips you’re going to, plan updates, and moderators’ decisions show up here.'
                : `Help requests, field trips you’re going to, and plan updates show up here.${cloudEnabled ? ' Sign in to also get messages from other families.' : ''}`
            }
          />
        ) : (
          groupNotices(items).map((g, i) => (
            <View key={g.title} style={i ? undefined : { marginTop: -space.xl }}>
              <Section title={g.title}>
                <Stack gap={space.sm}>
                  {g.items.map((n) => (
                    <NoticeCard key={n.id} notice={n} />
                  ))}
                </Stack>
              </Section>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

/** Opening a notification marks it read (and "Mark all read" clears the rest), so rows have no button of their own. */
function NoticeCard({ notice: n }: { notice: ReadNotice }) {
  const c = useColors();
  const when = n.at && n.kind !== 'event' ? timeAgo(n.at) : '';
  return (
    <Card
      tint={n.read ? undefined : c.primarySoft}
      label={[n.read ? '' : 'Unread:', n.title, n.body, when].filter(Boolean).join(' ')}
      onPress={() => {
        markNoticesRead([n]);
        open(n.link);
      }}>
      <Row align="flex-start" gap={space.sm}>
        <T v="heading">{n.icon}</T>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label">{n.title}</T>
          {n.body ? <T v="caption" numberOfLines={3}>{n.body}</T> : null}
          {when ? <T v="caption" muted>{when}</T> : null}
        </View>
        {/* The unread dot is drawn, not a "●" character a screen reader would read out. */}
        {n.read ? null : <View accessibilityLabel="Unread" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary, marginTop: 6 }} />}
      </Row>
    </Card>
  );
}
