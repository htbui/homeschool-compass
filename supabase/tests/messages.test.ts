/// <reference types="node" />
// Messages between connected families, blocking, reporting a message,
// verified families, and the moderation log behind notifications.
import { execFileSync } from 'node:child_process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55421';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const run = Date.now().toString(36);

async function user(name: string): Promise<SupabaseClient> {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signUp({ email: `${name}-${run}@example.test`, password: 'test-password-1' });
  if (error) throw error;
  return c;
}
const ok = <T,>(r: { data: T; error: unknown }) => {
  if (r.error) throw r.error;
  return r.data;
};
const sql = (q: string) => execFileSync('docker', ['exec', '-i', 'supabase_db_freerange', 'psql', '-U', 'postgres', '-qc', q]);
const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id;

/** A family with a community profile near ZIP 80202. */
async function family(c: SupabaseClient, name: string): Promise<string> {
  const fid = (ok(await c.rpc('create_family', { family_name: name, initial_data: {} })) as { family_id: string }[])[0].family_id;
  ok(await c.from('community_profiles').insert({ family_id: fid, display_name: `${name} ${run}`, contact: `${name.toLowerCase()}@example.test` }));
  ok(await c.from('family_locations').insert({ family_id: fid, zip5: '80202' }));
  return fid;
}
async function connect(from: SupabaseClient, fromFid: string, to: SupabaseClient, toFid: string) {
  ok(await from.from('connections').insert({ from_family: fromFid, to_family: toFid }));
  ok(await to.from('connections').update({ status: 'accepted' }).eq('from_family', fromFid).eq('to_family', toFid));
}
const send = (c: SupabaseClient, to: string, body: string) => c.rpc('send_message', { to_family: to, body });
type Convo = { conversation_id: string; family_id: string; unread: number; can_message: boolean; blocked: boolean; last_body: string | null; last_from_me: boolean; verified: boolean };
const convos = async (c: SupabaseClient) => ok(await c.rpc('my_conversations')) as Convo[];

let ana: SupabaseClient;
let ben: SupabaseClient;
let cara: SupabaseClient;
let mod: SupabaseClient;
let famA: string;
let famB: string;
let famC: string;
let messageId: string;

beforeAll(async () => {
  [ana, ben, cara, mod] = await Promise.all([user('ana'), user('ben'), user('cara'), user('msgmod')]);
  famA = await family(ana, 'Ana');
  famB = await family(ben, 'Ben');
  famC = await family(cara, 'Cara');
  ok(await mod.rpc('create_family', { family_name: 'Mods', initial_data: {} }));
  sql(`insert into public.app_admins (user_id) values ('${await uid(mod)}') on conflict do nothing`);
  await connect(ana, famA, ben, famB);
});

describe('messages', () => {
  it('only go to connected families', async () => {
    expect((await send(ana, famC, 'Hi!')).error?.message).toMatch(/once you're connected/);
    expect((await send(ana, famA, 'Hi me')).error).toBeTruthy();
    expect((await send(ana, famB, '   ')).error?.message).toMatch(/Write a message/);
    expect((await send(ana, famB, 'x'.repeat(2001))).error?.message).toMatch(/2,000/);
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await send(anon, famB, 'Hi')).error).toBeTruthy();
  });

  it('are readable only by the two families, with unread counts', async () => {
    const sent = ok(await send(ana, famB, 'Park day on Tuesday?')) as { id: string; conversation_id: string };
    messageId = sent.id;
    ok(await send(ana, famB, 'We usually go around 10.'));
    const [b] = await convos(ben);
    expect(b).toMatchObject({ family_id: famA, unread: 2, can_message: true, blocked: false, last_body: 'We usually go around 10.', last_from_me: false });
    const [a] = await convos(ana);
    expect(a).toMatchObject({ family_id: famB, unread: 0, last_from_me: true });
    expect(ok(await ben.from('messages').select('body').eq('conversation_id', sent.conversation_id))).toHaveLength(2);
    expect(ok(await cara.from('messages').select('id').eq('conversation_id', sent.conversation_id))).toHaveLength(0);
    expect(ok(await cara.from('conversations').select('id'))).toHaveLength(0);
    expect(await convos(cara)).toEqual([]);
    // No writing around send_message().
    expect((await ben.from('messages').insert({ conversation_id: sent.conversation_id, sender_family: famA, body: 'Fake' })).error).toBeTruthy();
    // Refused outright (no write privileges), or at least matches no rows (no write policies).
    const edit = await ben.from('messages').update({ body: 'Edited' }).eq('id', messageId).select('id');
    expect(edit.error !== null || edit.data?.length === 0).toBe(true);
    expect(ok(await ana.from('messages').select('body').eq('id', messageId).single())).toEqual({ body: 'Park day on Tuesday?' });

    expect((await cara.rpc('mark_conversation_read', { cid: sent.conversation_id })).error).toBeTruthy();
    ok(await ben.rpc('mark_conversation_read', { cid: sent.conversation_id }));
    expect((await convos(ben))[0].unread).toBe(0);
    // Replying reuses the same conversation.
    const reply = ok(await send(ben, famA, 'Yes! See you there.')) as { conversation_id: string };
    expect(reply.conversation_id).toBe(sent.conversation_id);
    expect((await convos(ana))[0].unread).toBe(1);
  });

  it('are rate limited', async () => {
    const results = [];
    for (let i = 0; i < 12; i++) results.push(await send(ben, famA, `Message ${i}`));
    expect(results.some((r) => /very quickly/.test(String((r.error as { message?: string } | null)?.message)))).toBe(true);
  });
});

describe('reports', () => {
  it('only from the family that received it, and moderators see just that message', async () => {
    expect((await ana.rpc('report_content', { kind: 'message', target: messageId, why: 'spam', info: '' })).error?.message).toMatch(/your own message/);
    expect((await cara.rpc('report_content', { kind: 'message', target: messageId, why: 'spam', info: '' })).error?.message).toMatch(/isn't available/);
    expect(ok(await ben.rpc('report_content', { kind: 'message', target: messageId, why: 'inappropriate', info: 'Not okay' }))).toEqual({ hidden: false });
    const q = ok(await mod.rpc('moderation_queue')) as { target_kind: string; target_id: string; excerpt: string; owner: string; state: string }[];
    expect(q.find((x) => x.target_id === messageId)).toMatchObject({ target_kind: 'message', excerpt: 'Park day on Tuesday?', owner: `Ana ${run}`, state: 'visible' });
  });

  it('a moderator hides it from the other family and the sender is told', async () => {
    ok(await mod.rpc('moderate', { kind: 'message', target: messageId, action: 'hide', note: 'Rude' }));
    expect(ok(await ben.from('messages').select('id').eq('id', messageId))).toHaveLength(0);
    expect(ok(await ana.from('messages').select('hidden').eq('id', messageId).single())).toEqual({ hidden: true });
    const events = ok(await ana.from('moderation_events').select('target_kind, action')) as { target_kind: string; action: string }[];
    expect(events).toContainEqual({ target_kind: 'message', action: 'hidden' });
    expect(ok(await ben.from('moderation_events').select('id'))).toHaveLength(0);
  });
});

describe('blocking', () => {
  it('ends the connection and stops messages both ways', async () => {
    ok(await ben.from('family_blocks').insert({ blocker_family: famB, blocked_family: famA }));
    expect(ok(await ana.rpc('my_connections'))).toEqual([]);
    expect((await send(ana, famB, 'Hello?')).error?.message).toMatch(/can't message/);
    expect((await send(ben, famA, 'Hello?')).error?.message).toMatch(/can't message/);
    expect((await ana.from('connections').insert({ from_family: famA, to_family: famB })).error?.message).toMatch(/can't connect/);
    const finder = ok(await ana.rpc('nearby_families', { max_miles: 50 })) as { family_id: string }[];
    expect(finder.some((f) => f.family_id === famB)).toBe(false);
    expect((await convos(ben))[0]).toMatchObject({ blocked: true, can_message: false });
    // The blocked family can't see or undo the block.
    expect(ok(await ana.from('family_blocks').select('blocker_family'))).toEqual([]);
    ok(await ana.from('family_blocks').delete().eq('blocker_family', famB));
    expect((await convos(ben))[0].blocked).toBe(true);
  });

  it('can be undone, but the families need to connect again', async () => {
    ok(await ben.from('family_blocks').delete().eq('blocked_family', famA));
    expect((await send(ben, famA, 'Sorry!')).error?.message).toMatch(/once you're connected/);
    await connect(ben, famB, ana, famA);
    // (Ben hit the per-minute limit above, so Ana answers.)
    ok(await send(ana, famB, 'No worries!'));
  });
});

describe('verified families', () => {
  it('can only be set by moderators', async () => {
    expect(ok(await ana.rpc('my_verification'))).toEqual([]);
    expect(ok(await ana.rpc('request_verification', { note: 'Happy to do a video call' }))).toBe('pending');
    expect((ok(await ana.rpc('my_verification')) as { status: string }[])[0].status).toBe('pending');
    expect((await ana.rpc('set_family_verification', { fid: famA, decision: 'verified' })).error?.message).toMatch(/Moderators only/);
    expect((await ana.rpc('verification_queue')).error?.message).toMatch(/Moderators only/);
    expect((await ana.rpc('record_vendor_verification', { fid: famA, vendor: 'x', ref: 'y', passed: true })).error).toBeTruthy();
    expect((await ana.from('family_verifications').insert({ family_id: famA, status: 'verified' })).error).toBeTruthy();
    expect((await cara.rpc('request_verification', {})).data).toBe('pending');

    const q = ok(await mod.rpc('verification_queue')) as { family_id: string; note: string; connections: number }[];
    expect(q.find((x) => x.family_id === famA)).toMatchObject({ note: 'Happy to do a video call', connections: 1 });
    ok(await mod.rpc('set_family_verification', { fid: famA, decision: 'verified', note: 'Video call 11/14' }));
    expect((await ana.rpc('request_verification', {})).error?.message).toMatch(/already verified/);
  });

  it('shows as a badge in the finder, connections, and messages', async () => {
    const finder = ok(await cara.rpc('nearby_families', { max_miles: 50 })) as { family_id: string; verified: boolean }[];
    expect(finder.find((f) => f.family_id === famA)?.verified).toBe(true);
    expect(finder.find((f) => f.family_id === famB)?.verified).toBe(false);
    expect((ok(await ben.rpc('my_connections')) as { verified: boolean }[])[0].verified).toBe(true);
    expect((await convos(ben))[0].verified).toBe(true);
    const events = ok(await ana.from('moderation_events').select('target_kind, action')) as { target_kind: string; action: string }[];
    expect(events).toContainEqual({ target_kind: 'verification', action: 'verified' });
  });

  it('declining means waiting a day to ask again', async () => {
    ok(await mod.rpc('set_family_verification', { fid: famC, decision: 'declined' }));
    expect((await cara.rpc('request_verification', {})).error?.message).toMatch(/ask again tomorrow/);
  });
});

describe('moderation decisions are logged for the owner', () => {
  it('when a listing is taken down and put back', async () => {
    const listing = (ok(await cara.from('listings').insert({ seller_family: famC, seller_name: 'Cara', title: `Notify me ${run}`, grade_min: 1, grade_max: 3, format: 'print', price: 5, lessons: 10 }).select('id').single()) as { id: string }).id;
    ok(await mod.rpc('moderate', { kind: 'listing', target: listing, action: 'dismiss' }));
    ok(await mod.rpc('moderate', { kind: 'listing', target: listing, action: 'hide' }));
    ok(await mod.rpc('moderate', { kind: 'listing', target: listing, action: 'restore' }));
    const events = ok(await cara.from('moderation_events').select('action, title').eq('target_id', listing).order('created_at')) as { action: string; title: string }[];
    // Dismissing reports on something that was never hidden isn't news to the owner.
    expect(events).toEqual([{ action: 'hidden', title: `Notify me ${run}` }, { action: 'restored', title: `Notify me ${run}` }]);
  });
});
