/// <reference types="node" />
// Co-op classes, gifts, and creator promotions on the server: prices worked
// out by the database (sales, bundles, coupons) and charged that way at
// checkout, one-time gift codes, and classes whose teachers see progress but
// never kids' names unless a family shares them.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55421';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const run = Date.now().toString(36);
const RETURN = 'http://localhost:8081/market';

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
const lesson = (id: string, title: string) => ({ id, title, steps: [], links: [], questions: [] });
const pkg = (id: string, title: string, price: number, lessons = [lesson(`${id}-1`, 'One'), lesson(`${id}-2`, 'Two')], p: Record<string, unknown> = {}) => ({
  id, title, description: `${title}: hands-on lessons for curious kids.`, subjects: ['science'], gradeMin: 1, gradeMax: 4, philosophies: [], parentInvolvement: 'medium', familyStyle: false,
  minutesPerLesson: 30, lessonsPerWeek: 2, format: 'digital', cover: '🐸', color: '#2F6B5E', price, units: [{ id: `${id}-u`, title: 'Unit', lessons }],
  origin: { kind: 'original' }, license: { kind: 'all_rights_reserved' }, status: 'draft', version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...p,
});
const save = (c: SupabaseClient, p: ReturnType<typeof pkg>) => c.from('packages').upsert({ id: p.id, title: p.title, origin_kind: (p.origin as { kind: string }).kind, content: p });
const quote = async (c: SupabaseClient, kind: string, id: string, code: string | null = null) => ok(await c.rpc('price_quote', { target_kind: kind, target_id: id, coupon_code: code })) as { total: number; price: number; list_price: number; discount: number; items: { listing_id: string; price: number }[] };

let teacher: SupabaseClient; // a Studio creator with no family
let a: SupabaseClient;
let b: SupabaseClient; // connected to a
let c: SupabaseClient;
let famA: string;
let famB: string;
let pond: string; // $20
let birds: string; // $10
let notes: string; // free
const P = (s: string) => `${s}-${run}`;

beforeAll(async () => {
  [teacher, a, b, c] = await Promise.all([user('teacher'), user('fam-a'), user('fam-b'), user('fam-c')]);
  famA = (ok(await a.rpc('create_family', { family_name: 'The A Family', initial_data: {} })) as { family_id: string }[])[0].family_id;
  famB = (ok(await b.rpc('create_family', { family_name: 'The B Family', initial_data: {} })) as { family_id: string }[])[0].family_id;
  ok(await c.rpc('create_family', { family_name: 'The C Family', initial_data: {} }));
  ok(await a.from('connections').insert({ from_family: famA, to_family: famB, message: 'Hi!' }));
  ok(await b.from('connections').update({ status: 'accepted' }).eq('from_family', famA).eq('to_family', famB));
  ok(await teacher.from('creator_profiles').insert({ name: `Pond Teacher ${run}` }));
  for (const [id, title, price] of [[P('pond'), 'Pond Life', 20], [P('birds'), 'Bird Math', 10], [P('notes'), 'Nature Notes', 0]] as const) {
    ok(await save(teacher, pkg(id, title, price)));
    ok(await teacher.rpc('publish_package', { pkg_id: id }));
  }
  const rows = ok(await teacher.from('listings').select('id, package_id').in('package_id', [P('pond'), P('birds'), P('notes')])) as { id: string; package_id: string }[];
  [pond, birds, notes] = [P('pond'), P('birds'), P('notes')].map((p) => rows.find((r) => r.package_id === p)!.id);
});

describe('sales', () => {
  it('only the seller can run one, and it survives republishing', async () => {
    const ends = new Date(Date.now() + 7 * 86400000).toISOString();
    expect((await a.rpc('set_listing_sale', { lid: pond, pct: 25, ends })).error?.message).toMatch(/isn't yours/);
    expect((await teacher.rpc('set_listing_sale', { lid: pond, pct: 95, ends })).error?.message).toMatch(/between 5%/);
    expect((await teacher.rpc('set_listing_sale', { lid: pond, pct: 25, ends: new Date(Date.now() - 1000).toISOString() })).error?.message).toMatch(/end date/);
    expect((await teacher.rpc('set_listing_sale', { lid: notes, pct: 25, ends })).error?.message).toMatch(/Free curricula/);
    ok(await teacher.rpc('set_listing_sale', { lid: pond, pct: 25, ends }));
    ok(await teacher.rpc('publish_package', { pkg_id: P('pond') }));
    expect(ok(await a.from('listings').select('sale_percent').eq('id', pond).single())).toEqual({ sale_percent: 25 });
    expect(await quote(a, 'listing', pond)).toMatchObject({ list_price: 20, price: 15, total: 15 });
  });
});

describe('coupons', () => {
  it('are private to their creator and checked at the server', async () => {
    ok(await teacher.from('coupons').insert([
      { code: 'welcome10', kind: 'percent', amount: 10, max_uses: 1 },
      { code: 'POND5', kind: 'fixed', amount: 5, listing_id: pond, uses: 500 },
      { code: 'OLD', kind: 'percent', amount: 50, expires_at: new Date(Date.now() - 86400000).toISOString() },
      { code: 'ALLFREE', kind: 'percent', amount: 100 },
    ]));
    // Codes are stored upper case, and use counts can't be faked.
    expect(ok(await teacher.from('coupons').select('code, uses').eq('code', 'POND5').single())).toEqual({ code: 'POND5', uses: 0 });
    expect(ok(await a.from('coupons').select('id'))).toHaveLength(0);
    expect((await a.from('coupons').insert({ code: 'MINE', kind: 'percent', amount: 90, listing_id: pond })).error).toBeTruthy();
    expect(await quote(a, 'listing', pond, ' pond5 ')).toMatchObject({ price: 15, discount: 5, total: 10 });
    expect((await a.rpc('price_quote', { target_kind: 'listing', target_id: birds, coupon_code: 'POND5' })).error?.message).toMatch(/doesn't work/);
    expect((await a.rpc('price_quote', { target_kind: 'listing', target_id: birds, coupon_code: 'OLD' })).error?.message).toMatch(/expired/);
  });
});

describe('bundles', () => {
  let bundle: string;
  it('hold only the creator’s own curricula, for less', async () => {
    expect((await teacher.from('bundles').insert({ title: 'Too much', listing_ids: [pond, birds], price: 30 })).error?.message).toMatch(/cost less/);
    expect((await a.from('bundles').insert({ title: 'Not mine', listing_ids: [pond, birds], price: 5 })).error).toBeTruthy();
    bundle = (ok(await teacher.from('bundles').insert({ title: 'Pond + birds', listing_ids: [pond, birds], price: 24 }).select().single()) as { id: string; seller_name: string }).id;
    expect(ok(await c.from('bundles').select('seller_name').eq('id', bundle).single())).toEqual({ seller_name: `Pond Teacher ${run}` });
  });

  it('are priced and charged by the server, split across the curricula', async () => {
    // On sale the two cost 15 + 10 = 25; the bundle is 24, and 10% off makes it 21.60.
    const q = await quote(a, 'bundle', bundle, 'WELCOME10');
    expect(q).toMatchObject({ list_price: 30, price: 24, discount: 2.4, total: 21.6 });
    const { data, error } = await a.functions.invoke('create-checkout', { body: { bundleId: bundle, coupon: 'welcome10', fundingSource: 'esa', returnUrl: RETURN, price: 0.01 } });
    expect(error).toBeNull();
    const rows = data.purchases as { listing_id: string; price: number; list_price: number; status: string; bundle_id: string; order_id: string }[];
    expect(rows.map((r) => [r.listing_id, Number(r.price), Number(r.list_price), r.status])).toEqual([[pond, 14.4, 20, 'paid'], [birds, 7.2, 10, 'paid']]);
    expect(new Set(rows.map((r) => r.order_id)).size).toBe(1);
    expect((ok(await a.rpc('package_content', { lid: birds })) as { units: unknown[] }).units).toHaveLength(1);
    // The coupon had one use.
    expect((await c.rpc('price_quote', { target_kind: 'bundle', target_id: bundle, coupon_code: 'WELCOME10' })).error?.message).toMatch(/used up/);
    expect((await a.rpc('price_quote', { target_kind: 'bundle', target_id: bundle })).error?.message).toMatch(/already have everything/);
  });

  it('records a 100% coupon as free', async () => {
    const { data, error } = await c.functions.invoke('create-checkout', { body: { listingId: birds, coupon: 'ALLFREE', fundingSource: 'esa', returnUrl: RETURN } });
    expect(error).toBeNull();
    expect(data.purchase).toMatchObject({ status: 'free', funding_source: 'out_of_pocket' });
    expect(Number(data.purchase.price)).toBe(0);
  });
});

describe('gifts', () => {
  let freeCode: string;
  let paidCode: string;

  it('send a free curriculum to a connected family, never to strangers', async () => {
    const g = ok(await a.rpc('send_gift', { lid: notes, to_family: famB, gift_note: 'Enjoy!' })) as { code: string; status: string; recipient_label: string };
    expect(g).toMatchObject({ status: 'ready', recipient_label: 'The B Family' });
    freeCode = g.code;
    const famC = (ok(await c.from('family_members').select('family_id').single()) as { family_id: string }).family_id;
    expect((await a.rpc('send_gift', { lid: notes, to_family: famC })).error?.message).toMatch(/connected with/);
    expect((await a.rpc('send_gift', { lid: pond, to_email: 'x@example.test' })).error?.message).toMatch(/isn't free/);
    expect((await a.rpc('send_gift', { lid: notes, to_email: 'not-an-email' })).error?.message).toMatch(/doesn't look right/);
  });

  it('buy a paid one for an email address through checkout', async () => {
    const { data, error } = await a.functions.invoke('create-checkout', { body: { listingId: pond, fundingSource: 'esa', returnUrl: RETURN, gift: { email: `FAM-C-${run}@example.test`, note: 'For the kids' } } });
    expect(error).toBeNull();
    expect(data.gift).toMatchObject({ status: 'ready', demo: true, recipient_email: `fam-c-${run}@example.test` });
    expect(Number(data.gift.price)).toBe(15);
    paidCode = data.gift.code;
    // The giver doesn't own it; the giver sees both gifts and their codes; nobody else does.
    expect(ok(await a.from('purchases').select('id').eq('listing_id', pond))).toHaveLength(1);
    expect(ok(await a.from('gifts').select('code'))).toHaveLength(2);
    expect(ok(await b.from('gifts').select('id'))).toHaveLength(0);
  });

  it('wait for the recipient, who claims them once', async () => {
    expect((ok(await b.rpc('my_gifts')) as { title: string; giver_name: string }[]).map((g) => [g.title, g.giver_name])).toEqual([['Nature Notes', 'The A Family']]);
    expect((ok(await c.rpc('my_gifts')) as { title: string }[]).map((g) => g.title)).toEqual(['Pond Life']);
    expect((await a.rpc('claim_gift', { gift_code: paidCode })).error?.message).toMatch(/another family/);
    expect((await c.rpc('claim_gift', { gift_code: freeCode })).error?.message).toMatch(/another family/);
    expect(ok(await c.rpc('gift_preview', { gift_code: paidCode.toLowerCase() }))).toMatchObject({ title: 'Pond Life', status: 'ready', note: 'For the kids' });
    const p = ok(await c.rpc('claim_gift', { gift_code: paidCode })) as { status: string; gift_from: string; gift_id: string };
    expect(p).toMatchObject({ status: 'paid', gift_from: 'The A Family' });
    expect((await b.rpc('claim_gift', { gift_code: paidCode })).error?.message).toMatch(/already been claimed/);
    expect((ok(await c.rpc('package_content', { lid: pond })) as { units: unknown[] }).units).toHaveLength(1);
    expect(ok(await a.from('gifts').select('status').eq('code', paidCode).single())).toEqual({ status: 'claimed' });
  });

  it('can be taken back only while free and unclaimed', async () => {
    const g = ok(await a.from('gifts').select('id').eq('code', freeCode).single()) as { id: string };
    ok(await a.rpc('cancel_gift', { gid: g.id }));
    expect((await b.rpc('claim_gift', { gift_code: freeCode })).error?.message).toMatch(/isn't valid/);
    const paid = ok(await a.from('gifts').select('id').eq('code', paidCode).single()) as { id: string };
    expect((await a.rpc('cancel_gift', { gid: paid.id })).error).toBeTruthy();
  });
});

describe('co-op classes', () => {
  let cid: string;
  let code: string;

  it('are made from the teacher’s own Studio curriculum, never a book conversion', async () => {
    ok(await save(teacher, pkg(P('book'), 'My Book', 0, undefined, { origin: { kind: 'owned_book', title: 'My Book' } })));
    expect((await teacher.rpc('coop_create_class', { pkg_id: P('book') })).error?.message).toMatch(/private to your family/);
    expect((await a.rpc('coop_create_class', { pkg_id: P('pond') })).error?.message).toMatch(/not found/);
    expect((await teacher.rpc('coop_create_class', { pkg_id: P('pond'), max_fam: 31 })).error?.message).toMatch(/1 to 30/);
    const cls = ok(await teacher.rpc('coop_create_class', { pkg_id: P('pond'), max_fam: 2 })) as { id: string; code: string; version: number };
    expect(cls.version).toBe(1);
    [cid, code] = [cls.id, cls.code];
    expect(ok(await a.from('coop_classes').select('id'))).toHaveLength(0);
  });

  it('let families join with the code, up to the class size', async () => {
    expect(ok(await a.rpc('coop_class_preview', { class_code: code.toLowerCase() }))).toMatchObject({ lessons: 2, families: 0, joined: false });
    expect((await a.rpc('coop_class_content', { cid })).error?.message).toMatch(/not in this class/);
    const j = ok(await a.rpc('coop_join_class', { class_code: code, label: 'The As', share: false })) as { joined: boolean; content: { version: number; units: unknown[] } };
    expect(j).toMatchObject({ joined: true, content: { version: 1 } });
    ok(await b.rpc('coop_join_class', { class_code: code, label: 'The Bs', share: true }));
    expect((await c.rpc('coop_join_class', { class_code: code, label: 'The Cs' })).error?.message).toMatch(/full/);
  });

  it('show the teacher progress, with names only when shared', async () => {
    ok(await a.rpc('coop_report_progress', { cid, students: [{ done: 1, name: 'Ava' }, { done: 9999 }], total: 2, on_ver: 1 }));
    ok(await b.rpc('coop_report_progress', { cid, students: [{ done: 2, name: 'Ben' }], total: 2, on_ver: 1 }));
    const roster = ok(await teacher.rpc('coop_roster', { cid })) as { family_label: string; progress: { done: number; name?: string }[] }[];
    expect(roster.map((r) => [r.family_label, r.progress])).toEqual([['The As', [{ done: 1 }, { done: 2000 }]], ['The Bs', [{ done: 2, name: 'Ben' }]]]);
    expect((await a.rpc('coop_roster', { cid })).error).toBeTruthy();
    ok(await b.rpc('coop_share_names', { cid, share: false }));
    expect((ok(await teacher.rpc('coop_roster', { cid })) as { progress: unknown[] }[])[1].progress).toEqual([{ done: 2 }]);
  });

  it('send the teacher’s edits as a new version', async () => {
    ok(await save(teacher, pkg(P('pond'), 'Pond Life', 20, [lesson(`${P('pond')}-1`, 'One'), lesson(`${P('pond')}-2`, 'Two'), lesson('new', 'Pond plants')])));
    expect((ok(await teacher.rpc('coop_update_class', { cid, release_note: 'A lesson on plants' })) as { version: number }).version).toBe(2);
    expect(ok(await a.rpc('coop_my_classes'))).toMatchObject([{ class_id: cid, version: 2 }]);
    const content = ok(await a.rpc('coop_class_content', { cid })) as { version: number; note: string; units: { lessons: unknown[] }[] };
    expect(content).toMatchObject({ version: 2, note: 'A lesson on plants' });
    expect(content.units[0].lessons).toHaveLength(3);
  });

  it('let the teacher remove families and families leave', async () => {
    ok(await teacher.rpc('coop_remove_family', { cid, fid: famA }));
    expect(ok(await a.rpc('coop_my_classes'))).toEqual([]);
    expect((await a.rpc('coop_class_content', { cid })).error).toBeTruthy();
    ok(await b.rpc('coop_leave_class', { cid }));
    expect(ok(await teacher.rpc('coop_roster', { cid }))).toEqual([]);
    // A new code locks out the old one; a closed class takes no one new.
    const fresh = ok(await teacher.rpc('coop_new_code', { cid })) as string;
    expect((await c.rpc('coop_join_class', { class_code: code, label: 'The Cs' })).error?.message).toMatch(/isn't valid/);
    ok(await teacher.rpc('coop_class_settings', { cid, max_fam: 30, is_open: false }));
    expect((await c.rpc('coop_join_class', { class_code: fresh, label: 'The Cs' })).error?.message).toMatch(/isn't taking/);
  });
});
