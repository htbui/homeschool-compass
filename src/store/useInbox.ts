import { create } from 'zustand';

import type { ConversationSummary, ModerationEvent, UpcomingEvent } from '@/lib/notifications';

/** Live (signed-in) inbox: conversations, moderators' decisions, and field trips the family is going to. */
interface InboxState {
  conversations: ConversationSummary[];
  decisions: ModerationEvent[];
  going: UpcomingEvent[];
  loaded: boolean;
}

export const emptyInbox = (): InboxState => ({ conversations: [], decisions: [], going: [], loaded: false });

export const useInbox = create<InboxState>()(() => emptyInbox());

export const selectUnreadMessages = (s: InboxState) => s.conversations.reduce((n, c) => n + (c.blocked ? 0 : c.unread), 0);
