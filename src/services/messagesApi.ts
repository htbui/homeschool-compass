import type { ConversationSummary, ModerationEvent } from '@/lib/notifications';
import { useAccount } from '@/store/useAccount';

import { friendlyError, supabase } from './cloud';

/**
 * Messages between connected families (parents only). The server checks the
 * connection, blocks, and sending limits; only the two families can read a
 * conversation.
 */

export interface Message {
  id: string;
  fromMe: boolean;
  body: string;
  /** Hidden by a moderator (only the sender still sees it). */
  hidden: boolean;
  at: string;
}

const db = () => {
  if (!supabase) throw new Error('Messages need the Freerange service.');
  return supabase;
};
const fid = () => {
  const id = useAccount.getState().familyId;
  if (!id) throw new Error('Finish setting up your family first.');
  return id;
};
const check = <T,>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new Error(friendlyError(r.error));
  return r.data;
};

/** Signed in with a family, so messages and the live community work. */
export const messagesLive = () => {
  const a = useAccount.getState();
  return !!supabase && !!a.userId && !!a.familyId && !a.conflict;
};

export async function myConversations(): Promise<ConversationSummary[]> {
  const rows = check(await db().rpc('my_conversations')) as {
    conversation_id: string; family_id: string; display_name: string; verified: boolean; last_body: string | null; last_at: string | null; last_from_me: boolean | null; unread: number; can_message: boolean; blocked: boolean;
  }[];
  return rows.map((r) => ({
    conversationId: r.conversation_id,
    familyId: r.family_id,
    displayName: r.display_name,
    verified: r.verified,
    lastBody: r.last_body ?? undefined,
    lastAt: r.last_at ?? undefined,
    lastFromMe: !!r.last_from_me,
    unread: r.unread,
    canMessage: r.can_message,
    blocked: r.blocked,
  }));
}

/** The latest messages in a conversation, oldest first. */
export async function threadMessages(conversationId: string, limit = 200): Promise<Message[]> {
  const me = fid();
  const rows = check(await db().from('messages').select('id, sender_family, body, hidden, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit)) as {
    id: string; sender_family: string; body: string; hidden: boolean; created_at: string;
  }[];
  return rows.reverse().map((r) => ({ id: r.id, fromMe: r.sender_family === me, body: r.body, hidden: r.hidden, at: r.created_at }));
}

export async function sendMessage(toFamily: string, body: string): Promise<{ id: string; conversationId: string; at: string }> {
  const r = check(await db().rpc('send_message', { to_family: toFamily, body: body.trim() })) as { id: string; conversation_id: string; created_at: string };
  return { id: r.id, conversationId: r.conversation_id, at: r.created_at };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  check(await db().rpc('mark_conversation_read', { cid: conversationId }));
}

/** Block a family: no messages or connection requests either way, and the connection ends. */
export async function blockFamily(other: string): Promise<void> {
  check(await db().from('family_blocks').insert({ blocker_family: fid(), blocked_family: other }));
}

/** Families this family blocked (from a conversation, the finder, or a request), newest first. */
export async function myBlocks(): Promise<{ familyId: string; displayName: string; at: string }[]> {
  const rows = check(await db().rpc('my_blocks')) as { family_id: string; display_name: string; blocked_at: string }[];
  return rows.map((r) => ({ familyId: r.family_id, displayName: r.display_name, at: r.blocked_at }));
}

export async function unblockFamily(other: string): Promise<void> {
  check(await db().from('family_blocks').delete().eq('blocker_family', fid()).eq('blocked_family', other));
}

/** Moderators' decisions about this family's listings, reviews, messages, and verification. */
export async function moderationEvents(): Promise<ModerationEvent[]> {
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const rows = check(await db().from('moderation_events').select('id, target_kind, target_id, action, title, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(50)) as {
    id: string; target_kind: ModerationEvent['targetKind']; target_id: string; action: ModerationEvent['action']; title: string; created_at: string;
  }[];
  return rows.map((r) => ({ id: r.id, targetKind: r.target_kind, targetId: r.target_id, action: r.action, title: r.title, at: r.created_at }));
}
