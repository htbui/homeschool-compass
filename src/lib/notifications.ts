import { addDays, relativeDayLabel } from './dates';
import type { Child, Curriculum, DateKey, HelpRequest, ID, Task } from './types';

/**
 * The parent's in-app notifications, built from things the app already knows:
 * kids asking for help, field trips the family is going to, plan updates,
 * new messages, and moderators' decisions. Nothing here is stored on its
 * own; only which notifications were read (by id) is remembered.
 */

export type NoticeKind = 'message' | 'help' | 'event' | 'plan' | 'moderation';

/** Where tapping a notification goes. */
export type NoticeLink =
  | { to: 'thread'; familyId: string }
  | { to: 'today' }
  | { to: 'community' }
  | { to: 'learn'; curriculumId: ID }
  | { to: 'market' }
  | { to: 'messages' };

export interface Notice {
  id: string;
  kind: NoticeKind;
  icon: string;
  title: string;
  body?: string;
  /** When it happened (ISO time or date), for sorting. */
  at?: string;
  link: NoticeLink;
  /** Messages: the conversation, so reading the notification also marks it read on the server. */
  conversationId?: string;
}

export interface ConversationSummary {
  conversationId: string;
  familyId: string;
  displayName: string;
  verified: boolean;
  lastBody?: string;
  lastAt?: string;
  lastFromMe: boolean;
  unread: number;
  canMessage: boolean;
  blocked: boolean;
}

export type ModerationAction = 'hidden' | 'auto_hidden' | 'restored' | 'verified' | 'declined' | 'revoked';

export interface ModerationEvent {
  id: string;
  targetKind: 'listing' | 'review' | 'message' | 'family' | 'verification';
  targetId: string;
  action: ModerationAction;
  title: string;
  at: string;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  date: DateKey;
  location: string;
}

/** Field trips are announced this many days ahead. */
export const EVENT_LEAD_DAYS = 7;

export function helpNotices(help: HelpRequest[], kids: Child[], tasks: Task[]): Notice[] {
  return help
    .filter((h) => !h.resolvedAt)
    .map((h) => {
      const kid = kids.find((k) => k.id === h.childId);
      const task = h.taskId ? tasks.find((t) => t.id === h.taskId) : undefined;
      return {
        id: `help:${h.id}`,
        kind: 'help',
        icon: '✋',
        title: `${kid ? `${kid.avatar} ${kid.name}` : 'A student'} needs help`,
        body: [task ? task.title : 'General help', h.note ? `“${h.note}”` : ''].filter(Boolean).join(' · '),
        at: h.createdAt,
        link: { to: 'today' },
      };
    });
}

/** Events the family is going to, from today through the next week. */
export function eventNotices(events: UpcomingEvent[], today: DateKey, leadDays = EVENT_LEAD_DAYS): Notice[] {
  const last = addDays(today, leadDays);
  return events
    .filter((e) => e.date >= today && e.date <= last)
    .map((e) => ({
      // The date is part of the id, so a rescheduled trip shows up again.
      id: `event:${e.id}:${e.date}`,
      kind: 'event',
      icon: '🚌',
      title: `Coming up: ${e.title}`,
      body: `${relativeDayLabel(e.date, today)}${e.location ? ` · 📍 ${e.location}` : ''}`,
      at: e.date,
      link: { to: 'community' },
    }));
}

export interface PlanUpdateSource {
  key: string;
  source: 'studio' | 'release';
  version?: number;
}

export function planNotices(updates: Record<ID, PlanUpdateSource>, curricula: Curriculum[]): Notice[] {
  return Object.entries(updates).flatMap(([id, u]) => {
    const cur = curricula.find((c) => c.id === id);
    if (!cur) return [];
    const studio = u.source === 'studio';
    return [
      {
        id: `plan:${id}:${u.key}`,
        kind: 'plan' as const,
        icon: studio ? '✏️' : '✨',
        title: studio ? `${cur.name} changed in Studio` : `Update available: ${cur.name}`,
        body: studio ? 'Review the changes before they reach your kids’ days.' : `Version ${u.version} is ready to review. Everyone keeps their place.`,
        // Studio saves have a time; releases don't, so they sort with "now".
        at: studio && /^\d{4}-/.test(u.key) ? u.key : undefined,
        link: { to: 'learn', curriculumId: id },
      },
    ];
  });
}

export function messageNotices(conversations: ConversationSummary[]): Notice[] {
  return conversations
    .filter((c) => c.unread > 0 && !c.blocked)
    .map((c) => ({
      // A newer message makes a new (unread) notification.
      id: `msg:${c.conversationId}:${c.lastAt ?? ''}`,
      kind: 'message',
      icon: '💬',
      title: `${c.unread} new message${c.unread === 1 ? '' : 's'} from ${c.displayName}`,
      body: c.lastFromMe ? undefined : c.lastBody,
      at: c.lastAt,
      link: { to: 'thread', familyId: c.familyId },
      conversationId: c.conversationId,
    }));
}

const THING: Record<'listing' | 'review' | 'message' | 'family', (title: string) => string> = {
  listing: (t) => `your listing “${t}”`,
  review: (t) => (t ? `your review of “${t}”` : 'your review'),
  message: () => 'one of your messages',
  family: () => 'your family’s community profile',
};

export function moderationNotice(e: ModerationEvent): Notice {
  const base = { id: `mod:${e.id}`, kind: 'moderation' as const, at: e.at };
  if (e.targetKind === 'verification') {
    if (e.action === 'verified') return { ...base, icon: '✅', title: 'Your family is verified', body: 'Other families now see a Verified badge next to your name.', link: { to: 'community' } };
    if (e.action === 'revoked') return { ...base, icon: '🛡️', title: 'Your Verified badge was removed', body: 'Questions? Write to support@freerangehomeschooling.com.', link: { to: 'community' } };
    return { ...base, icon: '🛡️', title: 'We couldn’t verify your family yet', body: 'You can ask again tomorrow.', link: { to: 'community' } };
  }
  const thing = THING[e.targetKind](e.title);
  const link: NoticeLink = e.targetKind === 'message' ? { to: 'messages' } : e.targetKind === 'family' ? { to: 'community' } : { to: 'market' };
  const quote = e.targetKind === 'message' && e.title ? `“${e.title}”` : undefined;
  if (e.action === 'restored') return { ...base, icon: '👍', title: `A moderator restored ${thing}`, body: quote ?? 'Everyone can see it again.', link };
  if (e.action === 'auto_hidden') return { ...base, icon: '⏸️', title: `${cap(thing)} is hidden for review`, body: 'Several families reported it. A moderator will decide soon.', link };
  return {
    ...base,
    icon: '🛑',
    title: `A moderator hid ${thing}`,
    body: [quote, 'If you think this is a mistake, write to support@freerangehomeschooling.com.'].filter(Boolean).join(' '),
    link,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type ReadNotice = Notice & { read: boolean };

/** Unread first, then newest first. Notices without a time count as "now". */
export function arrangeNotices(all: Notice[], read: Record<string, string>, now = new Date().toISOString()): { items: ReadNotice[]; unread: number } {
  const items = all
    .map((n) => ({ ...n, read: !!read[n.id] }))
    .sort((a, b) => Number(a.read) - Number(b.read) || (b.at ?? now).localeCompare(a.at ?? now));
  return { items, unread: items.filter((n) => !n.read).length };
}

/** "New" (unread) and "Earlier" (read) groups, in the order `arrangeNotices` gives; empty groups are left out. */
export function groupNotices(items: ReadNotice[]): { title: 'New' | 'Earlier'; items: ReadNotice[] }[] {
  const groups = [
    { title: 'New' as const, items: items.filter((n) => !n.read) },
    { title: 'Earlier' as const, items: items.filter((n) => n.read) },
  ];
  return groups.filter((g) => g.items.length);
}

/** Forget read marks after a while so the list of ids doesn't grow forever. */
export function pruneRead(read: Record<string, string>, now = Date.now(), maxAgeDays = 90): Record<string, string> {
  const cutoff = now - maxAgeDays * 864e5;
  return Object.fromEntries(Object.entries(read).filter(([, at]) => Date.parse(at) >= cutoff));
}

/** "just now", "5 min ago", "3 h ago", "2 days ago"; dates without a time read as days. */
export function timeAgo(at: string, now = Date.now()): string {
  const t = Date.parse(at.length === 10 ? `${at}T00:00:00` : at);
  if (Number.isNaN(t)) return '';
  const min = Math.round((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`;
  const days = Math.round(min / (60 * 24));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
