// Row-level security and server rules, exercised as real users through the
// public API — the same way the app talks to Supabase.
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

let a: SupabaseClient; // the Millers
let b: SupabaseClient; // the Riveras
let x: SupabaseClient; // an outsider with no family
let famA: string;
let famB: string;

beforeAll(async () => {
  [a, b, x] = await Promise.all([user('a'), user('b'), user('x')]);
  famA = (ok(await a.rpc('create_family', { family_name: 'Millers', initial_data: { family: { familyName: 'Millers' }, tasks: [] } })) as { family_id: string }[])[0].family_id;
  famB = (ok(await b.rpc('create_family', { family_name: 'Riveras', initial_data: {} })) as { family_id: string }[])[0].family_id;
});

describe('families & workspace sync', () => {
  it('only members can read a workspace', async () => {
    expect(ok(await a.from('workspaces').select('data').eq('family_id', famA))).toHaveLength(1);
    expect(ok(await b.from('workspaces').select('data').eq('family_id', famA))).toHaveLength(0);
    expect(ok(await x.from('workspaces').select('data'))).toHaveLength(0);
  });

  it('pushes with optimistic versioning and returns the server copy on conflict', async () => {
    const first = (ok(await a.rpc('push_workspace', { fid: famA, base_version: 1, new_data: { tasks: [{ id: 't1' }] } })) as { ok: boolean; version: number }[])[0];
    expect(first).toMatchObject({ ok: true, version: 2 });
    const stale = (ok(await a.rpc('push_workspace', { fid: famA, base_version: 1, new_data: { tasks: [] } })) as { ok: boolean; version: number; data: { tasks: { id: string }[] } }[])[0];
    expect(stale.ok).toBe(false);
    expect(stale.version).toBe(2);
    expect(stale.data.tasks[0].id).toBe('t1');
  });

  it('blocks writes and direct table access from non-members', async () => {
    expect((await b.rpc('push_workspace', { fid: famA, base_version: 2, new_data: {} })).error?.message).toMatch(/Not a member/);
    expect((await b.from('workspaces').update({ data: {} }).eq('family_id', famA).select()).data ?? []).toHaveLength(0);
    expect((await a.rpc('create_family', { family_name: 'Second', initial_data: {} })).error?.message).toMatch(/already belongs/);
  });

  it('lets a second parent join with a one-time invite code', async () => {
    const code = ok(await a.rpc('create_family_invite')) as string;
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(ok(await x.rpc('join_family', { invite_code: code.toLowerCase() }))).toBe(famA);
    expect(ok(await x.from('workspaces').select('version').eq('family_id', famA))).toHaveLength(1);
    expect((await b.rpc('join_family', { invite_code: code })).error?.message).toMatch(/invalid or expired/);
  });

  it('keeps family photos private to the family', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    ok(await a.storage.from('family-media').upload(`${famA}/evidence/test.png`, png, { contentType: 'image/png', upsert: true }));
    expect((await b.storage.from('family-media').upload(`${famA}/evidence/evil.png`, png, { contentType: 'image/png' })).error).toBeTruthy();
    expect((await b.storage.from('family-media').createSignedUrl(`${famA}/evidence/test.png`, 60)).error).toBeTruthy();
    expect((await a.storage.from('family-media').createSignedUrl(`${famA}/evidence/test.png`, 60)).data?.signedUrl).toBeTruthy();
  });
});

describe('marketplace', () => {
  let listingId: string;

  it('lets anyone browse, but protects server-managed fields', async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((ok(await anon.from('listings').select('id').limit(5)) as unknown[]).length).toBeGreaterThan(0);
    const row = ok(
      await b
        .from('listings')
        .insert({ seller_family: famB, seller_name: 'Rosa R.', title: 'Used phonics set', subjects: ['phonics'], grade_min: 0, grade_max: 1, format: 'print', price: 20, lessons: 60, seller_verified: true, esa_eligible: true, rating_avg: 5, rating_count: 99 })
        .select()
        .single(),
    ) as { id: string; seller_verified: boolean; esa_eligible: boolean; rating_count: number };
    listingId = row.id;
    expect(row).toMatchObject({ seller_verified: false, esa_eligible: false, rating_count: 0 });
    // Can't pose as a publisher or list for another family.
    expect((await b.from('listings').insert({ seller_family: famB, seller_name: 'X', seller_kind: 'publisher', title: 'x', grade_min: 0, grade_max: 1, format: 'print', price: 1, lessons: 1 })).error).toBeTruthy();
    expect((await b.from('listings').insert({ seller_family: famA, seller_name: 'X', title: 'x', grade_min: 0, grade_max: 1, format: 'print', price: 1, lessons: 1 })).error).toBeTruthy();
    expect(ok(await a.from('listings').update({ price: 0 }).eq('id', listingId).select())).toHaveLength(0);
  });

  it('claims free listings server-side and refuses paid ones', async () => {
    const p = ok(await a.rpc('claim_free_listing', { lid: 'l-lib-burgess-bird-book' })) as { status: string; price: number };
    expect(p).toMatchObject({ status: 'free' });
    expect((await a.rpc('claim_free_listing', { lid: listingId })).error?.message).toMatch(/not free/);
    // Clients can never write purchases directly.
    expect((await a.from('purchases').insert({ family_id: famA, title: 'x', seller: 'x', price: 20, status: 'paid' })).error).toBeTruthy();
    expect(ok(await b.from('purchases').select('id'))).toHaveLength(0);
  });

  it('buys a paid listing through the checkout function (demo payments locally)', async () => {
    const { data, error } = await a.functions.invoke('create-checkout', { body: { listingId, fundingSource: 'esa', returnUrl: 'http://localhost:8081/market' } });
    expect(error).toBeNull();
    expect(data.purchase).toMatchObject({ status: 'paid', demo: true, funding_source: 'esa', listing_id: listingId });
    const bad = await a.functions.invoke('create-checkout', { body: { listingId, fundingSource: 'esa', returnUrl: 'https://evil.example/steal' } });
    expect(bad.error).toBeTruthy();
    const own = await b.functions.invoke('create-checkout', { body: { listingId, fundingSource: 'tax', returnUrl: 'http://localhost:8081/market' } });
    expect(own.error).toBeTruthy();
  });

  it('derives verified reviews and rating aggregates on the server', async () => {
    const r = ok(await a.from('reviews').insert({ listing_id: listingId, family_id: famA, author_name: 'Dana M.', rating: 4, body: 'Worked well for our kindergartner.', verified: false, helpful: 50 }).select().single()) as { id: string; verified: boolean; helpful: number };
    expect(r).toMatchObject({ verified: true, helpful: 0 });
    const l = ok(await a.from('listings').select('rating_avg, rating_count').eq('id', listingId).single()) as { rating_avg: number; rating_count: number };
    expect(Number(l.rating_avg)).toBe(4);
    expect(l.rating_count).toBe(1);
    // Sellers can't review their own listing; nobody can edit someone else's review.
    expect((await b.from('reviews').insert({ listing_id: listingId, family_id: famB, author_name: 'Rosa R.', rating: 5, body: 'My own listing is great!' })).error?.message).toMatch(/own listing/);
    expect(ok(await b.from('reviews').update({ rating: 1 }).eq('id', r.id).select())).toHaveLength(0);
    // Helpful votes are counted by the server, once per person.
    ok(await b.from('review_votes').insert({ review_id: r.id }));
    expect((await b.from('review_votes').insert({ review_id: r.id })).error).toBeTruthy();
    expect((ok(await a.from('reviews').select('helpful').eq('id', r.id).single()) as { helpful: number }).helpful).toBe(1);
  });
});

describe('community', () => {
  it('matches nearby families by distance band without exposing ZIP codes', async () => {
    ok(await a.from('community_profiles').upsert({ family_id: famA, display_name: 'Dana M.', kid_ages: [5, 9], philosophies: ['charlotte_mason'], contact: 'dana@example.test' }));
    ok(await a.from('family_locations').upsert({ family_id: famA, zip5: '80202' }));
    ok(await b.from('community_profiles').upsert({ family_id: famB, display_name: 'Rosa R.', kid_ages: [8], philosophies: ['classical'], contact: 'rosa@example.test' }));
    ok(await b.from('family_locations').upsert({ family_id: famB, zip5: '80205' }));
    const found = ok(await a.rpc('nearby_families', { max_miles: 25 })) as Record<string, unknown>[];
    const rosa = found.find((f) => f.family_id === famB)!;
    expect(rosa).toBeTruthy();
    expect(String(rosa.band)).toMatch(/^within /);
    expect(JSON.stringify(found)).not.toMatch(/80205|rosa@/);
    expect(ok(await a.from('family_locations').select('zip5').eq('family_id', famB))).toHaveLength(0);
    expect(ok(await a.from('community_profiles').select('contact').eq('family_id', famB))).toHaveLength(0);
    expect((ok(await a.rpc('nearby_families', { max_miles: 25, style: 'montessori' })) as unknown[]).length).toBe(0);
  });

  it('shares contact details only after a connection is accepted', async () => {
    ok(await a.from('connections').insert({ from_family: famA, to_family: famB, message: 'Park day?' }));
    expect((ok(await a.rpc('my_connections')) as { contact: string }[])[0].contact).toBe('');
    // Only the recipient can accept.
    expect(ok(await a.from('connections').update({ status: 'accepted' }).eq('from_family', famA).eq('to_family', famB).select())).toHaveLength(0);
    ok(await b.from('connections').update({ status: 'accepted' }).eq('from_family', famA).eq('to_family', famB));
    expect((ok(await a.rpc('my_connections')) as { contact: string }[])[0].contact).toBe('rosa@example.test');
  });

  it('runs co-op join requests through the organizer', async () => {
    const coop = ok(await a.from('coops').insert({ name: 'Front Range Explorers', organizer_family: famA, zip5: '80202' }).select().single()) as { id: string };
    ok(await b.from('coop_members').insert({ coop_id: coop.id, family_id: famB, display_name: 'Rosa R.' }));
    expect((await b.from('coop_members').insert({ coop_id: coop.id, family_id: famA, display_name: 'Spoof' })).error).toBeTruthy();
    let mine = (ok(await b.rpc('nearby_coops', { max_miles: 25 })) as { id: string; my_role: string; members: string[] | null }[]).find((c) => c.id === coop.id)!;
    expect(mine.my_role).toBe('pending');
    expect(mine.members).toBeNull();
    expect(ok(await b.from('coop_members').update({ status: 'active' }).eq('coop_id', coop.id).eq('family_id', famB).select())).toHaveLength(0);
    ok(await a.from('coop_members').update({ status: 'active' }).eq('coop_id', coop.id).eq('family_id', famB));
    mine = (ok(await b.rpc('nearby_coops', { max_miles: 25 })) as { id: string; my_role: string; members: string[] | null }[]).find((c) => c.id === coop.id)!;
    expect(mine.my_role).toBe('member');
    expect(mine.members).toEqual(['Dana M.', 'Rosa R.']);
  });

  it('enforces event capacity and shares carpool names only with carpoolers', async () => {
    const soon = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    const ev = ok(await a.from('events').insert({ title: 'Museum day', starts_on: soon, zip5: '80202', capacity: 2, host_family: famA, host_name: 'Dana M.' }).select().single()) as { id: string };
    ok(await b.from('event_rsvps').insert({ event_id: ev.id, family_id: famB, display_name: '' }));
    expect((await x.from('event_rsvps').insert({ event_id: ev.id, family_id: famA, display_name: '' })).error).toBeTruthy();
    ok(await a.from('event_rsvps').update({ carpool: true }).eq('event_id', ev.id).eq('family_id', famA));
    let seen = (ok(await b.rpc('nearby_events', { max_miles: 25 })) as { id: string; going: number; carpool_names: string[] | null }[]).find((e) => e.id === ev.id)!;
    expect(seen.going).toBe(2);
    expect(seen.carpool_names).toBeNull();
    ok(await b.from('event_rsvps').update({ carpool: true }).eq('event_id', ev.id).eq('family_id', famB));
    seen = (ok(await b.rpc('nearby_events', { max_miles: 25 })) as typeof seen[]).find((e) => e.id === ev.id)!;
    expect(seen.carpool_names).toEqual(['Dana M.']);
  });
});
