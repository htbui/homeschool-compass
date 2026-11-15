import { describe, expect, it } from 'vitest';

import {
  arrangeNotices,
  eventNotices,
  helpNotices,
  messageNotices,
  moderationNotice,
  planNotices,
  pruneRead,
  timeAgo,
  type ConversationSummary,
} from '../notifications';
import type { Child, Curriculum, HelpRequest, Task } from '../types';

const kid = { id: 'k1', name: 'Maya', avatar: '🦉' } as Child;
const task = { id: 't1', title: 'Fractions' } as Task;

describe('help requests', () => {
  it('lists open requests with the kid, task, and note', () => {
    const help: HelpRequest[] = [
      { id: 'h1', childId: 'k1', taskId: 't1', note: 'Stuck on #4', createdAt: '2026-11-14T10:00:00Z' },
      { id: 'h2', childId: 'k1', createdAt: '2026-11-14T09:00:00Z', resolvedAt: '2026-11-14T09:05:00Z' },
    ];
    const [n, ...rest] = helpNotices(help, [kid], [task]);
    expect(rest).toEqual([]);
    expect(n).toMatchObject({ id: 'help:h1', title: '🦉 Maya needs help', body: 'Fractions · “Stuck on #4”', link: { to: 'today' } });
  });
});

describe('events', () => {
  it('announces trips from today through the next week', () => {
    const events = [
      { id: 'e1', title: 'Zoo', date: '2026-11-14', location: 'City Zoo' },
      { id: 'e2', title: 'Museum', date: '2026-11-21', location: '' },
      { id: 'e3', title: 'Farm', date: '2026-11-22', location: 'Farm' },
      { id: 'e4', title: 'Past', date: '2026-11-13', location: 'Park' },
    ];
    const out = eventNotices(events, '2026-11-14');
    expect(out.map((n) => n.id)).toEqual(['event:e1:2026-11-14', 'event:e2:2026-11-21']);
    expect(out[0].body).toBe('Today · 📍 City Zoo');
  });
});

describe('plan updates', () => {
  const curricula = [{ id: 'c1', name: 'Pond Life' }, { id: 'c2', name: 'My Math' }] as Curriculum[];
  it('tells releases and Studio edits apart', () => {
    const out = planNotices({ c1: { key: '3', source: 'release', version: 3 }, c2: { key: '2026-11-14T08:00:00Z', source: 'studio' }, gone: { key: '1', source: 'release' } }, curricula);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'plan:c1:3', title: 'Update available: Pond Life', at: undefined, link: { to: 'learn', curriculumId: 'c1' } });
    expect(out[1]).toMatchObject({ title: 'My Math changed in Studio', at: '2026-11-14T08:00:00Z' });
  });
});

describe('messages', () => {
  const convo = (p: Partial<ConversationSummary>): ConversationSummary => ({
    conversationId: 'cv1', familyId: 'f2', displayName: 'Sarah K.', verified: false, lastBody: 'See you Tuesday!', lastAt: '2026-11-14T10:00:00Z', lastFromMe: false, unread: 2, canMessage: true, blocked: false, ...p,
  });
  it('one notification per conversation with unread messages, new again after each message', () => {
    const [n] = messageNotices([convo({}), convo({ conversationId: 'cv2', unread: 0 }), convo({ conversationId: 'cv3', blocked: true })]);
    expect(messageNotices([convo({}), convo({ conversationId: 'cv2', unread: 0 })])).toHaveLength(1);
    expect(n).toMatchObject({ title: '2 new messages from Sarah K.', body: 'See you Tuesday!', link: { to: 'thread', familyId: 'f2' }, conversationId: 'cv1' });
    expect(messageNotices([convo({ lastAt: '2026-11-14T11:00:00Z', unread: 1 })])[0].id).not.toBe(n.id);
    expect(messageNotices([convo({ unread: 1 })])[0].title).toBe('1 new message from Sarah K.');
  });
});

describe('moderation decisions', () => {
  const ev = (p: object) => ({ id: 'm1', targetKind: 'listing', targetId: 'l1', action: 'hidden', title: 'Pond Days', at: '2026-11-14T10:00:00Z', ...p }) as Parameters<typeof moderationNotice>[0];
  it('explain what happened in plain words', () => {
    expect(moderationNotice(ev({})).title).toBe('A moderator hid your listing “Pond Days”');
    expect(moderationNotice(ev({ action: 'auto_hidden' })).title).toBe('Your listing “Pond Days” is hidden for review');
    expect(moderationNotice(ev({ targetKind: 'review', action: 'restored' })).title).toBe('A moderator restored your review of “Pond Days”');
    expect(moderationNotice(ev({ targetKind: 'message', title: 'Hey there' }))).toMatchObject({ title: 'A moderator hid one of your messages', link: { to: 'messages' } });
    expect(moderationNotice(ev({ targetKind: 'verification', action: 'verified' })).title).toBe('Your family is verified');
    expect(moderationNotice(ev({ targetKind: 'verification', action: 'declined' })).body).toMatch(/ask again tomorrow/);
  });
});

describe('arranging and read marks', () => {
  it('puts unread first, newest first, and counts unread', () => {
    const a = { id: 'a', kind: 'help', icon: '', title: 'a', at: '2026-11-14T08:00:00Z', link: { to: 'today' } } as const;
    const b = { ...a, id: 'b', at: '2026-11-14T09:00:00Z' };
    const c = { ...a, id: 'c', at: undefined };
    const { items, unread } = arrangeNotices([a, b, c], { b: '2026-11-14T09:30:00Z' }, '2026-11-14T12:00:00Z');
    expect(items.map((n) => n.id)).toEqual(['c', 'a', 'b']);
    expect(unread).toBe(2);
  });
  it('forgets old read marks', () => {
    const now = Date.parse('2026-11-14T00:00:00Z');
    expect(pruneRead({ old: '2026-07-01T00:00:00Z', fresh: '2026-11-01T00:00:00Z' }, now)).toEqual({ fresh: '2026-11-01T00:00:00Z' });
  });
  it('says how long ago', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    expect(timeAgo('2026-11-14T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-14T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-14T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-13T12:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo('nope', now)).toBe('');
  });
});
