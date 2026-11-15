import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { todayKey } from '@/lib/dates';
import { useAccount } from '@/store/useAccount';
import { emptyInbox, useInbox } from '@/store/useInbox';

import { supabase } from './cloud';
import { nearbyEvents } from './communityApi';
import { messagesLive, moderationEvents, myConversations } from './messagesApi';

/**
 * Keeps the signed-in parent's inbox fresh: conversations (with unread
 * counts) and moderators' decisions update in real time, like workspace sync,
 * with a slow poll as a fallback. Runs only while a parent screen is open, so
 * kid mode never receives messages.
 */

let channel: RealtimeChannel | null = null;
let poll: ReturnType<typeof setInterval> | null = null;
let users = 0;
const listeners = new Set<(conversationId: string) => void>();

/** Hear about new or changed messages (the thread screen uses this). */
export function onMessage(fn: (conversationId: string) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function refreshConversations() {
  if (!messagesLive()) return;
  const conversations = await myConversations().catch(() => undefined);
  if (conversations) useInbox.setState({ conversations, loaded: true });
}

async function refreshDecisions() {
  const decisions = await moderationEvents().catch(() => undefined);
  if (decisions) useInbox.setState({ decisions });
}

async function refreshGoing() {
  const events = await nearbyEvents(25).catch(() => undefined);
  if (events) useInbox.setState({ going: events.filter((e) => e.iAmGoing && e.date >= todayKey()).map((e) => ({ id: e.id, title: e.title, date: e.date, location: e.location })) });
}

export async function refreshInbox() {
  if (!messagesLive()) return;
  await Promise.all([refreshConversations(), refreshDecisions(), refreshGoing()]);
}

function start(familyId: string) {
  if (!supabase) return;
  refreshInbox();
  channel = supabase
    .channel(`inbox:${familyId}`)
    // Row-level security limits these to this family's own conversations and decisions.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      const row = (payload.new ?? payload.old) as { conversation_id?: string };
      refreshConversations();
      if (row?.conversation_id) listeners.forEach((fn) => fn(row.conversation_id!));
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moderation_events' }, () => refreshDecisions())
    .subscribe();
  poll = setInterval(() => refreshInbox(), 60_000);
}

function stop() {
  channel?.unsubscribe();
  channel = null;
  if (poll) clearInterval(poll);
  poll = null;
  useInbox.setState(emptyInbox());
}

/** Keep the inbox live while this component is mounted (parent screens only). */
export function useInboxLive(enabled = true) {
  const familyId = useAccount((s) => (s.userId && !s.conflict ? s.familyId : undefined));
  const on = enabled && !!supabase && !!familyId;
  useEffect(() => {
    if (!on || !familyId) return;
    if (users++ === 0) start(familyId);
    return () => {
      if (--users === 0) stop();
    };
  }, [on, familyId]);
}
