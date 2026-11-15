/// <reference types="node" />
// The Marketplace on the server, end to end and as real users: the catalog
// (the free & open Library seed included), claiming free curricula, checkout
// pricing (sales, bundles, coupons, and their abuse), payment settlement,
// gifts, reviews and helpful votes, family sellers, and moderation guards.
// Everything is created fresh per run; nothing depends on other test files.
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55421';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const RETURN = 'http://localhost:8081/market';
const P = (s: string) => `${s}-${run}`;

const anon = createClient(URL, KEY, { auth: { persistSession: false } });
async function user(name: string): Promise<SupabaseClient> {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signUp({ email: `${name}-${run}@example.test`, password: 'test-password-1' });
  if (error) throw error;
  return c;
}
async function family(name: string): Promise<{ c: SupabaseClient; fid: string; uid: string }> {
  const c = await user(name);
  const fid = (ok(await c.rpc('create_family', { family_name: `The ${name} Family`, initial_data: {} })) as { family_id: string }[])[0].family_id;
  return { c, fid, uid: (await c.auth.getUser()).data.user!.id };
}
const ok = <T,>(r: { data: T; error: unknown }) => {
  if (r.error) throw r.error;
  return r.data;
};
const errOf = (r: { error: { message?: string } | null }) => r.error?.message ?? '';
/** SQL as the database owner: fixtures, and the service-role-only functions the payment webhooks call. */
const sql = (cmd: string) => execFileSync('docker', ['exec', '-i', 'supabase_db_freerange', 'psql', '-U', 'postgres', '-tAqc', cmd]).toString().trim();
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** The same, without waiting: resolves with the output, or the error text. */
const sqlAsync = (cmd: string) =>
  new Promise<string>((resolve) => execFile('docker', ['exec', '-i', 'supabase_db_freerange', 'psql', '-U', 'postgres', '-tAq', '-v', 'ON_ERROR_STOP=1', '-c', cmd], (e, out, err) => resolve(e ? `ERROR ${err}` : out.trim())));

/** The error message an Edge Function sent back (it's in the response body). */
async function fnError(r: { error: unknown }): Promise<{ status?: number; message: string }> {
  const ctx = (r.error as { context?: Response } | null)?.context;
  if (!ctx) return { message: String((r.error as Error | null)?.message ?? '') };
  const body = await ctx.json().catch(() => ({}));
  return { status: ctx.status, message: body?.error ?? '' };
}
const buy = (c: SupabaseClient, body: Record<string, unknown>) => c.functions.invoke('create-checkout', { body: { fundingSource: 'out_of_pocket', returnUrl: RETURN, ...body } });
const quote = (c: SupabaseClient, kind: string, id: string, code: string | null = null) => c.rpc('price_quote', { target_kind: kind, target_id: id, coupon_code: code });

const lesson = (id: string, title: string) => ({ id, title, steps: ['Read'], links: [], questions: [] });
const pkg = (id: string, title: string, price: number, n = 2) => ({
  id, title, description: `${title}: hands-on lessons.`, subjects: ['science'], gradeMin: 1, gradeMax: 4, philosophies: [], parentInvolvement: 'medium', familyStyle: false,
  minutesPerLesson: 30, lessonsPerWeek: 2, format: 'digital', cover: '🐸', color: '#2F6B5E', price, units: [{ id: `${id}-u`, title: 'Unit', lessons: Array.from({ length: n }, (_, i) => lesson(`${id}-${i}`, `Lesson ${i + 1}`)) }],
  origin: { kind: 'original' }, license: { kind: 'all_rights_reserved' }, status: 'draft', version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
async function publish(c: SupabaseClient, key: string, title: string, price: number, n = 2): Promise<string> {
  const id = P(key);
  ok(await c.from('packages').upsert({ id, title, origin_kind: 'original', content: pkg(id, title, price, n) }));
  return (ok(await c.rpc('publish_package', { pkg_id: id })) as { id: string }).id;
}
const familyListing = (fid: string, p: Record<string, unknown> = {}) => ({ seller_family: fid, seller_name: 'Sam R.', title: `Used set ${run}`, subjects: ['math'], grade_min: 2, grade_max: 3, format: 'print', price: 12, lessons: 30, condition: 'good', ...p });

let creator: SupabaseClient; // a Studio creator (no family)
let creator2: SupabaseClient;
let a: Awaited<ReturnType<typeof family>>;
let b: Awaited<ReturnType<typeof family>>; // connected to a
let c: Awaited<ReturnType<typeof family>>;
let d: Awaited<ReturnType<typeof family>>;
let seller: Awaited<ReturnType<typeof family>>; // sells used books
let outsider: SupabaseClient; // signed in, no family
let pond: string; // $20
let birds: string; // $10
let notes: string; // free
let pricey: string; // $40, for settlement
let other: string; // creator2's $15

beforeAll(async () => {
  [creator, creator2, outsider] = await Promise.all([user('maker'), user('maker2'), user('outsider')]);
  [a, b, c, d, seller] = await Promise.all([family('a'), family('b'), family('c'), family('d'), family('seller')]);
  ok(await a.c.from('connections').insert({ from_family: a.fid, to_family: b.fid, message: 'Hi!' }));
  ok(await b.c.from('connections').update({ status: 'accepted' }).eq('from_family', a.fid).eq('to_family', b.fid));
  ok(await creator.from('creator_profiles').insert({ name: `Pond Maker ${run}` }));
  ok(await creator2.from('creator_profiles').insert({ name: `Other Maker ${run}` }));
  pond = await publish(creator, 'pond', 'Pond Life', 20);
  birds = await publish(creator, 'birds', 'Bird Math', 10);
  notes = await publish(creator, 'notes', 'Nature Notes', 0);
  pricey = await publish(creator, 'pricey', 'Big Pond Year', 40, 3);
  other = await publish(creator2, 'other', 'Other Science', 15);
});

// ───────────────────────────── Catalog

type CatalogEntry = { key: string; title: string; seller: string; lessons: number; version?: number; license: { kind: string }; subjects: string[]; gradeMin: number; gradeMax: number };
const catalog = JSON.parse(readFileSync(new globalThis.URL('../../src/lib/library/catalog.json', import.meta.url), 'utf8')) as CatalogEntry[];

describe('catalog', () => {
  it('shows anyone, signed out too, every free & open curriculum the app bundles', async () => {
    const rows = ok(await anon.from('listings').select('id, title, seller_name, seller_kind, price, lessons, package_version, license, status, attribution, subjects, grade_min, grade_max').like('id', 'l-lib-%')) as {
      id: string; title: string; seller_name: string; seller_kind: string; price: number; lessons: number; package_version: number; license: { kind: string }; status: string; attribution: string; subjects: string[]; grade_min: number; grade_max: number;
    }[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const e of catalog) {
      const r = byId.get(`l-lib-${e.key}`);
      expect(r, `${e.key} is seeded (npm run library:gen, then load supabase/seed.sql)`).toBeTruthy();
      expect(r).toMatchObject({ title: e.title, seller_name: e.seller, seller_kind: 'open', lessons: e.lessons, package_version: e.version ?? 1, status: 'active', subjects: e.subjects, grade_min: e.gradeMin, grade_max: e.gradeMax });
      expect(Number(r!.price)).toBe(0);
      expect(r!.license.kind).toBe(e.license.kind);
      expect(r!.attribution.length).toBeGreaterThan(20);
    }
  });

  it('has the full lesson plan of every Library curriculum, at the listed version', () => {
    const out = sql(`select l.id || '|' || l.lessons || '|' || coalesce((select count(*) from public.package_releases r, jsonb_array_elements(r.content -> 'units') u, jsonb_array_elements(u -> 'lessons') le where r.listing_id = l.id and r.version = l.package_version), 0) from public.listings l where l.id like 'l-lib-%' order by 1`);
    const lines = out.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(catalog.length);
    for (const line of lines) {
      const [id, lessons, inRelease] = line.split('|');
      expect(Number(inRelease), id).toBe(Number(lessons));
    }
  });

  it('gives a free plan to anyone signed in, but not to signed-out visitors', async () => {
    const lid = `l-lib-${catalog[0].key}`;
    const content = ok(await outsider.rpc('package_content', { lid })) as { units: unknown[]; attribution: string };
    expect(content.units.length).toBeGreaterThan(0);
    expect(content.attribution).toBeTruthy();
    expect((await anon.rpc('package_content', { lid })).error).toBeTruthy();
  });

  it('only the database seed adds free & open curricula; nobody edits them', async () => {
    expect((await seller.c.from('listings').insert(familyListing(seller.fid, { seller_kind: 'open' }))).error).toBeTruthy();
    expect((await seller.c.from('listings').insert(familyListing(seller.fid, { seller_kind: 'creator' }))).error).toBeTruthy();
    const lid = `l-lib-${catalog[0].key}`;
    for (const cl of [a.c, creator, outsider]) expect(ok(await cl.from('listings').update({ price: 99, title: 'Mine now' }).eq('id', lid).select())).toHaveLength(0);
    expect(ok(await anon.from('listings').select('title, price').eq('id', lid).single())).toEqual({ title: catalog[0].title, price: 0 });
  });

  it('keeps creators’ listings managed through Studio, not direct edits', async () => {
    expect(ok(await creator.from('listings').update({ price: 1 }).eq('id', pond).select())).toHaveLength(0);
    expect(Number((ok(await anon.from('listings').select('price').eq('id', pond).single()) as { price: number }).price)).toBe(20);
  });
});

// ───────────────────────────── Selling used curricula

describe('family sellers', () => {
  let used: string;

  it('validate what goes on a listing', async () => {
    const bad: Record<string, unknown>[] = [{ price: -1 }, { price: 10001 }, { grade_min: 5, grade_max: 2 }, { grade_min: -2 }, { lessons: 0 }, { lessons: 2001 }, { format: 'scroll' }, { condition: 'mint' }, { title: '' }, { title: 'x'.repeat(161) }, { seller_name: '' }, { minutes_per_lesson: 481 }, { lessons_per_week: 8 }, { description: 'x'.repeat(4001) }];
    for (const p of bad) expect((await seller.c.from('listings').insert(familyListing(seller.fid, p))).error, JSON.stringify(p)).toBeTruthy();
    // Only for their own family, and never for someone without one.
    expect((await seller.c.from('listings').insert(familyListing(a.fid))).error).toBeTruthy();
    expect((await outsider.from('listings').insert(familyListing(seller.fid))).error).toBeTruthy();
    expect((await anon.from('listings').insert(familyListing(seller.fid))).error).toBeTruthy();
  });

  it('list, edit, and remove their own listing; nobody else can', async () => {
    const row = ok(await seller.c.from('listings').insert(familyListing(seller.fid)).select().single()) as { id: string; seller_kind: string; status: string };
    used = row.id;
    expect(row).toMatchObject({ seller_kind: 'family', status: 'active' });
    expect(ok(await anon.from('listings').select('id').eq('id', used))).toHaveLength(1);
    // Edits stay on the family's own listing.
    expect(ok(await seller.c.from('listings').update({ price: 9, seller_family: a.fid, rating_count: 50, sample: true }).eq('id', used).select('price, seller_family, rating_count, sample').single())).toEqual({ price: 9, seller_family: seller.fid, rating_count: 0, sample: false });
    for (const cl of [a.c, outsider, creator]) expect(ok(await cl.from('listings').update({ price: 1 }).eq('id', used).select())).toHaveLength(0);
    await anon.from('listings').update({ price: 1 }).eq('id', used);
    expect(Number((ok(await anon.from('listings').select('price').eq('id', used).single()) as { price: number }).price)).toBe(9);
  });

  it('are priced like any listing (with their own sale), and can’t buy their own', async () => {
    const ends = new Date(Date.now() + 3 * 86400000).toISOString();
    ok(await seller.c.rpc('set_listing_sale', { lid: used, pct: 50, ends }));
    expect(ok(await quote(a.c, 'listing', used))).toMatchObject({ list_price: 9, price: 4.5, total: 4.5 });
    expect(errOf(await quote(seller.c, 'listing', used))).toMatch(/your own listing/);
    expect((await fnError(await buy(seller.c, { listingId: used }))).message).toMatch(/your own listing/);
    // A family listing has no creator, so no creator's coupon works on it.
    ok(await creator.from('coupons').insert({ code: P('ANY').toUpperCase().slice(0, 24), kind: 'percent', amount: 50 }));
    expect(errOf(await quote(a.c, 'listing', used, P('ANY').slice(0, 24)))).toMatch(/doesn't work/);
    // A sale can't be more than 90% off, even written straight to the row.
    expect((await seller.c.from('listings').update({ sale_percent: 99 }).eq('id', used)).error).toBeTruthy();
    ok(await seller.c.rpc('set_listing_sale', { lid: used, pct: null, ends: null }));
    expect(ok(await quote(a.c, 'listing', used))).toMatchObject({ price: 9, sale_percent: null });
  });

  it('disappear from the catalog once removed; buyers keep their purchase', async () => {
    const { data, error } = await buy(a.c, { listingId: used, fundingSource: 'tax' });
    expect(error).toBeNull();
    expect(data.purchase).toMatchObject({ status: 'paid', funding_source: 'tax', listing_id: used, demo: true });
    ok(await seller.c.from('listings').update({ status: 'removed' }).eq('id', used));
    expect(ok(await anon.from('listings').select('id').eq('id', used))).toHaveLength(0);
    expect(ok(await b.c.from('listings').select('id').eq('id', used))).toHaveLength(0);
    expect(ok(await seller.c.from('listings').select('status').eq('id', used).single())).toEqual({ status: 'removed' });
    expect(ok(await a.c.from('purchases').select('status').eq('listing_id', used))).toEqual([{ status: 'paid' }]);
    expect(errOf(await quote(b.c, 'listing', used))).toMatch(/no longer available/);
    expect((await fnError(await buy(b.c, { listingId: used }))).message).toMatch(/no longer available/);
  });
});

// ───────────────────────────── Free curricula

describe('claiming free curricula', () => {
  it('needs an account and a family', async () => {
    expect((await anon.rpc('claim_free_listing', { lid: notes })).error).toBeTruthy();
    expect(errOf(await outsider.rpc('claim_free_listing', { lid: notes }))).toMatch(/family first/);
    expect(errOf(await a.c.rpc('claim_free_listing', { lid: 'no-such-listing' }))).toMatch(/no longer available/);
  });

  it('is idempotent: claiming twice keeps one purchase', async () => {
    const first = ok(await c.c.rpc('claim_free_listing', { lid: notes })) as { id: string; status: string; price: number };
    expect(first).toMatchObject({ status: 'free' });
    const again = ok(await c.c.rpc('claim_free_listing', { lid: notes })) as { id: string };
    expect(again.id).toBe(first.id);
    expect(ok(await c.c.from('purchases').select('id').eq('listing_id', notes))).toHaveLength(1);
    // Purchases are only ever written by the server, and stay private to the family.
    expect(ok(await c.c.from('purchases').update({ price: 99, status: 'paid' }).eq('id', first.id).select())).toHaveLength(0);
    await c.c.from('purchases').delete().eq('id', first.id);
    expect(ok(await c.c.from('purchases').select('id').eq('id', first.id))).toHaveLength(1);
    expect(ok(await d.c.from('purchases').select('id').eq('id', first.id))).toHaveLength(0);
    expect(ok(await anon.from('purchases').select('id'))).toHaveLength(0);
  });

  it('refuses paid listings, even ones a coupon would make free', async () => {
    expect(errOf(await a.c.rpc('claim_free_listing', { lid: pond }))).toMatch(/not free/);
  });
});

// ───────────────────────────── Checkout

describe('checkout', () => {
  it('needs an account with a family, and a well-formed request', async () => {
    expect(await fnError(await buy(anon, { listingId: pond }))).toMatchObject({ status: 401 });
    expect(await fnError(await buy(outsider, { listingId: pond }))).toMatchObject({ status: 400, message: expect.stringMatching(/family/) });
    expect(await fnError(await buy(a.c, { listingId: pond, fundingSource: 'bitcoin' }))).toMatchObject({ status: 400, message: 'Bad request' });
    expect(await fnError(await buy(a.c, { listingId: 42 }))).toMatchObject({ status: 400 });
    expect(await fnError(await buy(a.c, { listingId: pond, coupon: 5 }))).toMatchObject({ status: 400 });
    expect(await fnError(await buy(a.c, { listingId: pond, returnUrl: 'http://localhost:8081.evil.example/market' }))).toMatchObject({ message: expect.stringMatching(/Return address/) });
    expect(await fnError(await buy(a.c, { listingId: 'no-such-listing' }))).toMatchObject({ status: 400, message: expect.stringMatching(/no longer available/) });
  });

  it('charges the server’s price, never the one the app sends', async () => {
    const { data, error } = await buy(d.c, { listingId: birds, fundingSource: 'esa', price: 0.01, total: 0, amount: 0 });
    expect(error).toBeNull();
    expect(Number(data.total)).toBe(10);
    expect(data.purchase).toMatchObject({ status: 'paid', funding_source: 'esa', demo: true });
    expect(Number(data.purchase.price)).toBe(10);
    // The plan comes with the purchase.
    expect((ok(await d.c.rpc('package_content', { lid: birds })) as { units: unknown[] }).units).toHaveLength(1);
  });

  it('doesn’t charge twice for something the family already has', async () => {
    const before = ok(await d.c.from('purchases').select('id').eq('listing_id', birds)) as { id: string }[];
    const { data, error } = await buy(d.c, { listingId: birds });
    expect(error).toBeNull();
    expect(data.purchase.id).toBe(before[0].id);
    expect(Number(data.total)).toBe(0);
    expect(ok(await d.c.from('purchases').select('id').eq('listing_id', birds))).toHaveLength(1);
  });

  it('keeps paid plans locked until bought', async () => {
    expect(errOf(await b.c.rpc('package_content', { lid: pricey }))).toMatch(/Get this curriculum first/);
    expect(ok(await creator.rpc('package_content', { lid: pricey }))).toBeTruthy();
  });
});

// ───────────────────────────── Coupons

describe('coupons', () => {
  const code = (s: string) => `${s}${run}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);

  beforeAll(async () => {
    const day = 86400000;
    ok(await creator.from('coupons').insert([
      { code: code('ONCE'), kind: 'percent', amount: 10, max_uses: 1 },
      { code: code('RACE'), kind: 'percent', amount: 10, max_uses: 1 },
      { code: code('OLD'), kind: 'percent', amount: 50, expires_at: new Date(Date.now() - day).toISOString() },
      { code: code('SOON'), kind: 'percent', amount: 50, expires_at: new Date(Date.now() + day).toISOString() },
      { code: code('PONDFIVE'), kind: 'fixed', amount: 5, listing_id: pond },
      { code: code('HUGE'), kind: 'fixed', amount: 999 },
      { code: code('OFF'), kind: 'percent', amount: 50, active: false },
      { code: code('FULL'), kind: 'percent', amount: 100 },
    ], { defaultToNull: false }));
    ok(await creator2.from('coupons').insert({ code: code('THEIRS'), kind: 'percent', amount: 50 }));
  });

  it('can’t be made with bad values or for someone else’s curricula', async () => {
    const bad: Record<string, unknown>[] = [
      { code: code('NEG'), kind: 'fixed', amount: -5 },
      { code: code('ZERO'), kind: 'percent', amount: 0 },
      { code: code('OVER'), kind: 'percent', amount: 101 },
      { code: 'AB', kind: 'percent', amount: 10 },
      { code: 'HAS SPACE', kind: 'percent', amount: 10 },
      { code: 'X'.repeat(25), kind: 'percent', amount: 10 },
      { code: code('KIND'), kind: 'bogo', amount: 10 },
      { code: code('MAX'), kind: 'percent', amount: 10, max_uses: 0 },
      { code: code('THEIRL'), kind: 'percent', amount: 10, listing_id: other },
      { code: code('ONCE'), kind: 'percent', amount: 20 },
    ];
    for (const p of bad) expect((await creator.from('coupons').insert(p)).error, JSON.stringify(p)).toBeTruthy();
    // Anyone signed in can run a shop, but a code only works in its own shop: a
    // family's "coupon" for someone else's curriculum does nothing.
    expect((await a.c.from('coupons').insert({ code: code('FAM'), kind: 'percent', amount: 90, listing_id: pond })).error).toBeTruthy();
    ok(await a.c.from('coupons').insert({ code: code('FAM'), kind: 'percent', amount: 90 }));
    expect(errOf(await quote(b.c, 'listing', pond, code('FAM')))).toMatch(/doesn't work/);
    sql(`delete from public.coupons where code = ${lit(code('FAM'))}`);
    expect((await anon.from('coupons').insert({ code: code('ANON'), kind: 'percent', amount: 10 })).error).toBeTruthy();
    expect(ok(await b.c.from('coupons').select('id'))).toHaveLength(0);
    expect(ok(await creator2.from('coupons').select('code'))).toEqual([{ code: code('THEIRS') }]);
    // The same code in another creator's shop is fine.
    ok(await creator2.from('coupons').insert({ code: code('ONCE'), kind: 'percent', amount: 5 }));
  });

  it('can’t have their use count or owner changed', async () => {
    const [once] = ok(await creator.from('coupons').update({ uses: -100, max_uses: 1 }).eq('code', code('ONCE')).select('uses, creator_user')) as { uses: number; creator_user: string }[];
    expect(once.uses).toBe(0);
    const theirs = (await creator2.auth.getUser()).data.user!.id;
    const [moved] = ok(await creator.from('coupons').update({ creator_user: theirs }).eq('code', code('SOON')).select('creator_user')) as { creator_user: string }[];
    expect(moved.creator_user).not.toBe(theirs);
    // Pointing a coupon at someone else's curriculum later doesn't work either.
    expect((await creator.from('coupons').update({ listing_id: other }).eq('code', code('SOON'))).error).toBeTruthy();
    expect(ok(await creator2.from('coupons').update({ amount: 100 }).eq('code', code('SOON')).select())).toHaveLength(0);
  });

  it('are refused with the reason: wrong curriculum, wrong shop, inactive, expired', async () => {
    expect(errOf(await quote(a.c, 'listing', birds, code('PONDFIVE')))).toMatch(/doesn't work/);
    expect(errOf(await quote(a.c, 'listing', pond, code('THEIRS')))).toMatch(/doesn't work/);
    expect(errOf(await quote(a.c, 'listing', pond, code('OFF')))).toMatch(/doesn't work/);
    expect(errOf(await quote(a.c, 'listing', pond, 'NOSUCHCODE'))).toMatch(/doesn't work/);
    expect(errOf(await quote(a.c, 'listing', pond, code('OLD')))).toMatch(/expired/);
    expect((await fnError(await buy(a.c, { listingId: pond, coupon: code('OLD') }))).message).toMatch(/expired/);
    expect(ok(await quote(a.c, 'listing', pond, `  ${code('soon').toLowerCase()} `))).toMatchObject({ price: 20, discount: 10, total: 10 });
    // A blank code is no code.
    expect(ok(await quote(a.c, 'listing', pond, '   '))).toMatchObject({ total: 20, coupon_id: null });
  });

  it('never take the price below zero; a big enough one makes it free', async () => {
    expect(ok(await quote(a.c, 'listing', pond, code('HUGE')))).toMatchObject({ price: 20, discount: 20, total: 0 });
    const { data, error } = await buy(a.c, { listingId: pond, coupon: code('HUGE'), fundingSource: 'esa' });
    expect(error).toBeNull();
    expect(data.purchase).toMatchObject({ status: 'free', funding_source: 'out_of_pocket', demo: false });
    expect(Number(data.purchase.price)).toBe(0);
    expect(Number(data.purchase.list_price)).toBe(20);
  });

  it('run out after their maximum uses', async () => {
    const { data, error } = await buy(b.c, { listingId: birds, coupon: code('ONCE') });
    expect(error).toBeNull();
    expect(Number(data.purchase.price)).toBe(9);
    expect(errOf(await quote(c.c, 'listing', birds, code('ONCE')))).toMatch(/used up/);
    expect((await fnError(await buy(c.c, { listingId: birds, coupon: code('ONCE') }))).message).toMatch(/used up/);
    expect(ok(await creator.from('coupons').select('uses').eq('code', code('ONCE')).single())).toEqual({ uses: 1 });
  });

  it('can’t be used more times than allowed by buying at the same moment', async () => {
    const racers = await Promise.all(['r1', 'r2', 'r3', 'r4'].map((n) => family(n)));
    const results = await Promise.all(racers.map((f) => buy(f.c, { listingId: pond, coupon: code('RACE') })));
    const won = results.filter((r) => !r.error && r.data?.purchase);
    expect(won).toHaveLength(1);
    expect(ok(await creator.from('coupons').select('uses').eq('code', code('RACE')).single())).toEqual({ uses: 1 });
  });

  it('can’t be used twice by two checkouts that overlap in the database', async () => {
    // Checkout 1 takes the last use and is still running (its transaction is
    // open) when checkout 2 prices the order and tries to take a use too.
    const cp = code('LAST');
    ok(await creator.from('coupons').insert({ code: cp, kind: 'percent', amount: 10, max_uses: 1 }));
    const [p1, p2] = await Promise.all(['l1', 'l2'].map((n) => family(n)));
    const call = (f: typeof p1) => `select public.checkout_record(${lit(f.fid)}, ${lit(f.uid)}, 'listing', ${lit(birds)}, ${lit(cp)}, 'tax', 'paid', true, null)`;
    const marker = `race-${run}`;
    const first = sqlAsync(`begin; ${call(p1)}; select pg_sleep(2) /* ${marker} */; commit;`);
    for (const end = Date.now() + 10000; Date.now() < end; ) {
      if (sql(`select count(*) from pg_stat_activity where query like '%pg_sleep(2) /* ${marker} */%' and pid <> pg_backend_pid()`) !== '0') break;
    }
    const second = await sqlAsync(call(p2));
    expect(await first).not.toMatch(/ERROR/);
    expect(second).toMatch(/used up/);
    expect(ok(await creator.from('coupons').select('uses').eq('code', cp).single())).toEqual({ uses: 1 });
    expect(ok(await p2.c.from('purchases').select('id'))).toHaveLength(0);
  });
});

// ───────────────────────────── Bundles

describe('bundles', () => {
  let bundle: string;
  let moreBirds: string;

  it('hold only the creator’s own active curricula, each once', async () => {
    moreBirds = await publish(creator, 'more-birds', 'More Bird Math', 10);
    const removed = await publish(creator, 'gone', 'Gone Soon', 8);
    ok(await creator.rpc('unpublish_package', { pkg_id: P('gone') }));
    for (const ids of [[pond], [pond, pond], [pond, other], [pond, removed], [pond, 'no-such-listing']]) {
      expect((await creator.from('bundles').insert({ title: 'Bad', listing_ids: ids, price: 5 })).error, ids.join()).toBeTruthy();
    }
    expect((await creator.from('bundles').insert({ title: 'Free?', listing_ids: [pond, moreBirds], price: -1 })).error).toBeTruthy();
    bundle = (ok(await creator.from('bundles').insert({ title: P('Birds and pond'), listing_ids: [moreBirds, pricey], price: 45 }).select().single()) as { id: string }).id;
    expect(ok(await anon.from('bundles').select('id, price').eq('id', bundle).single())).toEqual({ id: bundle, price: 45 });
    // Only the creator edits it, and the price rule holds on edits too.
    expect(ok(await creator2.from('bundles').update({ price: 1 }).eq('id', bundle).select())).toHaveLength(0);
    expect((await creator.from('bundles').update({ price: 50 }).eq('id', bundle)).error?.message).toMatch(/cost less/);
  });

  it('charge only for what the family doesn’t have yet', async () => {
    // d already owns birds, not moreBirds: buy moreBirds alone first.
    ok(await buy(d.c, { listingId: moreBirds }));
    const q = ok(await quote(d.c, 'bundle', bundle)) as { list_price: number; price: number; owned: string[]; items: { listing_id: string }[] };
    expect(q).toMatchObject({ list_price: 40, price: 40, owned: [moreBirds] });
    expect(q.items.map((i) => i.listing_id)).toEqual([pricey]);
  });

  it('refuse coupons for a single curriculum, take shop-wide ones', async () => {
    ok(await creator.from('coupons').insert([{ code: `BPOND${run}`.toUpperCase().slice(0, 24), kind: 'fixed', amount: 5, listing_id: pond }, { code: `BALL${run}`.toUpperCase().slice(0, 24), kind: 'fixed', amount: 5 }]));
    expect(errOf(await quote(c.c, 'bundle', bundle, `BPOND${run}`.slice(0, 24)))).toMatch(/doesn't work/);
    expect(ok(await quote(c.c, 'bundle', bundle, `BALL${run}`.slice(0, 24)))).toMatchObject({ price: 45, discount: 5, total: 40 });
  });

  it('stop selling once removed, and leave out curricula that were taken down', async () => {
    ok(await creator.rpc('unpublish_package', { pkg_id: P('more-birds') }));
    // Only Big Pond Year is left; it costs less alone than the bundle price.
    expect(ok(await quote(c.c, 'bundle', bundle))).toMatchObject({ list_price: 40, price: 40 });
    ok(await creator.from('bundles').delete().eq('id', bundle));
    expect(ok(await anon.from('bundles').select('id').eq('id', bundle))).toHaveLength(0);
    expect(errOf(await quote(c.c, 'bundle', bundle))).toMatch(/no longer available/);
    expect((await fnError(await buy(c.c, { bundleId: bundle }))).message).toMatch(/no longer available/);
  });
});

// ───────────────────────────── Settlement (Stripe)

describe('payment settlement', () => {
  const record = (fid: string, uid: string, kind: string, id: string, coupon: string | null = null, gift: Record<string, unknown> | null = null) =>
    JSON.parse(sql(`select public.checkout_record(${lit(fid)}, ${lit(uid)}, ${lit(kind)}, ${lit(id)}, ${coupon ? lit(coupon) : 'null'}, 'esa', 'pending', false, ${gift ? `${lit(JSON.stringify(gift))}::jsonb` : 'null'})`)) as { order_id: string; total: number; purchases?: { id: string; status: string }[]; gift?: { id: string; code: string; status: string } };
  const settle = (sid: string | null, paid: boolean, ref: string | null = null) => sql(`select public.settle_order(${sid ? lit(sid) : 'null'}, ${paid}, ${ref ? lit(ref) : 'null'})`);
  const status = async (cl: SupabaseClient, lid: string) => (ok(await cl.from('purchases').select('status').eq('listing_id', lid)) as { status: string }[]).map((r) => r.status);

  it('are the payment webhook’s alone: families can’t record or settle orders', async () => {
    expect((await a.c.rpc('settle_order', { sid: 'cs_test', paid: true })).error).toBeTruthy();
    expect((await a.c.rpc('checkout_record', { buyer_family: a.fid, buyer_user: a.uid, target_kind: 'listing', target_id: pricey, coupon_code: null, funding: 'esa', pay_status: 'paid', is_demo: false })).error).toBeTruthy();
    expect((await anon.rpc('settle_order', { sid: 'cs_test', paid: true })).error).toBeTruthy();
    expect((await a.c.rpc('quote_order', { target_kind: 'listing', target_id: pricey, coupon_code: null, fid: a.fid, buyer: a.uid })).error).toBeTruthy();
  });

  it('keep a pending order locked until Stripe says it’s paid, then unlock it once', async () => {
    const o = record(c.fid, c.uid, 'listing', pricey);
    expect(o.purchases?.[0].status).toBe('pending');
    sql(`update public.purchases set provider_session = ${lit(`cs_${run}_1`)} where id = ${lit(o.order_id)}`);
    expect(await status(c.c, pricey)).toEqual(['pending']);
    expect((await c.c.rpc('package_content', { lid: pricey })).error).toBeTruthy();
    // A pending order doesn't count as owning it, for reviews or buying again.
    settle(`cs_${run}_1`, true);
    expect(await status(c.c, pricey)).toEqual(['paid']);
    expect((ok(await c.c.rpc('package_content', { lid: pricey })) as { units: unknown[] }).units).toHaveLength(1);
    // A late "expired" event can't take it back.
    settle(`cs_${run}_1`, false);
    expect(await status(c.c, pricey)).toEqual(['paid']);
    expect(ok(await c.c.from('purchases').select('paid_at').eq('listing_id', pricey).single())).toMatchObject({ paid_at: expect.any(String) });
  });

  it('cancel an expired checkout and give the coupon use back', async () => {
    const cp = `EXP${run}`.toUpperCase().slice(0, 24);
    ok(await creator.from('coupons').insert({ code: cp, kind: 'percent', amount: 25, max_uses: 1 }));
    const o = record(b.fid, b.uid, 'listing', pricey, cp);
    expect(ok(await creator.from('coupons').select('uses').eq('code', cp).single())).toEqual({ uses: 1 });
    sql(`update public.purchases set provider_session = ${lit(`cs_${run}_2`)} where id = ${lit(o.order_id)}`);
    settle(`cs_${run}_2`, false);
    expect(await status(b.c, pricey)).toEqual(['cancelled']);
    expect(ok(await creator.from('coupons').select('uses').eq('code', cp).single())).toEqual({ uses: 0 });
    // Settling the same expiry twice doesn't hand out an extra use.
    settle(`cs_${run}_2`, false);
    expect(ok(await creator.from('coupons').select('uses').eq('code', cp).single())).toEqual({ uses: 0 });
    expect(ok(await quote(d.c, 'listing', pricey, cp))).toMatchObject({ total: 30 });
  });

  it('settle every curriculum in a bundle order together, even one whose session never started', async () => {
    const pair = (ok(await creator.from('bundles').insert({ title: P('Pair'), listing_ids: [pond, pricey], price: 50 }).select().single()) as { id: string }).id;
    const o = record(b.fid, b.uid, 'bundle', pair);
    expect(o.purchases?.map((p) => p.status)).toEqual(['pending', 'pending']);
    settle(null, false, o.order_id);
    expect([...(await status(b.c, pond)), ...(await status(b.c, pricey))].sort()).toEqual(['cancelled', 'cancelled', 'cancelled']);
    const o2 = record(b.fid, b.uid, 'bundle', pair);
    sql(`update public.purchases set provider_session = ${lit(`cs_${run}_3`)} where id = ${lit(o2.order_id)}`);
    settle(`cs_${run}_3`, true);
    const rows = ok(await b.c.from('purchases').select('listing_id, status, order_id').eq('order_id', o2.order_id)) as { listing_id: string; status: string }[];
    expect(rows.map((r) => r.status)).toEqual(['paid', 'paid']);
  });

  it('make a paid gift claimable only after payment', async () => {
    const o = record(a.fid, a.uid, 'listing', other, null, { family_id: b.fid, note: 'For you' });
    expect(o.gift?.status).toBe('pending');
    expect(errOf(await b.c.rpc('claim_gift', { gift_code: o.gift!.code }))).toMatch(/isn't valid/);
    expect((ok(await b.c.rpc('my_gifts')) as { id: string }[]).some((g) => g.id === o.gift!.id)).toBe(false);
    sql(`update public.gifts set provider_session = ${lit(`cs_${run}_4`)} where id = ${lit(o.gift!.id)}`);
    settle(`cs_${run}_4`, true);
    expect((ok(await b.c.rpc('my_gifts')) as { id: string }[]).some((g) => g.id === o.gift!.id)).toBe(true);
    expect(ok(await b.c.rpc('claim_gift', { gift_code: o.gift!.code }))).toMatchObject({ status: 'paid', gift_from: 'The a Family' });
  });

  it('ignore webhook calls without a valid Stripe signature', async () => {
    const o = record(d.fid, d.uid, 'listing', other);
    const sid = `cs_${run}_5`;
    sql(`update public.purchases set provider_session = ${lit(sid)} where id = ${lit(o.order_id)}`);
    const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: sid, payment_status: 'paid' } } });
    for (const sig of [undefined, 't=1,v1=deadbeef', `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`]) {
      const res = await fetch(`${URL}/functions/v1/stripe-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sig ? { 'stripe-signature': sig } : {}) }, body: event });
      expect([400, 503], `signature ${sig}`).toContain(res.status);
    }
    expect(await status(d.c, other)).toEqual(['pending']);
    settle(sid, false);
  });
});

// ───────────────────────────── Gifts

describe('gifts', () => {
  let code: string;

  it('need an account with a family', async () => {
    expect((await anon.rpc('send_gift', { lid: notes, to_family: b.fid })).error).toBeTruthy();
    expect((await anon.rpc('gift_preview', { gift_code: 'ABCDEFGHJK' })).error).toBeTruthy();
    expect((await anon.rpc('claim_gift', { gift_code: 'ABCDEFGHJK' })).error).toBeTruthy();
    expect(errOf(await outsider.rpc('send_gift', { lid: notes, to_email: 'x@example.test' }))).toMatch(/family first/);
    expect(ok(await a.c.rpc('gift_preview', { gift_code: 'NOSUCHCODE' }))).toBeNull();
  });

  it('go to someone else: not your own email or family, and families only when connected', async () => {
    expect(errOf(await a.c.rpc('send_gift', { lid: notes, to_email: `A-${run}@EXAMPLE.test` }))).toMatch(/your own email/);
    expect(errOf(await a.c.rpc('send_gift', { lid: notes, to_family: a.fid }))).toMatch(/other families/);
    expect(errOf(await a.c.rpc('send_gift', { lid: notes, to_family: d.fid }))).toMatch(/connected with/);
    expect(errOf(await a.c.rpc('send_gift', { lid: notes }))).toMatch(/Choose who/);
    expect(errOf(await a.c.rpc('send_gift', { lid: notes, to_email: 'x@example.test', to_family: b.fid }))).toMatch(/Choose who/);
    expect(errOf(await a.c.rpc('send_gift', { lid: notes, to_email: 'x@example.test', gift_note: 'x'.repeat(501) }))).toMatch(/under 500/);
    expect(errOf(await a.c.rpc('send_gift', { lid: 'no-such-listing', to_email: 'x@example.test' }))).toMatch(/no longer available/);
    // Paid gifts go through checkout, which can't be skipped by sending one "free".
    expect(errOf(await a.c.rpc('send_gift', { lid: other, to_family: b.fid }))).toMatch(/isn't free/);
  });

  it('for a family can only be claimed by that family, once', async () => {
    const g = ok(await a.c.rpc('send_gift', { lid: `l-lib-${catalog[1].key}`, to_family: b.fid, gift_note: 'Enjoy' })) as { code: string; status: string };
    code = g.code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(ok(await c.c.rpc('gift_preview', { gift_code: code }))).toMatchObject({ for_family: true, status: 'ready' });
    expect(errOf(await c.c.rpc('claim_gift', { gift_code: code }))).toMatch(/another family/);
    expect(errOf(await a.c.rpc('claim_gift', { gift_code: code }))).toMatch(/another family/);
    const p = ok(await b.c.rpc('claim_gift', { gift_code: ` ${code.toLowerCase()} ` })) as { id: string; status: string; price: number };
    expect(p).toMatchObject({ status: 'free' });
    // Claiming again hands back the same purchase rather than a second copy.
    expect((ok(await b.c.rpc('claim_gift', { gift_code: code })) as { id: string }).id).toBe(p.id);
    expect(errOf(await c.c.rpc('claim_gift', { gift_code: code }))).toMatch(/already been claimed/);
    // The recipient never sees the gifts table; the giver sees it claimed.
    expect(ok(await b.c.from('gifts').select('id'))).toHaveLength(0);
    expect(ok(await a.c.from('gifts').select('status, claimed_family').eq('code', code).single())).toEqual({ status: 'claimed', claimed_family: b.fid });
  });

  it('stay unclaimed when the recipient already has the curriculum', async () => {
    const g = ok(await a.c.rpc('send_gift', { lid: notes, to_email: `someone-${run}@example.test` })) as { code: string };
    expect(errOf(await c.c.rpc('claim_gift', { gift_code: g.code }))).toMatch(/already have this curriculum/);
    expect(ok(await a.c.from('gifts').select('status').eq('code', g.code).single())).toEqual({ status: 'ready' });
    // Anyone with an email gift's code can claim it.
    expect(ok(await d.c.rpc('claim_gift', { gift_code: g.code }))).toMatchObject({ gift_from: 'The a Family' });
  });

  it('can be taken back only by the giver, while free and unclaimed', async () => {
    const g = ok(await a.c.rpc('send_gift', { lid: notes, to_email: `later-${run}@example.test` })) as { id: string; code: string };
    expect(errOf(await b.c.rpc('cancel_gift', { gid: g.id }))).toMatch(/Only unclaimed free gifts/);
    expect(errOf(await outsider.rpc('cancel_gift', { gid: g.id }))).toMatch(/Only unclaimed free gifts/);
    ok(await a.c.rpc('cancel_gift', { gid: g.id }));
    expect(ok(await c.c.rpc('gift_preview', { gift_code: g.code }))).toMatchObject({ status: 'cancelled' });
    expect(errOf(await c.c.rpc('claim_gift', { gift_code: g.code }))).toMatch(/isn't valid/);
    expect(errOf(await a.c.rpc('cancel_gift', { gid: g.id }))).toMatch(/Only unclaimed free gifts/);
    const claimed = ok(await a.c.from('gifts').select('id').eq('code', code).single()) as { id: string };
    expect(errOf(await a.c.rpc('cancel_gift', { gid: claimed.id }))).toMatch(/Only unclaimed free gifts/);
  });

  it('bought at checkout aren’t paid with ESA funds and don’t give the giver a copy', async () => {
    const { data, error } = await buy(a.c, { listingId: other, fundingSource: 'esa', gift: { email: `gran-${run}@example.test`, note: 'x' } });
    expect(error).toBeNull();
    expect(data.gift).toMatchObject({ status: 'ready', demo: true });
    expect(Number(data.gift.price)).toBe(15);
    expect(ok(await a.c.from('purchases').select('id').eq('listing_id', other))).toHaveLength(0);
    expect(errOf(await a.c.rpc('cancel_gift', { gid: data.gift.id }))).toMatch(/Only unclaimed free gifts/);
    const p = ok(await c.c.rpc('claim_gift', { gift_code: data.gift.code })) as { funding_source: string; status: string };
    expect(p).toMatchObject({ funding_source: 'out_of_pocket', status: 'paid' });
    // A family gift through checkout still needs a connection.
    expect((await fnError(await buy(a.c, { listingId: other, gift: { familyId: d.fid } }))).message).toMatch(/connected with/);
  });
});

// ───────────────────────────── Reviews

describe('reviews', () => {
  let rid: string;
  const review = (cl: { c: SupabaseClient; fid: string }, lid: string, p: Record<string, unknown> = {}) =>
    cl.c.from('reviews').insert({ listing_id: lid, family_id: cl.fid, author_name: 'Pat Q.', rating: 4, body: 'Worked well for our crew this fall.', ...p }).select().single();

  it('are readable by anyone but written only by a family, for itself', async () => {
    expect((await anon.from('reviews').insert({ listing_id: pond, family_id: a.fid, author_name: 'X', rating: 5, body: 'Anonymous spam review!' })).error).toBeTruthy();
    expect((await outsider.from('reviews').insert({ listing_id: pond, family_id: a.fid, author_name: 'X', rating: 5, body: 'Pretending to be family A.' })).error).toBeTruthy();
    expect((await review(c, pond, { family_id: a.fid })).error).toBeTruthy();
    for (const p of [{ rating: 0 }, { rating: 6 }, { body: 'Too short' }, { author_name: '' }, { title: 'x'.repeat(121) }]) expect((await review(c, pond, p)).error, JSON.stringify(p)).toBeTruthy();
    expect((await creator.from('reviews').insert({ listing_id: pond, family_id: null, author_name: 'Maker', rating: 5, body: 'My own curriculum is great.' })).error).toBeTruthy();
  });

  it('are a verified purchase only when the family really bought it', async () => {
    const r = ok(await review(c, pond, { verified: true, helpful: 9, sample: true })) as { id: string; verified: boolean; helpful: number; sample: boolean };
    rid = r.id;
    expect(r).toMatchObject({ verified: false, helpful: 0, sample: false });
    expect(ok(await anon.from('reviews').select('id').eq('id', rid))).toHaveLength(1);
    // One review per family per curriculum.
    expect((await review(c, pond)).error).toBeTruthy();
    // After buying it, saving the review again derives the badge.
    ok(await buy(c.c, { listingId: pond }));
    expect(ok(await c.c.from('reviews').update({ body: 'Even better now that we bought the plan.' }).eq('id', rid).select('verified').single())).toEqual({ verified: true });
    const verified = ok(await review(a, pond)) as { verified: boolean };
    expect(verified.verified).toBe(true);
  });

  it('show progress worked out from the family’s own plan, never typed in', async () => {
    const r = ok(await review(b, pricey, { progress_done: 99, progress_total: 100 })) as { id: string; progress_done: number | null };
    expect(r.progress_done).toBeNull();
    const ws = ok(await b.c.from('workspaces').select('version').eq('family_id', b.fid).single()) as { version: number };
    const curricula = [{ listingId: pricey, totalLessons: 3, lessonsDone: 1, childIds: ['k1', 'k2'], progress: { k1: 2 } }];
    expect((ok(await b.c.rpc('push_workspace', { fid: b.fid, base_version: ws.version, new_data: { curricula } })) as { ok: boolean }[])[0].ok).toBe(true);
    expect(ok(await anon.from('reviews').select('progress_done, progress_total').eq('id', r.id).single())).toEqual({ progress_done: 2, progress_total: 3 });
    ok(await b.c.from('reviews').update({ show_progress: false }).eq('id', r.id));
    expect(ok(await anon.from('reviews').select('progress_done, progress_total').eq('id', r.id).single())).toEqual({ progress_done: null, progress_total: null });
  });

  it('can’t be edited or deleted by anyone else, and keep the rating in step', async () => {
    expect(ok(await d.c.from('reviews').update({ rating: 1 }).eq('id', rid).select())).toHaveLength(0);
    ok(await d.c.from('reviews').delete().eq('id', rid));
    expect(ok(await anon.from('reviews').select('id').eq('id', rid))).toHaveLength(1);
    expect(ok(await anon.from('listings').select('rating_avg, rating_count').eq('id', pond).single())).toEqual({ rating_avg: 4, rating_count: 2 });
    ok(await c.c.from('reviews').update({ rating: 2 }).eq('id', rid));
    expect(ok(await anon.from('listings').select('rating_avg, rating_count').eq('id', pond).single())).toEqual({ rating_avg: 3, rating_count: 2 });
    // Moving a review to another listing or family is ignored.
    expect(ok(await c.c.from('reviews').update({ listing_id: birds, family_id: d.fid }).eq('id', rid).select('listing_id, family_id').single())).toEqual({ listing_id: pond, family_id: c.fid });
    ok(await c.c.from('reviews').delete().eq('id', rid));
    expect(ok(await anon.from('listings').select('rating_avg, rating_count').eq('id', pond).single())).toEqual({ rating_avg: 4, rating_count: 1 });
  });

  it('get one helpful vote per person, counted by the server, and never from the author', async () => {
    const r = ok(await review(d, birds)) as { id: string };
    expect((await anon.from('review_votes').insert({ review_id: r.id })).error).toBeTruthy();
    // Voting for another person's review, or as someone else, doesn't work.
    expect((await a.c.from('review_votes').insert({ review_id: r.id, user_id: b.uid })).error).toBeTruthy();
    ok(await a.c.from('review_votes').insert({ review_id: r.id }));
    ok(await b.c.from('review_votes').insert({ review_id: r.id }));
    expect((await a.c.from('review_votes').insert({ review_id: r.id })).error).toBeTruthy();
    expect(ok(await anon.from('reviews').select('helpful').eq('id', r.id).single())).toEqual({ helpful: 2 });
    // Who voted stays private.
    expect(ok(await d.c.from('review_votes').select('user_id').eq('review_id', r.id))).toHaveLength(0);
    ok(await a.c.from('review_votes').delete().eq('review_id', r.id));
    expect(ok(await anon.from('reviews').select('helpful').eq('id', r.id).single())).toEqual({ helpful: 1 });
    // Authors can't vote for their own review.
    expect((await d.c.from('review_votes').insert({ review_id: r.id })).error).toBeTruthy();
    expect(ok(await anon.from('reviews').select('helpful').eq('id', r.id).single())).toEqual({ helpful: 1 });
  });
});

// ───────────────────────────── Moderation of listings

describe('moderation', () => {
  let flagged: string;
  let reporters: SupabaseClient[];

  beforeAll(async () => {
    reporters = (await Promise.all(['m1', 'm2', 'm3'].map((n) => family(n)))).map((f) => f.c);
    flagged = await publish(creator, 'flagged', 'Flagged Science', 0);
    ok(await creator.from('bundles').insert({ title: P('With flagged'), listing_ids: [flagged, pricey], price: 30 }));
  });

  it('let families report the free & open curricula too', async () => {
    const lid = `l-lib-${catalog[2].key}`;
    expect(ok(await a.c.rpc('report_content', { kind: 'listing', target: lid, why: 'misleading', info: `Test ${run}` }))).toEqual({ hidden: false });
    expect(errOf(await a.c.rpc('report_content', { kind: 'listing', target: lid, why: 'nonsense' }))).toBeTruthy();
    expect(errOf(await a.c.rpc('report_content', { kind: 'listing', target: lid, why: 'other', info: 'x'.repeat(5000) }))).toBe('');
    expect((ok(await a.c.from('reports').select('details').eq('target_id', lid)) as { details: string }[])[0].details).toHaveLength(2000);
    // Withdraw the test report so the real queue isn't cluttered.
    sql(`delete from public.reports where target_id = ${lit(lid)} and reporter_user = ${lit(a.uid)}`);
  });

  it('hide a listing after three people report it, everywhere it could be bought', async () => {
    expect(ok(await reporters[0].rpc('report_content', { kind: 'listing', target: flagged, why: 'spam' }))).toEqual({ hidden: false });
    expect(ok(await reporters[0].rpc('report_content', { kind: 'listing', target: flagged, why: 'spam' }))).toEqual({ hidden: false });
    expect(ok(await reporters[1].rpc('report_content', { kind: 'listing', target: flagged, why: 'spam' }))).toEqual({ hidden: false });
    expect(ok(await anon.from('listings').select('id').eq('id', flagged))).toHaveLength(1);
    expect(ok(await reporters[2].rpc('report_content', { kind: 'listing', target: flagged, why: 'inappropriate' }))).toEqual({ hidden: true });
    expect(ok(await anon.from('listings').select('id').eq('id', flagged))).toHaveLength(0);
    expect(ok(await creator.from('listings').select('status').eq('id', flagged).single())).toEqual({ status: 'suspended' });
    expect(errOf(await a.c.rpc('claim_free_listing', { lid: flagged }))).toMatch(/no longer available/);
    expect(errOf(await quote(a.c, 'listing', flagged))).toMatch(/no longer available/);
    expect(errOf(await a.c.rpc('send_gift', { lid: flagged, to_family: b.fid }))).toMatch(/no longer available/);
    expect(errOf(await a.c.rpc('package_content', { lid: flagged }))).toMatch(/Get this curriculum first/);
    // Bundles holding it only sell what's left.
    const bun = ok(await anon.from('bundles').select('id').eq('title', P('With flagged')).single()) as { id: string };
    expect((ok(await quote(d.c, 'bundle', bun.id)) as { items: { listing_id: string }[] }).items.map((i) => i.listing_id)).toEqual([pricey]);
    // New bundles can't include it.
    expect((await creator.from('bundles').insert({ title: 'Again', listing_ids: [flagged, pond], price: 5 })).error).toBeTruthy();
  });

  it('keep a takedown in place when the creator republishes or unpublishes', async () => {
    ok(await creator.rpc('publish_package', { pkg_id: P('flagged') }));
    expect(ok(await creator.from('listings').select('status').eq('id', flagged).single())).toEqual({ status: 'suspended' });
    ok(await creator.rpc('unpublish_package', { pkg_id: P('flagged') }));
    ok(await creator.rpc('publish_package', { pkg_id: P('flagged') }));
    expect(ok(await creator.from('listings').select('status').eq('id', flagged).single())).toEqual({ status: 'suspended' });
    expect(ok(await anon.from('listings').select('id').eq('id', flagged))).toHaveLength(0);
  });
});

// ───────────────────────────── Storefronts

describe('storefronts', () => {
  it('are public; follows are private and need an account', async () => {
    const makerId = (await creator.auth.getUser()).data.user!.id;
    expect(ok(await anon.from('creator_profiles').select('name').eq('user_id', makerId).single())).toEqual({ name: `Pond Maker ${run}` });
    expect((await anon.from('creator_follows').insert({ creator_user: makerId })).error).toBeTruthy();
    expect((await creator.from('creator_follows').insert({ creator_user: makerId })).error).toBeTruthy();
    ok(await a.c.from('creator_follows').insert({ creator_user: makerId }));
    ok(await b.c.from('creator_follows').insert({ creator_user: makerId }));
    expect((await a.c.from('creator_follows').insert({ creator_user: makerId })).error).toBeTruthy();
    expect((await a.c.from('creator_follows').insert({ creator_user: makerId, user_id: c.uid })).error).toBeTruthy();
    expect(ok(await creator.rpc('my_follower_count'))).toBe(2);
    expect(ok(await creator.from('creator_follows').select('user_id'))).toHaveLength(0);
    ok(await b.c.from('creator_follows').delete().eq('creator_user', makerId));
    expect(ok(await creator.rpc('my_follower_count'))).toBe(1);
    // Everything they sell is browsable by creator.
    const theirs = ok(await anon.from('listings').select('id').eq('creator_user', makerId)) as { id: string }[];
    expect(theirs.map((r) => r.id)).toEqual(expect.arrayContaining([pond, birds, notes, pricey]));
  });
});
