/// <reference types="node" />
// Studio on the server: private drafts, license rules enforced at publish,
// paid lesson plans delivered only to buyers, and the web-import fetcher.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const units = [
  { id: 'u1', title: 'Halves', lessons: [{ id: 'l1', title: 'Fold it', steps: ['Fold'], links: [], questions: ['What is ½ of 4?'] }, { id: 'l2', title: 'Share it', steps: [], links: [], questions: [] }] },
  { id: 'u2', title: 'Quarters', lessons: [{ id: 'l3', title: 'Pizza', steps: [], links: [], questions: [] }] },
];
const base = (id: string, p: Record<string, unknown> = {}) => ({
  id,
  title: `Fractions ${id}`,
  description: 'Hands-on fractions for curious kids.',
  subjects: ['math'],
  gradeMin: 2,
  gradeMax: 4,
  philosophies: ['montessori'],
  parentInvolvement: 'medium',
  familyStyle: false,
  minutesPerLesson: 30,
  lessonsPerWeek: 3,
  format: 'digital',
  cover: '🍕',
  color: '#E3A33B',
  price: 12,
  units,
  origin: { kind: 'original' },
  license: { kind: 'cc_by', version: '4.0' },
  status: 'draft',
  version: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...p,
});
const save = (c: SupabaseClient, pkg: ReturnType<typeof base>) => c.from('packages').upsert({ id: pkg.id, title: pkg.title, origin_kind: (pkg.origin as { kind: string }).kind, content: pkg });

let creator: SupabaseClient; // a Studio creator with no family
let parent: SupabaseClient; // a family that buys
let other: SupabaseClient; // another family
let paidListing: string;
let freeListing: string;
const id = (s: string) => `${s}-${run}`;

beforeAll(async () => {
  [creator, parent, other] = await Promise.all([user('creator'), user('buyer'), user('other')]);
  ok(await parent.rpc('create_family', { family_name: 'Buyers', initial_data: {} }));
  ok(await other.rpc('create_family', { family_name: 'Others', initial_data: {} }));
});

describe('studio drafts', () => {
  it('needs a creator profile, and keeps drafts private', async () => {
    ok(await save(creator, base(id('orig'))));
    expect((await creator.rpc('publish_package', { pkg_id: id('orig') })).error?.message).toMatch(/creator profile/);
    ok(await creator.from('creator_profiles').insert({ name: `Maple ${run}`, bio: 'Hands-on math.' }));
    expect(ok(await parent.from('packages').select('id').eq('id', id('orig')))).toHaveLength(0);
    expect((await parent.from('packages').update({ title: 'hijack' }).eq('id', id('orig')).select()).data ?? []).toHaveLength(0);
    expect((await parent.from('creator_profiles').update({ name: 'Hijack' }).neq('name', '').select()).data ?? []).toHaveLength(0);
  });
});

describe('publishing', () => {
  it('publishes an original with a server-built outline and lesson count', async () => {
    const l = ok(await creator.rpc('publish_package', { pkg_id: id('orig') })) as Record<string, unknown>;
    paidListing = l.id as string;
    expect(l).toMatchObject({ seller_kind: 'creator', seller_name: `Maple ${run}`, lessons: 3, price: 12, package_version: 1, seller_verified: false, esa_eligible: false });
    expect(l.outline).toEqual([{ title: 'Halves', lessons: ['Fold it', 'Share it'] }, { title: 'Quarters', lessons: ['Pizza'] }]);
    const pkg = ok(await creator.from('packages').select('content').eq('id', id('orig')).single()) as { content: { status: string; version: number; listingId: string } };
    expect(pkg.content).toMatchObject({ status: 'published', version: 1, listingId: paidListing });
    // Publishing again makes a new release on the same listing.
    const again = ok(await creator.rpc('publish_package', { pkg_id: id('orig') })) as Record<string, unknown>;
    expect(again).toMatchObject({ id: paidListing, package_version: 2 });
  });

  it('never publishes a conversion of a book the family owns', async () => {
    ok(await save(creator, base(id('book'), { origin: { kind: 'owned_book', title: 'Math 4' }, license: { kind: 'all_rights_reserved' } })));
    expect((await creator.rpc('publish_package', { pkg_id: id('book') })).error?.message).toMatch(/private to your family/);
  });

  it('keeps the source license: no-derivatives and all-rights-reserved sources stay private', async () => {
    const web = (kind: string, extra: Record<string, unknown> = {}) =>
      base(id(`web-${kind}`), { origin: { kind: 'open_web', url: 'https://example.org/course', title: 'Open Course', retrievedAt: '', licenseDetected: true }, license: { kind }, licenseConfirmed: true, attribution: 'Adapted from “Open Course” (https://example.org/course).', ...extra });
    for (const kind of ['cc_by_nd', 'all_rights_reserved', 'unknown']) {
      ok(await save(creator, web(kind)));
      expect((await creator.rpc('publish_package', { pkg_id: id(`web-${kind}`) })).error?.message).toMatch(/doesn't allow/);
    }
    ok(await save(creator, web('cc_by_sa', { licenseConfirmed: false })));
    expect((await creator.rpc('publish_package', { pkg_id: id('web-cc_by_sa') })).error?.message).toMatch(/Confirm/);
    ok(await save(creator, web('cc_by_sa', { attribution: 'No credit here' })));
    expect((await creator.rpc('publish_package', { pkg_id: id('web-cc_by_sa') })).error?.message).toMatch(/credit their source/);
  });

  it('makes adaptations of non-commercial sources free, whatever the asking price', async () => {
    const pkg = base(id('nc'), {
      price: 25,
      origin: { kind: 'open_web', url: 'https://example.org/garden', title: 'Open Garden', retrievedAt: '', licenseDetected: true },
      license: { kind: 'cc_by_nc_sa', version: '4.0' },
      licenseConfirmed: true,
      attribution: 'Adapted from “Open Garden” (https://example.org/garden), licensed under CC BY-NC-SA 4.0.',
    });
    ok(await save(creator, pkg));
    const l = ok(await creator.rpc('publish_package', { pkg_id: id('nc') })) as Record<string, unknown>;
    freeListing = l.id as string;
    expect(Number(l.price)).toBe(0);
    expect(l.license).toMatchObject({ kind: 'cc_by_nc_sa' });
    expect(l.attribution).toMatch(/example\.org\/garden/);
  });

  it('stops families from faking package fields on their own listings', async () => {
    const fam = (ok(await other.from('family_members').select('family_id').single()) as { family_id: string }).family_id;
    const row = ok(
      await other
        .from('listings')
        .insert({ seller_family: fam, seller_name: 'Other', title: 'Used book', grade_min: 1, grade_max: 2, format: 'print', price: 5, lessons: 10, package_id: id('orig'), outline: [{ title: 'x', lessons: [] }], creator_user: null })
        .select()
        .single(),
    ) as Record<string, unknown>;
    expect(row).toMatchObject({ package_id: null, outline: null });
  });
});

describe('lesson plans for buyers', () => {
  it('hides a paid plan until the family buys it', async () => {
    expect((await parent.rpc('package_content', { lid: paidListing })).error?.message).toMatch(/Get this curriculum first/);
    const { data, error } = await parent.functions.invoke('create-checkout', { body: { listingId: paidListing, fundingSource: 'tax', returnUrl: 'http://localhost:8081/market' } });
    expect(error).toBeNull();
    expect(data.purchase).toMatchObject({ status: 'paid' });
    const content = ok(await parent.rpc('package_content', { lid: paidListing })) as { units: typeof units; version: number; license: { kind: string } };
    expect(content.version).toBe(2);
    expect(content.units[0].lessons[0].questions).toEqual(['What is ½ of 4?']);
    expect(content.license.kind).toBe('cc_by');
    expect((await other.rpc('package_content', { lid: paidListing })).error).toBeTruthy();
  });

  it('gives free plans to anyone signed in, and the creator always', async () => {
    expect((ok(await other.rpc('package_content', { lid: freeListing })) as { units: unknown[] }).units).toHaveLength(2);
    expect(ok(await creator.rpc('package_content', { lid: paidListing }))).toBeTruthy();
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.rpc('package_content', { lid: freeListing })).error).toBeTruthy();
  });

  it('counts sales for the creator, and blocks self-reviews', async () => {
    const stats = ok(await creator.rpc('creator_stats')) as { listing_id: string; sales: number }[];
    expect(stats.find((s) => s.listing_id === paidListing)?.sales).toBe(1);
    ok(await creator.rpc('create_family', { family_name: 'Creator fam', initial_data: {} }));
    const fid = (ok(await creator.from('family_members').select('family_id').single()) as { family_id: string }).family_id;
    expect((await creator.from('reviews').insert({ listing_id: paidListing, family_id: fid, author_name: 'Me', rating: 5, body: 'My own curriculum is great!' })).error?.message).toMatch(/own listing/);
    const self = await creator.functions.invoke('create-checkout', { body: { listingId: paidListing, fundingSource: 'tax', returnUrl: 'http://localhost:8081/market' } });
    expect(self.error).toBeTruthy();
  });

  it('removes an unpublished listing from the catalog but buyers keep their plan', async () => {
    ok(await creator.rpc('unpublish_package', { pkg_id: id('orig') }));
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect(ok(await anon.from('listings').select('id').eq('id', paidListing))).toHaveLength(0);
    expect((ok(await parent.rpc('package_content', { lid: paidListing })) as { units: unknown[] }).units).toHaveLength(2);
  });
});

describe('web import fetcher', () => {
  let server: Server;
  let port = 0;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/course' }).end();
        return;
      }
      if (req.url === '/file.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' }).end('%PDF');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><title>Test Course</title><body><h2>Unit 1</h2><ul><li><a href="/a">Lesson A</a></li></ul><a rel="license" href="https://creativecommons.org/licenses/by/4.0/">CC BY</a></body></html>');
    });
    await new Promise<void>((r) => server.listen(0, '0.0.0.0', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => server.close());

  // The edge runtime runs in Docker, so it reaches this test server via the host.
  const page = (path: string) => `http://host.docker.internal:${port}${path}`;

  it('needs an account', async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.functions.invoke('fetch-page', { body: { url: page('/course') } })).error).toBeTruthy();
  });

  it('fetches a page, following redirects', async () => {
    const { data, error } = await parent.functions.invoke('fetch-page', { body: { url: page('/redirect') } });
    expect(error).toBeNull();
    expect(data.url).toBe(page('/course'));
    expect(data.html).toContain('Test Course');
  });

  it('refuses non-web addresses and non-HTML files', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.org/x', 'not a url']) {
      expect((await parent.functions.invoke('fetch-page', { body: { url } })).error).toBeTruthy();
    }
    expect((await parent.functions.invoke('fetch-page', { body: { url: page('/file.pdf') } })).error).toBeTruthy();
  });
});
