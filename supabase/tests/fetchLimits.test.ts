/// <reference types="node" />
// Web page fetch limits (only the fetch-page function may claim them) and
// reviews that show the reviewer's progress, computed from the family's own
// synced plan.
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

let seller: SupabaseClient;
let reviewer: SupabaseClient;
let famSeller: string;
let famReviewer: string;
let listingId: string;
let version = 1;

const plan = (lid: string, done: Record<string, number>, lessonsDone = 0) => ({
  curricula: [
    { id: `c-${run}`, name: 'Pond Life', listingId: lid, totalLessons: 120, lessonsDone, childIds: Object.keys(done), progress: done },
    { id: `junk-${run}`, listingId: lid, totalLessons: 'lots', lessonsDone: 'some' },
  ],
});
async function push(data: unknown) {
  const [row] = ok(await reviewer.rpc('push_workspace', { fid: famReviewer, base_version: version, new_data: data })) as { ok: boolean; version: number }[];
  expect(row.ok).toBe(true);
  version = row.version;
}
const myReview = async () =>
  ok(await reviewer.from('reviews').select('progress_done, progress_total, show_progress').eq('listing_id', listingId).eq('family_id', famReviewer).single()) as { progress_done: number | null; progress_total: number | null; show_progress: boolean };

beforeAll(async () => {
  [seller, reviewer] = await Promise.all([user('pseller'), user('previewer')]);
  famSeller = (ok(await seller.rpc('create_family', { family_name: 'Sellers', initial_data: {} })) as { family_id: string }[])[0].family_id;
  famReviewer = (ok(await reviewer.rpc('create_family', { family_name: 'Reviewers', initial_data: {} })) as { family_id: string }[])[0].family_id;
  listingId = (ok(await seller.from('listings').insert({ seller_family: famSeller, seller_name: 'Sellers', title: `Progress ${run}`, grade_min: 1, grade_max: 3, format: 'print', price: 0, lessons: 120 }).select().single()) as { id: string }).id;
});

describe('page fetch limits', () => {
  it('can only be claimed by the fetch-page function (service role)', async () => {
    const me = (await reviewer.auth.getUser()).data.user!.id;
    expect((await reviewer.rpc('claim_page_fetch', { uid: me })).error).toBeTruthy();
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.rpc('claim_page_fetch', { uid: me })).error).toBeTruthy();
    expect((await reviewer.from('page_fetches').select('*')).data ?? []).toEqual([]);
  });
});

describe('reviews that show progress', () => {
  it('come from the family’s own plan, whatever the client sends', async () => {
    await push(plan(listingId, { k1: 34, k2: 12 }));
    ok(await reviewer.from('reviews').insert({ listing_id: listingId, family_id: famReviewer, author_name: 'Rev', rating: 5, body: 'We loved every lesson of this.', progress_done: 999, progress_total: 999 }));
    expect(await myReview()).toEqual({ progress_done: 34, progress_total: 120, show_progress: true });
  });

  it('follow along as the family’s plan syncs', async () => {
    await push(plan(listingId, { k1: 34, k2: 500 }));
    expect(await myReview()).toMatchObject({ progress_done: 120, progress_total: 120 });
    // A kid without their own count is at the curriculum's starting point.
    await push(plan(listingId, {}, 7));
    expect(await myReview()).toMatchObject({ progress_done: 7, progress_total: 120 });
  });

  it('show nothing when the plan no longer has the curriculum', async () => {
    await push({ curricula: [] });
    expect(await myReview()).toMatchObject({ progress_done: null, progress_total: null });
  });

  it('can be hidden by the family, and come back when shown again', async () => {
    await push(plan(listingId, { k1: 50 }));
    ok(await reviewer.from('reviews').update({ show_progress: false }).eq('listing_id', listingId).eq('family_id', famReviewer));
    expect(await myReview()).toEqual({ progress_done: null, progress_total: null, show_progress: false });
    await push(plan(listingId, { k1: 60 }));
    expect(await myReview()).toMatchObject({ progress_done: null });
    ok(await reviewer.from('reviews').update({ show_progress: true }).eq('listing_id', listingId).eq('family_id', famReviewer));
    expect(await myReview()).toMatchObject({ progress_done: 60, progress_total: 120 });
  });

  it('are public with the review, but another family can’t change them', async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    const rows = ok(await anon.from('reviews').select('progress_done, progress_total').eq('listing_id', listingId)) as { progress_done: number }[];
    expect(rows).toEqual([{ progress_done: 60, progress_total: 120 }]);
    await seller.from('reviews').update({ progress_done: 1 }).eq('listing_id', listingId);
    expect(await myReview()).toMatchObject({ progress_done: 60 });
  });
});
