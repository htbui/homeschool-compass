/// <reference types="node" />
// Moderation on the server: reports (including copyright claims), automatic
// hiding after several reports, the moderators' queue, and takedowns that
// sellers can't undo.
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
/** Moderators are added by hand in SQL (here: straight into the local database). */
function makeModerator(userId: string) {
  execFileSync('docker', ['exec', '-i', 'supabase_db_freerange', 'psql', '-U', 'postgres', '-qc', `insert into public.app_admins (user_id) values ('${userId}') on conflict do nothing`]);
}

let seller: SupabaseClient;
let reviewer: SupabaseClient;
let reporters: SupabaseClient[];
let mod: SupabaseClient;
let famSeller: string;
let famReviewer: string;
let listingId: string;
let reviewId: string;

const report = (c: SupabaseClient, kind: string, target: string, why = 'inappropriate', info = '', reach: string | null = null) =>
  c.rpc('report_content', { kind, target, why, info, reach });

beforeAll(async () => {
  [seller, reviewer, mod, ...reporters] = await Promise.all([user('seller'), user('reviewer'), user('mod'), user('r1'), user('r2'), user('r3')]);
  famSeller = (ok(await seller.rpc('create_family', { family_name: 'Sellers', initial_data: {} })) as { family_id: string }[])[0].family_id;
  famReviewer = (ok(await reviewer.rpc('create_family', { family_name: 'Reviewers', initial_data: {} })) as { family_id: string }[])[0].family_id;
  for (const r of reporters) ok(await r.rpc('create_family', { family_name: 'Reporters', initial_data: {} }));
  listingId = (ok(await seller.from('listings').insert({ seller_family: famSeller, seller_name: 'Sellers', title: `Report me ${run}`, grade_min: 1, grade_max: 3, format: 'print', price: 5, lessons: 10 }).select().single()) as { id: string }).id;
  reviewId = (ok(await reviewer.from('reviews').insert({ listing_id: listingId, family_id: famReviewer, author_name: 'Rev', rating: 1, body: 'Rude words that break the rules.' }).select().single()) as { id: string }).id;
  makeModerator((await mod.auth.getUser()).data.user!.id);
});

describe('reports', () => {
  it('need an account, a real target, and details for copyright', async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await report(anon, 'listing', listingId)).error).toBeTruthy();
    expect((await report(reporters[0], 'listing', 'nope')).error?.message).toMatch(/isn't available/);
    expect((await report(seller, 'listing', listingId)).error?.message).toMatch(/your own listing/);
    expect((await report(reviewer, 'review', reviewId)).error?.message).toMatch(/your own review/);
    expect((await report(reporters[0], 'listing', listingId, 'copyright', 'It copies my book')).error?.message).toMatch(/way to reach you/);
    expect(ok(await report(reporters[0], 'listing', listingId, 'copyright', 'Copies chapters 1–3 of my book “Pond Days”', 'author@example.test'))).toEqual({ hidden: false });
    // Reporting again replaces the earlier report instead of counting twice.
    expect(ok(await report(reporters[0], 'listing', listingId, 'copyright', 'Copies chapters 1–4 of “Pond Days”', 'author@example.test'))).toEqual({ hidden: false });
    expect(ok(await reporters[0].from('reports').select('details'))).toEqual([{ details: 'Copies chapters 1–4 of “Pond Days”' }]);
    expect(ok(await reporters[1].from('reports').select('id'))).toHaveLength(0);
  });

  it('hide a review automatically after three people report it', async () => {
    ok(await report(reporters[0], 'review', reviewId));
    ok(await report(reporters[1], 'review', reviewId, 'personal_info'));
    expect(ok(await seller.from('reviews').select('id').eq('id', reviewId))).toHaveLength(1);
    expect(ok(await report(reporters[2], 'review', reviewId))).toEqual({ hidden: true });
    expect(ok(await seller.from('reviews').select('id').eq('id', reviewId))).toHaveLength(0);
    // The author still sees it, and can't unhide it.
    expect(ok(await reviewer.from('reviews').update({ hidden: false, body: 'Rude words, edited a bit.' }).eq('id', reviewId).select('hidden'))).toEqual([{ hidden: true }]);
    const l = ok(await seller.from('listings').select('rating_count').eq('id', listingId).single()) as { rating_count: number };
    expect(l.rating_count).toBe(0);
  });
});

describe('moderators', () => {
  it('are the only ones who see the queue or act', async () => {
    expect(ok(await reporters[0].rpc('is_admin'))).toBe(false);
    expect(ok(await mod.rpc('is_admin'))).toBe(true);
    expect((await reporters[0].rpc('moderation_queue')).error?.message).toMatch(/Moderators only/);
    expect((await seller.rpc('moderate', { kind: 'listing', target: listingId, action: 'restore' })).error?.message).toMatch(/Moderators only/);
  });

  it('see copyright claims first, with every report', async () => {
    const q = ok(await mod.rpc('moderation_queue')) as { target_kind: string; target_id: string; reasons: string[]; report_count: number; state: string; reports: { contact: string | null }[] }[];
    const mine = q.filter((x) => x.target_id === listingId || x.target_id === reviewId);
    expect(mine.map((x) => x.target_kind)).toEqual(['listing', 'review']);
    expect(mine[0]).toMatchObject({ reasons: ['copyright'], report_count: 1, state: 'active' });
    expect(mine[0].reports[0].contact).toBe('author@example.test');
    expect(mine[1]).toMatchObject({ reasons: ['inappropriate', 'personal_info'], report_count: 3, state: 'hidden' });
  });

  it('take a listing down, and the seller can’t bring it back', async () => {
    ok(await mod.rpc('moderate', { kind: 'listing', target: listingId, action: 'hide', note: 'Copyright claim upheld' }));
    expect(ok(await reporters[1].from('listings').select('id').eq('id', listingId))).toHaveLength(0);
    expect(ok(await seller.from('listings').select('status').eq('id', listingId).single())).toEqual({ status: 'suspended' });
    ok(await seller.from('listings').update({ status: 'active', title: `Still here ${run}` }).eq('id', listingId));
    ok(await seller.from('listings').update({ status: 'removed' }).eq('id', listingId));
    ok(await seller.from('listings').update({ status: 'active' }).eq('id', listingId));
    expect(ok(await seller.from('listings').select('status').eq('id', listingId).single())).toEqual({ status: 'suspended' });
    expect((await reporters[1].rpc('claim_free_listing', { lid: listingId })).error).toBeTruthy();
    expect(ok(await reporters[0].from('reports').select('status, resolution').eq('target_kind', 'listing'))).toEqual([{ status: 'actioned', resolution: 'Copyright claim upheld' }]);
    // Sellers can't suspend (or un-suspend) anything themselves.
    const other = (ok(await seller.from('listings').insert({ seller_family: famSeller, seller_name: 'Sellers', title: `Fine ${run}`, grade_min: 1, grade_max: 3, format: 'print', price: 5, lessons: 10, status: 'suspended' }).select('status').single()) as { status: string });
    expect(other.status).toBe('active');
  });

  it('restore or dismiss, which also undoes an automatic hide', async () => {
    ok(await mod.rpc('moderate', { kind: 'review', target: reviewId, action: 'dismiss' }));
    expect(ok(await seller.from('reviews').select('id').eq('id', reviewId))).toHaveLength(1);
    ok(await mod.rpc('moderate', { kind: 'listing', target: listingId, action: 'restore' }));
    expect(ok(await reporters[1].from('listings').select('id').eq('id', listingId))).toHaveLength(1);
    const q = ok(await mod.rpc('moderation_queue')) as { target_id: string }[];
    expect(q.some((x) => x.target_id === listingId || x.target_id === reviewId)).toBe(false);
  });
});
