/// <reference types="node" />
// Creators on the server: verified-creator and ESA vendor badges that only
// moderators grant (and that land on every listing), plus storefront follows.
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
const uidOf = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id;
function makeModerator(userId: string) {
  execFileSync('docker', ['exec', '-i', 'supabase_db_freerange', 'psql', '-U', 'postgres', '-qc', `insert into public.app_admins (user_id) values ('${userId}') on conflict do nothing`]);
}

const units = [{ id: 'u1', title: 'Halves', lessons: [{ id: 'l1', title: 'Fold it', steps: [], links: [], questions: [] }] }];
const pkg = (id: string) => ({
  id, title: `Fractions ${id}`, description: 'Hands-on fractions.', subjects: ['math'], gradeMin: 2, gradeMax: 4, philosophies: [], parentInvolvement: 'medium', familyStyle: false,
  minutesPerLesson: 30, lessonsPerWeek: 3, format: 'digital', cover: '🍕', color: '#E3A33B', price: 12, units, origin: { kind: 'original' }, license: { kind: 'cc_by', version: '4.0' },
  status: 'draft', version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
async function publish(c: SupabaseClient, id: string): Promise<string> {
  ok(await c.from('packages').upsert({ id, title: `Fractions ${id}`, origin_kind: 'original', content: pkg(id) }));
  return (ok(await c.rpc('publish_package', { pkg_id: id })) as { id: string }).id;
}
const listing = async (c: SupabaseClient, id: string) =>
  ok(await c.from('listings').select('seller_verified, esa_eligible, esa_states, seller_name').eq('id', id).single()) as { seller_verified: boolean; esa_eligible: boolean; esa_states: string[]; seller_name: string };

const verifiedApp = { sellerType: 'creator', legalName: 'Jordan Rivera', website: 'https://maple.example.com', about: 'I taught 3rd grade for 8 years and wrote every lesson myself.', sampleUrl: null };
const esaApp = { sellerType: 'publisher', legalName: 'Maple Room Press LLC', states: ['ut', 'AZ'], vendorInfo: 'AZ ESA vendor V-12345; https://esa.example.gov/vendors/maple' };

let creator: SupabaseClient;
let parent: SupabaseClient;
let other: SupabaseClient;
let mod: SupabaseClient;
let creatorId: string;
let listingId: string;

beforeAll(async () => {
  [creator, parent, other, mod] = await Promise.all([user('maker'), user('fam'), user('other'), user('mod')]);
  ok(await parent.rpc('create_family', { family_name: 'Followers', initial_data: {} }));
  ok(await other.rpc('create_family', { family_name: 'Sellers', initial_data: {} }));
  creatorId = await uidOf(creator);
  makeModerator(await uidOf(mod));
});

describe('badges can’t be self-granted', () => {
  it('on the creator profile', async () => {
    expect((await creator.rpc('apply_for_badge', { badge: 'verified', details: verifiedApp })).error?.message).toMatch(/creator profile/);
    const p = ok(await creator.from('creator_profiles').insert({ name: `Maple ${run}`, verified: true, esa_states: ['AZ'] }).select('verified, esa_states').single());
    expect(p).toEqual({ verified: false, esa_states: [] });
    expect(ok(await creator.from('creator_profiles').update({ verified: true, esa_states: ['AZ'], verified_at: new Date().toISOString() }).eq('user_id', creatorId).select('verified, esa_states, verified_at'))).toEqual([{ verified: false, esa_states: [], verified_at: null }]);
  });

  it('on listings, for creators and family sellers', async () => {
    listingId = await publish(creator, `p1-${run}`);
    expect(await listing(creator, listingId)).toMatchObject({ seller_verified: false, esa_eligible: false, esa_states: [] });
    const fam = (ok(await other.from('family_members').select('family_id').single()) as { family_id: string }).family_id;
    const row = ok(
      await other.from('listings').insert({ seller_family: fam, seller_name: 'Sellers', title: `Used ${run}`, grade_min: 1, grade_max: 2, format: 'print', price: 5, lessons: 10, seller_verified: true, esa_eligible: true, esa_states: ['AZ'] }).select('id, seller_verified, esa_eligible, esa_states').single(),
    ) as { id: string };
    expect(row).toMatchObject({ seller_verified: false, esa_eligible: false, esa_states: [] });
    expect(ok(await other.from('listings').update({ esa_states: ['FL'], esa_eligible: true }).eq('id', row.id).select('esa_eligible, esa_states'))).toEqual([{ esa_eligible: false, esa_states: [] }]);
  });
});

describe('applications', () => {
  it('need an account, a website, the story, and no tax IDs', async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.rpc('apply_for_badge', { badge: 'verified', details: verifiedApp })).error).toBeTruthy();
    expect((await creator.rpc('apply_for_badge', { badge: 'verified', details: { ...verifiedApp, website: '' } })).error?.message).toMatch(/website or portfolio/);
    expect((await creator.rpc('apply_for_badge', { badge: 'verified', details: { ...verifiedApp, about: 'Mine.' } })).error?.message).toMatch(/how you made/);
    expect((await creator.rpc('apply_for_badge', { badge: 'esa', details: { ...esaApp, vendorInfo: 'EIN 12-3456789' } })).error?.message).toMatch(/tax ID/);
    expect((await creator.rpc('apply_for_badge', { badge: 'esa', details: { ...esaApp, states: [] } })).error?.message).toMatch(/states/);
    expect((await creator.rpc('apply_for_badge', { badge: 'esa', details: { ...esaApp, states: ['ZZ'] } })).error?.message).toMatch(/Unknown state/);
  });

  it('update the pending one instead of piling up, and stay private', async () => {
    ok(await creator.rpc('apply_for_badge', { badge: 'verified', details: { ...verifiedApp, legalName: 'J. Rivera' } }));
    const a = ok(await creator.rpc('apply_for_badge', { badge: 'verified', details: verifiedApp })) as { status: string; legal_name: string };
    expect(a).toMatchObject({ status: 'pending', legal_name: 'Jordan Rivera' });
    const e = ok(await creator.rpc('apply_for_badge', { badge: 'esa', details: esaApp })) as { states: string[]; seller_type: string };
    expect(e).toMatchObject({ states: ['AZ', 'UT'], seller_type: 'publisher' });
    expect(ok(await creator.from('seller_applications').select('badge').eq('status', 'pending').order('badge'))).toEqual([{ badge: 'esa' }, { badge: 'verified' }]);
    expect(ok(await parent.from('seller_applications').select('id'))).toHaveLength(0);
    expect((await creator.from('seller_applications').insert({ badge: 'verified', legal_name: 'x y' })).error).toBeTruthy();
    expect((await creator.from('seller_applications').update({ status: 'approved' }).eq('badge', 'verified').select()).data ?? []).toHaveLength(0);
  });
});

describe('moderators', () => {
  it('are the only ones who see the queue or decide', async () => {
    expect((await creator.rpc('badge_queue')).error?.message).toMatch(/Moderators only/);
    const mine = (ok(await creator.from('seller_applications').select('id').eq('badge', 'verified').eq('status', 'pending').single()) as { id: string }).id;
    expect((await creator.rpc('decide_badge', { app: mine, decision: 'approve' })).error?.message).toMatch(/Moderators only/);
    expect((await creator.rpc('revoke_badge', { creator: creatorId, badge: 'verified' })).error?.message).toMatch(/Moderators only/);
  });

  it('approve verification: the badge lands on every listing, old and new', async () => {
    const q = ok(await mod.rpc('badge_queue')) as { id: string; user_id: string; badge: string; creator_name: string; listing_count: number }[];
    const item = q.find((x) => x.user_id === creatorId && x.badge === 'verified')!;
    expect(item).toMatchObject({ creator_name: `Maple ${run}`, listing_count: 1 });
    ok(await mod.rpc('decide_badge', { app: item.id, decision: 'approve', note: 'Portfolio matches' }));
    expect((await mod.rpc('decide_badge', { app: item.id, decision: 'approve' })).error?.message).toMatch(/already decided/);
    expect(await listing(parent, listingId)).toMatchObject({ seller_verified: true });
    const second = await publish(creator, `p2-${run}`);
    expect(await listing(parent, second)).toMatchObject({ seller_verified: true });
    expect(ok(await creator.from('seller_applications').select('status, decision_note').eq('badge', 'verified'))).toEqual([{ status: 'approved', decision_note: 'Portfolio matches' }]);
    expect((await creator.rpc('apply_for_badge', { badge: 'verified', details: verifiedApp })).error?.message).toMatch(/already a verified/);
  });

  it('approve an ESA listing with the states families see', async () => {
    const q = ok(await mod.rpc('badge_queue')) as { id: string; user_id: string; badge: string; states: string[]; vendor_info: string }[];
    const item = q.find((x) => x.user_id === creatorId && x.badge === 'esa')!;
    expect(item.vendor_info).toMatch(/V-12345/);
    ok(await mod.rpc('decide_badge', { app: item.id, decision: 'approve' }));
    expect(await listing(parent, listingId)).toMatchObject({ esa_eligible: true, esa_states: ['AZ', 'UT'] });
    expect(ok(await parent.from('creator_profiles').select('verified, esa_states').eq('user_id', creatorId).single())).toEqual({ verified: true, esa_states: ['AZ', 'UT'] });
    // Republishing keeps the badges; a creator still can't change them.
    await publish(creator, `p1-${run}`);
    expect(await listing(parent, listingId)).toMatchObject({ seller_verified: true, esa_eligible: true });
    ok(await creator.from('creator_profiles').update({ esa_states: ['AZ', 'UT', 'FL'] }).eq('user_id', creatorId));
    expect(await listing(parent, listingId)).toMatchObject({ esa_states: ['AZ', 'UT'] });
  });

  it('revoke ESA status, and a name change drops verification', async () => {
    ok(await mod.rpc('revoke_badge', { creator: creatorId, badge: 'esa', note: 'No longer on the AZ list' }));
    expect(await listing(parent, listingId)).toMatchObject({ esa_eligible: false, esa_states: [], seller_verified: true });
    expect(ok(await creator.from('seller_applications').select('status').eq('badge', 'esa'))).toEqual([{ status: 'revoked' }]);
    ok(await creator.from('creator_profiles').update({ bio: 'Hands-on math.' }).eq('user_id', creatorId));
    expect(await listing(parent, listingId)).toMatchObject({ seller_verified: true });
    ok(await creator.from('creator_profiles').update({ name: `Renamed ${run}` }).eq('user_id', creatorId));
    expect(await listing(parent, listingId)).toMatchObject({ seller_verified: false, seller_name: `Renamed ${run}` });
  });

  it('decline with a note the creator sees', async () => {
    ok(await creator.rpc('apply_for_badge', { badge: 'verified', details: verifiedApp }));
    const q = ok(await mod.rpc('badge_queue')) as { id: string; user_id: string }[];
    ok(await mod.rpc('decide_badge', { app: q.find((x) => x.user_id === creatorId)!.id, decision: 'decline', note: 'Website doesn’t mention you' }));
    expect(ok(await creator.from('seller_applications').select('status, decision_note').eq('badge', 'verified').order('created_at', { ascending: false }).limit(1))).toEqual([{ status: 'declined', decision_note: 'Website doesn’t mention you' }]);
    expect(await listing(parent, listingId)).toMatchObject({ seller_verified: false });
  });
});

describe('follows', () => {
  it('families follow creators privately; creators see only the count', async () => {
    ok(await parent.from('creator_follows').insert({ creator_user: creatorId }));
    expect((await parent.from('creator_follows').insert({ creator_user: creatorId })).error).toBeTruthy();
    expect((await creator.from('creator_follows').insert({ creator_user: creatorId })).error).toBeTruthy();
    expect((await other.from('creator_follows').insert({ creator_user: await uidOf(other) })).error).toBeTruthy(); // not a creator
    expect(ok(await parent.from('creator_follows').select('creator_user'))).toEqual([{ creator_user: creatorId }]);
    expect(ok(await creator.from('creator_follows').select('user_id'))).toHaveLength(0);
    expect(ok(await creator.rpc('my_follower_count'))).toBe(1);
    ok(await parent.from('creator_follows').delete().eq('creator_user', creatorId));
    expect(ok(await creator.rpc('my_follower_count'))).toBe(0);
  });
});
