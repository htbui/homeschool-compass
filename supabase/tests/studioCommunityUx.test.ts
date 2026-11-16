/// <reference types="node" />
// Server side of the Studio & Community UX review (migration
// 20261116000400_studio_community_ux.sql): reporting a family (SC-05), the
// finder's "on Freerange since" and moderator-hidden families, listing the
// families you blocked, and field-trip start times and details (SC-15).
import { execFileSync } from 'node:child_process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55421';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
const msg = (r: { error: unknown }) => String((r.error as { message?: string } | null)?.message ?? '');
const sql = (q: string) => execFileSync('docker', ['exec', '-i', 'supabase_db_freerange', 'psql', '-U', 'postgres', '-qc', q]);
const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id;
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

async function family(c: SupabaseClient, name: string): Promise<string> {
  const fid = (ok(await c.rpc('create_family', { family_name: name, initial_data: {} })) as { family_id: string }[])[0].family_id;
  ok(await c.from('community_profiles').insert({ family_id: fid, display_name: `${name} ${run}`, bio: `${name} likes parks` }));
  ok(await c.from('family_locations').insert({ family_id: fid, zip5: '80202' }));
  return fid;
}
type Finder = { family_id: string; member_since: string | null };
const finder = async (c: SupabaseClient) => ok(await c.rpc('nearby_families', { max_miles: 50 })) as Finder[];
type Queue = { target_kind: string; target_id: string; title: string; excerpt: string; owner: string; state: string; reports: { details: string }[] };

let ana: SupabaseClient;
let ben: SupabaseClient;
let cara: SupabaseClient;
let mod: SupabaseClient;
let famA: string;
let famB: string;
let famC: string;

beforeAll(async () => {
  [ana, ben, cara, mod] = await Promise.all([user('ux-ana'), user('ux-ben'), user('ux-cara'), user('ux-mod')]);
  famA = await family(ana, 'UxAna');
  famB = await family(ben, 'UxBen');
  famC = await family(cara, 'UxCara');
  ok(await mod.rpc('create_family', { family_name: 'Mods', initial_data: {} }));
  sql(`insert into public.app_admins (user_id) values ('${await uid(mod)}') on conflict do nothing`);
});

describe('SC-05 the finder tells lookalike families apart', () => {
  it('says when each family joined, to the month', async () => {
    const b = (await finder(ana)).find((f) => f.family_id === famB)!;
    expect(b.member_since).toBeTruthy();
    const d = new Date(b.member_since!);
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(0);
    expect(Math.abs(Date.now() - d.getTime())).toBeLessThan(32 * 864e5);
  });
});

describe('SC-05 reporting a family', () => {
  it('anyone in the community can report another family (not their own, not as copyright)', async () => {
    expect(ok(await ana.rpc('report_content', { kind: 'family', target: famB, why: 'inappropriate', info: 'Their note to us: “send me your address”' }))).toEqual({ hidden: false });
    expect(msg(await ana.rpc('report_content', { kind: 'family', target: famA, why: 'spam', info: '' }))).toMatch(/your own family/);
    expect(msg(await ana.rpc('report_content', { kind: 'family', target: famC, why: 'copyright', info: 'x', reach: 'y' }))).toMatch(/another reason/);
    expect(msg(await ana.rpc('report_content', { kind: 'family', target: 'not-a-family', why: 'spam', info: '' }))).toMatch(/isn.t available/);
    expect((await createClient(URL, KEY, { auth: { persistSession: false } }).rpc('report_content', { kind: 'family', target: famB, why: 'spam' })).error).toBeTruthy();
  });

  it('reports alone never hide a family: a moderator decides', async () => {
    ok(await cara.rpc('report_content', { kind: 'family', target: famB, why: 'spam', info: '' }));
    ok(await mod.rpc('report_content', { kind: 'family', target: famB, why: 'spam', info: '' }));
    expect((await finder(ana)).some((f) => f.family_id === famB)).toBe(true);
  });

  it('moderators see the family’s name, bio and the reports; families can’t read the queue', async () => {
    const item = (ok(await mod.rpc('moderation_queue')) as Queue[]).find((q) => q.target_kind === 'family' && q.target_id === famB)!;
    expect(item).toMatchObject({ title: `Family: UxBen ${run}`, excerpt: 'UxBen likes parks', owner: `UxBen ${run}`, state: 'visible' });
    expect(item.reports.some((r) => r.details.includes('send me your address'))).toBe(true);
    expect((await ana.rpc('moderation_queue')).error).toBeTruthy();
  });

  it('hiding takes the family out of the finder, tells them, and they can’t undo it themselves', async () => {
    ok(await mod.rpc('moderate', { kind: 'family', target: famB, action: 'hide', note: 'Asked for addresses' }));
    expect((await finder(ana)).some((f) => f.family_id === famB)).toBe(false);
    expect((await finder(cara)).some((f) => f.family_id === famB)).toBe(false);
    const told = ok(await ben.from('moderation_events').select('target_kind, action, title')) as { target_kind: string; action: string; title: string }[];
    expect(told).toContainEqual({ target_kind: 'family', action: 'hidden', title: `UxBen ${run}` });
    // Saving the profile (or setting the flag) doesn't bring it back.
    await ben.from('community_profiles').update({ bio: 'Nice now', moderator_hidden: false }).eq('family_id', famB);
    await ben.from('community_profiles').upsert({ family_id: famB, display_name: `UxBen ${run}`, visible: true });
    expect((await finder(ana)).some((f) => f.family_id === famB)).toBe(false);
    // The queue is cleared.
    expect((ok(await mod.rpc('moderation_queue')) as Queue[]).some((q) => q.target_kind === 'family' && q.target_id === famB)).toBe(false);
  });

  it('restoring puts the family back and tells them', async () => {
    ok(await ana.rpc('report_content', { kind: 'family', target: famB, why: 'other', info: 'checking' }));
    ok(await mod.rpc('moderate', { kind: 'family', target: famB, action: 'dismiss' }));
    expect((await finder(ana)).some((f) => f.family_id === famB)).toBe(true);
    const told = ok(await ben.from('moderation_events').select('action').eq('target_kind', 'family')) as { action: string }[];
    expect(told.map((t) => t.action).sort()).toEqual(['hidden', 'restored']);
    // Only moderators moderate.
    expect((await ana.rpc('moderate', { kind: 'family', target: famB, action: 'hide' })).error).toBeTruthy();
  });
});

describe('SC-05 blocking from the finder or a request', () => {
  it('a pending request can be declined by blocking, and the blocker can list and unblock them', async () => {
    ok(await cara.from('connections').insert({ from_family: famC, to_family: famA, message: 'hi' }));
    ok(await ana.from('family_blocks').insert({ blocker_family: famA, blocked_family: famC }));
    const conns = ok(await ana.rpc('my_connections')) as { family_id: string }[];
    expect(conns.some((x) => x.family_id === famC)).toBe(false);
    expect((await finder(ana)).some((f) => f.family_id === famC)).toBe(false);
    expect((await finder(cara)).some((f) => f.family_id === famA)).toBe(false);
    expect(ok(await ana.rpc('my_blocks'))).toEqual([expect.objectContaining({ family_id: famC, display_name: `UxCara ${run}` })]);
    // Cara doesn't learn she was blocked.
    expect(ok(await cara.rpc('my_blocks'))).toEqual([]);
    ok(await ana.from('family_blocks').delete().eq('blocker_family', famA).eq('blocked_family', famC));
    expect(ok(await ana.rpc('my_blocks'))).toEqual([]);
    expect((await finder(ana)).some((f) => f.family_id === famC)).toBe(true);
  });
});

describe('SC-15 field trips have a start time and details', () => {
  it('are saved and listed, in time order on the same day', async () => {
    const late = (ok(await ana.from('events').insert({ title: `Late ${run}`, starts_on: day(5), start_time: '13:30', details: 'Bring lunch', location: 'Library', zip5: '80202', host_family: famA, host_name: '' }).select('id').single()) as { id: string }).id;
    const early = (ok(await ana.from('events').insert({ title: `Early ${run}`, starts_on: day(5), start_time: '09:00', location: 'Park', zip5: '80202', host_family: famA, host_name: '' }).select('id').single()) as { id: string }).id;
    const list = (ok(await cara.rpc('nearby_events', { max_miles: 50 })) as { id: string; start_time: string | null; details: string }[]).filter((e) => e.id === late || e.id === early);
    expect(list.map((e) => [e.id, e.start_time, e.details])).toEqual([
      [early, '09:00:00', ''],
      [late, '13:30:00', 'Bring lunch'],
    ]);
    expect((await ana.from('events').insert({ title: 'Too long', starts_on: day(5), details: 'x'.repeat(1001), host_family: famA, host_name: '' })).error).toBeTruthy();
  });
});
