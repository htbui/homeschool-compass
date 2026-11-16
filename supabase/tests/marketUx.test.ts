/// <reference types="node" />
// Used curricula from families (design review MKT-03, MKT-08): a buyer can message
// the family selling a used curriculum without a Community connection; the seller
// can reply; blocks, reports, and sending limits still apply; nothing about either
// family leaks; and family listings carry photos (stored paths only), a pickup
// area, shipping, and optional lesson numbers.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55421';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const ok = <T,>(r: { data: T; error: unknown }) => {
  if (r.error) throw r.error;
  return r.data;
};
const errOf = (r: { error: { message?: string } | null }) => r.error?.message ?? '';
async function family(name: string, profile = false): Promise<{ c: SupabaseClient; fid: string }> {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  ok(await c.auth.signUp({ email: `${name}-${run}@example.test`, password: 'test-password-1' }));
  const fid = (ok(await c.rpc('create_family', { family_name: `The ${name} Family`, initial_data: {} })) as { family_id: string }[])[0].family_id;
  if (profile) ok(await c.from('community_profiles').insert({ family_id: fid, display_name: `${name} ${run}`, contact: `${name}-private@example.test` }));
  return { c, fid };
}
const listing = (fid: string, p: Record<string, unknown> = {}) => ({ seller_family: fid, seller_name: 'Sam R.', title: `Used set ${run}`, subjects: ['math'], grade_min: 2, grade_max: 3, format: 'print', price: 12, lessons: 30, condition: 'good', ...p });
type Convo = { family_id: string; display_name: string; can_message: boolean; listing_id: string | null; listing_title: string | null; seller: boolean; unread: number };

let seller: { c: SupabaseClient; fid: string };
let buyer: { c: SupabaseClient; fid: string };
let other: { c: SupabaseClient; fid: string };
let used: string;

beforeAll(async () => {
  [seller, buyer, other] = await Promise.all([family('sam', true), family('bea'), family('otto')]);
  used = (ok(await seller.c.from('listings').insert(listing(seller.fid)).select('id').single()) as { id: string }).id;
});

describe('messaging the seller of a used curriculum (MKT-03)', () => {
  it('a buyer can ask without being connected, and only about a family’s active listing', async () => {
    // Plain messages still need a connection.
    expect(errOf(await buyer.c.rpc('send_message', { to_family: seller.fid, body: 'Hi' }))).toMatch(/once you're connected/);
    expect(errOf(await buyer.c.rpc('message_seller', { listing: 'no-such-listing', body: 'Hi' }))).toMatch(/isn't available/);
    expect(errOf(await buyer.c.rpc('message_seller', { listing: 'l-lib-aesop-for-children', body: 'Hi' }))).toMatch(/Only families/);
    expect(errOf(await seller.c.rpc('message_seller', { listing: used, body: 'Hi me' }))).toMatch(/your own listing/);
    expect(errOf(await buyer.c.rpc('message_seller', { listing: used, body: '   ' }))).toMatch(/Write a message/);
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.rpc('message_seller', { listing: used, body: 'Hi' })).error).toBeTruthy();

    const sent = ok(await buyer.c.rpc('message_seller', { listing: used, body: 'Is it still available?' })) as { family_id: string; conversation_id: string };
    expect(sent.family_id).toBe(seller.fid);
    const [b] = ok(await buyer.c.rpc('my_conversations')) as Convo[];
    // The buyer sees the seller by the listing’s name (seller has a profile: that name), and what it’s about.
    expect(b).toMatchObject({ family_id: seller.fid, can_message: true, listing_id: used, listing_title: `Used set ${run}`, seller: true });
    const [s] = ok(await seller.c.rpc('my_conversations')) as Convo[];
    expect(s).toMatchObject({ family_id: buyer.fid, display_name: 'A Freerange family', can_message: true, listing_id: used, seller: false, unread: 1 });
  });

  it('either family can then reply in the same conversation; others can’t read it', async () => {
    const reply = ok(await seller.c.rpc('send_message', { to_family: buyer.fid, body: 'Yes! Library on Saturday?' })) as { conversation_id: string };
    const again = ok(await buyer.c.rpc('send_message', { to_family: seller.fid, body: 'Perfect.' })) as { conversation_id: string };
    expect(again.conversation_id).toBe(reply.conversation_id);
    expect(ok(await other.c.from('messages').select('id').eq('conversation_id', reply.conversation_id))).toHaveLength(0);
    expect(ok(await other.c.rpc('my_conversations'))).toEqual([]);
    // A third family still can't message either of them.
    expect(errOf(await other.c.rpc('send_message', { to_family: seller.fid, body: 'Hi' }))).toMatch(/once you're connected/);
  });

  it('shares no contact details', async () => {
    const convos = JSON.stringify(ok(await buyer.c.rpc('my_conversations')));
    expect(convos).not.toContain('sam-private@example.test');
    // Contact details still come only with an accepted Community connection.
    const conns = ok(await buyer.c.rpc('my_connections')) as unknown[];
    expect(conns).toEqual([]);
  });

  it('the seller can report a message and block the buyer, which stops both ways', async () => {
    const msgs = ok(await seller.c.from('messages').select('id, sender_family').eq('sender_family', buyer.fid)) as { id: string }[];
    expect(ok(await seller.c.rpc('report_content', { kind: 'message', target: msgs[0].id, why: 'spam', info: '' }))).toEqual({ hidden: false });
    ok(await seller.c.from('family_blocks').insert({ blocker_family: seller.fid, blocked_family: buyer.fid }));
    expect(errOf(await buyer.c.rpc('message_seller', { listing: used, body: 'Hello?' }))).toMatch(/can't message/);
    expect(errOf(await buyer.c.rpc('send_message', { to_family: seller.fid, body: 'Hello?' }))).toMatch(/can't message/);
    expect(errOf(await seller.c.rpc('send_message', { to_family: buyer.fid, body: 'Hi' }))).toMatch(/can't message/);
    const [b] = ok(await buyer.c.rpc('my_conversations')) as Convo[];
    expect(b.can_message).toBe(false);
    ok(await seller.c.from('family_blocks').delete().eq('blocked_family', buyer.fid));
  });

  it('removed listings can’t start new conversations', async () => {
    const gone = (ok(await seller.c.from('listings').insert(listing(seller.fid, { title: `Gone ${run}` })).select('id').single()) as { id: string }).id;
    ok(await seller.c.from('listings').update({ status: 'removed' }).eq('id', gone));
    expect(errOf(await other.c.rpc('message_seller', { listing: gone, body: 'Hi' }))).toMatch(/isn't available/);
  });
});

describe('family listing details (MKT-03, MKT-08)', () => {
  it('photos are paths in the family’s own folder, at most 4, never outside links', async () => {
    const path = `${seller.fid}/ph${run}.jpg`;
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
    ok(await seller.c.storage.from('listing-photos').upload(path, png, { contentType: 'image/png' }));
    // Not into someone else's folder.
    expect((await buyer.c.storage.from('listing-photos').upload(`${seller.fid}/x${run}.jpg`, png, { contentType: 'image/png' })).error).toBeTruthy();
    const saved = ok(await seller.c.from('listings').update({ photos: [path] }).eq('id', used).select('photos').single()) as { photos: string[] };
    expect(saved.photos).toEqual([path]);
    // Anyone can see it (public bucket).
    const url = seller.c.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
    expect((await fetch(url)).status).toBe(200);
    expect((await seller.c.from('listings').update({ photos: ['https://tracker.example/pixel.gif'] }).eq('id', used)).error).toBeTruthy();
    expect((await seller.c.from('listings').update({ photos: Array(5).fill(path) }).eq('id', used)).error).toBeTruthy();
  });

  it('pickup area is short, shipping and unknown lesson numbers are kept', async () => {
    const row = ok(await seller.c.from('listings').update({ pickup_area: 'Lakewood, CO', ships: true, pace_known: false }).eq('id', used).select('pickup_area, ships, pace_known').single());
    expect(row).toEqual({ pickup_area: 'Lakewood, CO', ships: true, pace_known: false });
    expect((await seller.c.from('listings').update({ pickup_area: 'x'.repeat(61) }).eq('id', used)).error).toBeTruthy();
    expect((await seller.c.from('listings').update({ pickup_area: '   ' }).eq('id', used)).error).toBeTruthy();
    // Visible to everyone browsing.
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect(ok(await anon.from('listings').select('pickup_area, ships').eq('id', used).single())).toEqual({ pickup_area: 'Lakewood, CO', ships: true });
  });
});
