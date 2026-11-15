import { useMemo } from 'react';

import { usePlanUpdates } from '@/components/PlanUpdate';
import { todayKey } from '@/lib/dates';
import { arrangeNotices, eventNotices, helpNotices, messageNotices, moderationNotice, planNotices, type Notice } from '@/lib/notifications';
import { refreshConversations } from '@/services/inbox';
import { markConversationRead, messagesLive } from '@/services/messagesApi';
import { useAccount } from '@/store/useAccount';
import { useInbox } from '@/store/useInbox';
import { useNotifications } from '@/store/useNotifications';
import { useStore } from '@/store/useStore';

/**
 * Everything for the parent's notification bell. Help requests, plan updates,
 * and field trips come from this device (so they work without an account);
 * messages and moderators' decisions come from the live inbox when signed in.
 */
export function useNotices() {
  const help = useStore((s) => s.help);
  const kids = useStore((s) => s.children);
  const tasks = useStore((s) => s.tasks);
  const curricula = useStore((s) => s.curricula);
  const localEvents = useStore((s) => s.events);
  const live = useAccount((s) => !!s.userId && !!s.familyId && !s.conflict);
  const conversations = useInbox((s) => s.conversations);
  const decisions = useInbox((s) => s.decisions);
  const going = useInbox((s) => s.going);
  const read = useNotifications((s) => s.read);
  const updates = usePlanUpdates();

  return useMemo(() => {
    const today = todayKey();
    // Signed in, the community is live and the sample field trips on this device don't count.
    const events = live && messagesLive() ? going : localEvents.filter((e) => e.going).map((e) => ({ id: e.id, title: e.title, date: e.date, location: e.location }));
    const all: Notice[] = [
      ...helpNotices(help, kids, tasks),
      ...eventNotices(events, today),
      ...planNotices(updates, curricula),
      ...messageNotices(conversations),
      ...decisions.map(moderationNotice),
    ];
    return arrangeNotices(all, read);
  }, [help, kids, tasks, curricula, localEvents, live, conversations, decisions, going, read, updates]);
}

/** Mark notifications read; reading a message notification also marks the conversation read. */
export async function markNoticesRead(notices: Notice[]) {
  useNotifications.getState().markRead(notices.map((n) => n.id));
  const convos = notices.flatMap((n) => (n.conversationId ? [n.conversationId] : []));
  if (convos.length && messagesLive()) {
    await Promise.all(convos.map((id) => markConversationRead(id).catch(() => {})));
    await refreshConversations();
  }
}
