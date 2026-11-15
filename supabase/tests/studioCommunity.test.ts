/// <reference types="node" />
// Studio & Community on the server, beyond the happy paths in studio.test.ts,
// coop_gifts.test.ts, messages.test.ts and cloud.test.ts: who can read and
// write what (RLS and RPC guards), license rules that can't be bypassed by
// editing a draft's fields, co-op class privacy, and the community's
// connection, field-trip and co-op rules. Every user and family is new per run.
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
const anon = () => createClient(URL, KEY, { auth: { persistSession: false } });
const ok = <T,>(r: { data: T; error: unknown }) => {
  if (r.error) throw r.error;
  return r.data;
};
const msg = (r: { error: unknown }) => String((r.error as { message?: string } | null)?.message ?? '');
/** Refused outright, or matched no rows. */
const refused = (r: { data: unknown; error: unknown }) => r.error !== null || (Array.isArray(r.data) && r.data.length === 0);
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

const lesson = (id: string, title: string, p: Record<string, unknown> = {}) => ({ id, title, steps: [], links: [], questions: [], ...p });
const pkg = (id: string, p: Record<string, unknown> = {}) => ({
  id,
  title: `Pond ${id}`,
  description: 'Frogs, insects, and water testing for curious kids.',
  subjects: ['science'],
  gradeMin: 1,
  gradeMax: 4,
  philosophies: [],
  parentInvolvement: 'medium',
  familyStyle: false,
  minutesPerLesson: 30,
  lessonsPerWeek: 2,
  format: 'digital',
  cover: '🐸',
  color: '#2F6B5E',
  price: 8,
  units: [{ id: `${id}-u`, title: 'Unit 1', lessons: [lesson(`${id}-1`, 'Frogs', { questions: ['How many legs?'], answers: ['Four'], notes: 'Parent note' }), lesson(`${id}-2`, 'Insects')] }],
  origin: { kind: 'original' },
  license: { kind: 'all_rights_reserved' },
  status: 'draft',
  version: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...p,
});
type Pkg = ReturnType<typeof pkg>;
const save = (c: SupabaseClient, p: Pkg, originKind = (p.origin as { kind: string }).kind) => c.from('packages').upsert({ id: p.id, title: p.title, origin_kind: originKind, content: p });
const P = (s: string) => `sc-${s}-${run}`;
const openWeb = (license: string, p: Record<string, unknown> = {}) => ({
  origin: { kind: 'open_web', url: 'https://open.example.org/pond', title: 'Open Pond', retrievedAt: '', licenseDetected: true },
  license: { kind: license, version: '4.0' },
  licenseConfirmed: true,
  attribution: 'Adapted from “Open Pond” (https://open.example.org/pond).',
  ...p,
});

let creator: SupabaseClient; // Studio creator, no family
let rival: SupabaseClient; // another creator
let ana: SupabaseClient;
let ben: SupabaseClient;
let cara: SupabaseClient;
let famA: string;
let famB: string;
let famC: string;

async function family(c: SupabaseClient, name: string, zip = '80202', contact = `${name.toLowerCase()}-${run}@example.test`): Promise<string> {
  const fid = (ok(await c.rpc('create_family', { family_name: name, initial_data: {} })) as { family_id: string }[])[0].family_id;
  ok(await c.from('community_profiles').insert({ family_id: fid, display_name: `${name} ${run}`, contact }));
  ok(await c.from('family_locations').insert({ family_id: fid, zip5: zip }));
  return fid;
}

beforeAll(async () => {
  [creator, rival, ana, ben, cara] = await Promise.all([user('sc-creator'), user('sc-rival'), user('sc-ana'), user('sc-ben'), user('sc-cara')]);
  ok(await creator.from('creator_profiles').insert({ name: `Pond Maker ${run}`, bio: 'Hands-on science.' }));
  ok(await rival.from('creator_profiles').insert({ name: `Rival ${run}` }));
  famA = await family(ana, 'Ana');
  famB = await family(ben, 'Ben');
  famC = await family(cara, 'Cara');
});

// ───────────────────────────── Studio

describe('creator profiles', () => {
  it('are public, one per account, and validated', async () => {
    expect(ok(await anon().from('creator_profiles').select('name').eq('name', `Pond Maker ${run}`))).toHaveLength(1);
    expect(msg(await creator.from('creator_profiles').insert({ name: 'Second' }))).toMatch(/duplicate|unique/);
    const solo = await user('sc-solo');
    expect((await solo.from('creator_profiles').insert({ name: 'X' })).error).toBeTruthy();
    expect((await solo.from('creator_profiles').insert({ name: 'y'.repeat(61) })).error).toBeTruthy();
    expect((await solo.from('creator_profiles').insert({ name: 'Solo', website: 'javascript:alert(1)' })).error).toBeTruthy();
    expect((await solo.from('creator_profiles').insert({ name: 'Solo', user_id: (await creator.auth.getUser()).data.user!.id })).error).toBeTruthy();
    expect((await anon().from('creator_profiles').insert({ name: 'Anon' })).error).toBeTruthy();
  });

  it('can’t be edited by anyone else', async () => {
    expect(refused(await rival.from('creator_profiles').update({ bio: 'hijack' }).eq('name', `Pond Maker ${run}`).select())).toBe(true);
    expect((ok(await anon().from('creator_profiles').select('bio').eq('name', `Pond Maker ${run}`).single()) as { bio: string }).bio).toBe('Hands-on science.');
  });
});

describe('drafts', () => {
  it('are invisible to other creators, families and anon, who can’t write or delete them either', async () => {
    ok(await save(creator, pkg(P('draft'))));
    for (const c of [rival, ana, anon()]) {
      expect(ok(await c.from('packages').select('id').eq('id', P('draft')))).toHaveLength(0);
      expect(refused(await c.from('packages').update({ title: 'x' }).eq('id', P('draft')).select())).toBe(true);
      expect(refused(await c.from('packages').delete().eq('id', P('draft')).select())).toBe(true);
    }
    // Upserting someone else's id is refused (it's their row).
    expect((await save(rival, pkg(P('draft'), { title: 'Taken over' }))).error).toBeTruthy();
    expect((ok(await creator.from('packages').select('title').eq('id', P('draft')).single()) as { title: string }).title).toBe(`Pond ${P('draft')}`);
    expect((await creator.from('packages').insert({ id: P('owned'), owner: (await rival.auth.getUser()).data.user!.id, title: 'x', origin_kind: 'original', content: {} })).error).toBeTruthy();
  });

  it('can’t be published, unpublished, or used for a class by anyone but their owner', async () => {
    expect(msg(await rival.rpc('publish_package', { pkg_id: P('draft') }))).toMatch(/not found/);
    expect(msg(await anon().rpc('publish_package', { pkg_id: P('draft') }))).toBeTruthy();
    expect(msg(await rival.rpc('coop_create_class', { pkg_id: P('draft') }))).toMatch(/not found/);
  });

  it('take their origin from the content: an unknown origin is refused, a mislabelled row is corrected', async () => {
    expect((await creator.from('packages').upsert({ id: P('bad'), title: 'x', origin_kind: 'original', content: pkg(P('bad'), { origin: { kind: 'stolen' } }) })).error).toBeTruthy();
    ok(await creator.from('packages').upsert({ id: P('bad'), title: 'x', origin_kind: 'stolen', content: pkg(P('bad'), { origin: { kind: 'owned_book', title: 'B' } }) }));
    expect(ok(await creator.from('packages').select('origin_kind').eq('id', P('bad')).single())).toEqual({ origin_kind: 'owned_book' });
  });
});

describe('license rules can’t be bypassed', () => {
  it('a book conversion labelled “original” in its row still stays private', async () => {
    const book = pkg(P('book'), { origin: { kind: 'owned_book', title: 'Math 4', publisher: 'Fernwood' } });
    ok(await save(creator, book, 'original'));
    expect(msg(await creator.rpc('publish_package', { pkg_id: P('book') }))).toMatch(/private to your family/);
    expect(msg(await creator.rpc('coop_create_class', { pkg_id: P('book') }))).toMatch(/private to your family/);
  });

  it('a no-derivatives adaptation labelled “original” in its row still can’t be published', async () => {
    ok(await save(creator, pkg(P('nd'), openWeb('cc_by_nd')), 'original'));
    expect(msg(await creator.rpc('publish_package', { pkg_id: P('nd') }))).toMatch(/doesn't allow/);
  });

  it('an original needs a real license', async () => {
    ok(await save(creator, pkg(P('nolic'), { license: { kind: 'unknown' } })));
    expect(msg(await creator.rpc('publish_package', { pkg_id: P('nolic') }))).toMatch(/Choose a license/);
    ok(await save(creator, pkg(P('pd'), { license: { kind: 'public_domain' } })));
    expect(msg(await creator.rpc('publish_package', { pkg_id: P('pd') }))).toMatch(/Choose a license/);
  });

  it('a plan with no lessons can’t be published', async () => {
    ok(await save(creator, pkg(P('empty'), { units: [{ id: 'u', title: 'Unit', lessons: [] }] })));
    expect(msg(await creator.rpc('publish_package', { pkg_id: P('empty') }))).toMatch(/at least one lesson/);
  });

  it('commercial open licenses keep the price; non-commercial ones are free; public domain sources publish', async () => {
    for (const [kind, price] of [['cc_by_sa', 8], ['cc0', 8], ['public_domain', 8], ['cc_by_nc', 0]] as const) {
      ok(await save(creator, pkg(P(`lic-${kind}`), openWeb(kind))));
      const l = ok(await creator.rpc('publish_package', { pkg_id: P(`lic-${kind}`) })) as { price: number; license: { kind: string } };
      expect([kind, Number(l.price), l.license.kind]).toEqual([kind, price, kind]);
    }
    const saved = ok(await creator.from('packages').select('content').eq('id', P('lic-cc_by_nc')).single()) as { content: { price: number } };
    expect(saved.content.price).toBe(0);
  });

  it('a draft can’t take over another creator’s listing by naming it', async () => {
    ok(await save(rival, pkg(P('rival'))));
    const theirs = (ok(await rival.rpc('publish_package', { pkg_id: P('rival') })) as { id: string }).id;
    ok(await save(creator, pkg(P('steal'), { listingId: theirs })));
    expect(msg(await creator.rpc('publish_package', { pkg_id: P('steal') }))).toMatch(/belongs to someone else/);
    const l = ok(await anon().from('listings').select('title, seller_name').eq('id', theirs).single()) as { seller_name: string };
    expect(l.seller_name).toBe(`Rival ${run}`);
  });

  it('only the owner can unpublish', async () => {
    ok(await rival.rpc('unpublish_package', { pkg_id: P('lic-cc_by_sa') }));
    expect((await anon().rpc('unpublish_package', { pkg_id: P('lic-cc_by_sa') })).error).toBeTruthy();
    const l = ok(await anon().from('listings').select('status').eq('package_id', P('lic-cc_by_sa'))) as { status: string }[];
    expect(l).toEqual([{ status: 'active' }]);
  });
});

describe('releases, release notes and answer keys', () => {
  let lid: string;

  it('the outline is public but answers, steps and notes are only for those who have the plan', async () => {
    ok(await save(creator, pkg(P('rel'), { releaseNote: '  ' })));
    lid = (ok(await creator.rpc('publish_package', { pkg_id: P('rel') })) as { id: string }).id;
    const pub = ok(await anon().from('listings').select('*').eq('id', lid).single()) as Record<string, unknown>;
    expect(JSON.stringify(pub)).not.toMatch(/Four|How many legs|Parent note/);
    expect(pub.outline).toEqual([{ title: 'Unit 1', lessons: ['Frogs', 'Insects'] }]);
    expect(msg(await ana.rpc('package_content', { lid }))).toMatch(/Get this curriculum first/);
    expect((await anon().rpc('package_content', { lid })).error).toBeTruthy();
    const own = ok(await creator.rpc('package_content', { lid })) as { units: { lessons: { answers?: string[] }[] }[]; version: number; note: string | null };
    expect(own.units[0].lessons[0].answers).toEqual(['Four']);
    // A blank release note isn't stored.
    expect(own).toMatchObject({ version: 1, note: null });
  });

  it('each release has its own note, which is cleared from the draft after publishing', async () => {
    const cur = (ok(await creator.from('packages').select('content').eq('id', P('rel')).single()) as { content: Pkg }).content;
    ok(await save(creator, { ...cur, releaseNote: 'Added a lesson on dragonflies.', units: [{ ...cur.units[0], lessons: [...cur.units[0].lessons, lesson('dragon', 'Dragonflies')] }] } as Pkg));
    const l = ok(await creator.rpc('publish_package', { pkg_id: P('rel') })) as { package_version: number; lessons: number };
    expect(l).toMatchObject({ package_version: 2, lessons: 3 });
    const content = ok(await creator.rpc('package_content', { lid })) as { version: number; note: string };
    expect(content).toMatchObject({ version: 2, note: 'Added a lesson on dragonflies.' });
    const draft = (ok(await creator.from('packages').select('content').eq('id', P('rel')).single()) as { content: Record<string, unknown> }).content;
    expect(draft.releaseNote).toBeUndefined();
    expect(draft).toMatchObject({ status: 'published', version: 2, listingId: lid });
  });

  it('a free listing that was unpublished is no longer given to new families', async () => {
    ok(await save(creator, pkg(P('freebie'), { price: 0 })));
    const free = (ok(await creator.rpc('publish_package', { pkg_id: P('freebie') })) as { id: string }).id;
    expect(ok(await ana.rpc('package_content', { lid: free }))).toBeTruthy();
    ok(await creator.rpc('unpublish_package', { pkg_id: P('freebie') }));
    expect(msg(await ben.rpc('package_content', { lid: free }))).toMatch(/Get this curriculum first/);
    expect(ok(await anon().from('listings').select('id').eq('id', free))).toHaveLength(0);
    // Republishing brings it back.
    ok(await creator.rpc('publish_package', { pkg_id: P('freebie') }));
    expect(ok(await ben.rpc('package_content', { lid: free }))).toBeTruthy();
  });

  it('only the creator sees their sales stats', async () => {
    expect(ok(await rival.rpc('creator_stats')).map((s: { listing_id: string }) => s.listing_id)).not.toContain(lid);
    expect((await anon().rpc('creator_stats')).error).toBeTruthy();
  });
});

describe('insights', () => {
  it('nobody but the creator gets totals, and anon can’t report', async () => {
    const lid = (ok(await anon().from('listings').select('id').eq('package_id', P('freebie')).single()) as { id: string }).id;
    expect(ok(await ana.rpc('report_lesson_progress', { reports: [{ listingId: lid, lessonId: `${P('freebie')}-1`, lessonNo: 1, done: true }] }))).toBe(1);
    expect(ok(await rival.rpc('lesson_insights', { lid }))).toEqual([]);
    expect(ok(await ana.rpc('lesson_insights', { lid }))).toEqual([]);
    expect((await anon().rpc('lesson_insights', { lid })).error).toBeTruthy();
    expect((await anon().rpc('report_lesson_progress', { reports: [] })).error).toBeTruthy();
    // One family is below the minimum, so even the creator sees nothing yet.
    expect(ok(await creator.rpc('lesson_insights', { lid }))).toEqual([]);
    expect(msg(await ana.rpc('report_lesson_progress', { reports: {} }))).toMatch(/list/);
    expect(msg(await ana.rpc('report_lesson_progress', { reports: Array.from({ length: 501 }, () => ({})) }))).toMatch(/500/);
  });
});

describe('co-op classes', () => {
  let cid: string;
  let code: string;

  beforeAll(async () => {
    ok(await save(creator, pkg(P('class'))));
    const cls = ok(await creator.rpc('coop_create_class', { pkg_id: P('class'), max_fam: 3 })) as { id: string; code: string };
    [cid, code] = [cls.id, cls.code];
  });

  it('invite codes are 8 easy characters, read however they’re typed, and need an account', async () => {
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(code).not.toMatch(/[01OI]/);
    expect(ok(await ana.rpc('coop_class_preview', { class_code: `  ${code.toLowerCase()} ` }))).toMatchObject({ id: cid, lessons: 2, families: 0 });
    expect((await anon().rpc('coop_class_preview', { class_code: code })).error).toBeTruthy();
    expect(ok(await ana.rpc('coop_class_preview', { class_code: 'NOPE0000' }))).toBeNull();
  });

  it('teachers’ classes, rosters and settings are theirs alone', async () => {
    expect(ok(await rival.from('coop_classes').select('id').eq('id', cid))).toHaveLength(0);
    expect(msg(await rival.rpc('coop_roster', { cid }))).toMatch(/not found/);
    expect(msg(await rival.rpc('coop_new_code', { cid }))).toMatch(/not found/);
    expect(msg(await rival.rpc('coop_class_settings', { cid, max_fam: 30, is_open: false }))).toMatch(/not found/);
    expect(msg(await rival.rpc('coop_update_class', { cid }))).toMatch(/not found/);
    expect(msg(await rival.rpc('coop_remove_family', { cid, fid: famA }))).toMatch(/not found/);
    ok(await rival.rpc('coop_delete_class', { cid }));
    expect(ok(await creator.rpc('coop_teaching')).map((c: { id: string }) => c.id)).toContain(cid);
    expect(msg(await creator.rpc('coop_class_settings', { cid, max_fam: 0, is_open: true }))).toMatch(/1 to 30/);
  });

  it('families report progress only for classes they’re in, with names only when shared', async () => {
    expect(msg(await ana.rpc('coop_report_progress', { cid, students: [{ done: 1 }] }))).toMatch(/not in this class/);
    ok(await ana.rpc('coop_join_class', { class_code: code, label: '  ', share: false }));
    ok(await ben.rpc('coop_join_class', { class_code: code, label: 'The Bens', share: true }));
    // Joining twice doesn't add a second row.
    ok(await ana.rpc('coop_join_class', { class_code: code, label: 'Again' }));
    expect(msg(await ana.rpc('coop_report_progress', { cid, students: Array.from({ length: 13 }, () => ({ done: 1 })) }))).toMatch(/Bad progress/);
    expect(msg(await ana.rpc('coop_report_progress', { cid, students: { done: 1 } }))).toMatch(/Bad progress/);
    ok(await ana.rpc('coop_report_progress', { cid, students: [{ done: -5, name: 'Ava' }, { done: 3, name: '  ' }], total: 99999, on_ver: 1 }));
    ok(await ben.rpc('coop_report_progress', { cid, students: [{ done: 2, name: `  ${'B'.repeat(60)}` }], total: 2 }));
    const roster = ok(await creator.rpc('coop_roster', { cid })) as { family_label: string; progress: { done: number; name?: string }[]; total_lessons: number }[];
    // A blank label falls back to the family's community name.
    expect(roster.map((r) => r.family_label)).toEqual([`Ana ${run}`, 'The Bens']);
    expect(roster[0]).toMatchObject({ progress: [{ done: 0 }, { done: 3 }], total_lessons: 2000 });
    expect(roster[1].progress).toEqual([{ done: 2, name: 'B'.repeat(40) }]);
    // Members can't see each other or the roster.
    expect((await ana.rpc('coop_roster', { cid })).error).toBeTruthy();
    expect(ok(await ana.from('coop_class_members').select('family_id'))).toEqual([]);
  });

  it('a full class turns new families away, and a deleted class reaches no one', async () => {
    ok(await cara.rpc('coop_join_class', { class_code: code, label: 'Caras' }));
    const extra = await user('sc-extra');
    ok(await extra.rpc('create_family', { family_name: 'Extra', initial_data: {} }));
    expect(msg(await extra.rpc('coop_join_class', { class_code: code, label: 'Extra' }))).toMatch(/full/);
    const noFamily = await user('sc-nofam');
    expect(msg(await noFamily.rpc('coop_join_class', { class_code: code, label: 'x' }))).toMatch(/family first/);
    ok(await creator.rpc('coop_delete_class', { cid }));
    expect(ok(await ana.rpc('coop_my_classes'))).toEqual([]);
    expect((await ana.rpc('coop_class_content', { cid })).error).toBeTruthy();
  });

  it('can’t be made from a no-derivatives source or an unconfirmed license', async () => {
    ok(await save(creator, pkg(P('class-nd'), openWeb('cc_by_nd'))));
    expect(msg(await creator.rpc('coop_create_class', { pkg_id: P('class-nd') }))).toMatch(/doesn't allow/);
    ok(await save(creator, pkg(P('class-unconf'), openWeb('cc_by', { licenseConfirmed: false }))));
    expect(msg(await creator.rpc('coop_create_class', { pkg_id: P('class-unconf') }))).toMatch(/Confirm/);
  });
});

// ───────────────────────────── Community

describe('profiles and the family finder', () => {
  it('profiles, locations and contact details are private to the family', async () => {
    for (const c of [ben, anon()]) {
      expect(ok(await c.from('community_profiles').select('*').eq('family_id', famA))).toHaveLength(0);
      expect(ok(await c.from('family_locations').select('*').eq('family_id', famA))).toHaveLength(0);
    }
    expect(refused(await ben.from('community_profiles').update({ display_name: 'Hijacked' }).eq('family_id', famA).select())).toBe(true);
    expect((await ben.from('community_profiles').insert({ family_id: famA, display_name: 'Fake' })).error).toBeTruthy();
    expect((await ben.from('family_locations').upsert({ family_id: famA, zip5: '10001' })).error).toBeTruthy();
    expect((await ana.from('family_locations').update({ zip5: 'abcde' }).eq('family_id', famA)).error).toBeTruthy();
  });

  it('the finder shows bands, not ZIPs or contacts; hidden profiles and anon get nothing', async () => {
    const found = ok(await ben.rpc('nearby_families', { max_miles: 50 })) as { family_id: string; band: string; miles_rounded: number | null }[];
    const a = found.find((f) => f.family_id === famA)!;
    expect(a.band).toMatch(/^within /);
    expect(a.miles_rounded).toBeNull();
    expect(JSON.stringify(found)).not.toMatch(/80202|@example\.test/);
    expect(found.some((f) => f.family_id === famB)).toBe(false);
    ok(await cara.from('community_profiles').update({ visible: false }).eq('family_id', famC));
    expect((ok(await ben.rpc('nearby_families', { max_miles: 50 })) as { family_id: string }[]).some((f) => f.family_id === famC)).toBe(false);
    ok(await cara.from('community_profiles').update({ visible: true }).eq('family_id', famC));
    expect((await anon().rpc('nearby_families', { max_miles: 50 })).error).toBeTruthy();
    // A family far away isn't "nearby".
    const far = await user('sc-far');
    const famFar = await family(far, 'Far', '99501');
    expect((ok(await ben.rpc('nearby_families', { max_miles: 50 })) as { family_id: string }[]).some((f) => f.family_id === famFar)).toBe(false);
  });
});

describe('connections', () => {
  it('requests can only be sent as yourself, as pending, and not to yourself', async () => {
    expect((await ben.from('connections').insert({ from_family: famA, to_family: famC })).error).toBeTruthy();
    expect((await ben.from('connections').insert({ from_family: famB, to_family: famC, status: 'accepted' })).error).toBeTruthy();
    expect((await ben.from('connections').insert({ from_family: famB, to_family: famB })).error).toBeTruthy();
    expect((await ben.from('connections').insert({ from_family: famB, to_family: famC, message: 'x'.repeat(301) })).error).toBeTruthy();
    expect((await anon().from('connections').insert({ from_family: famB, to_family: famC })).error).toBeTruthy();
  });

  it('a recipient can answer a request but never re-point it at another family', async () => {
    ok(await ana.from('connections').insert({ from_family: famA, to_family: famB, message: 'Park day?' }));
    // Ben tries to turn Ana's request into an accepted connection with Cara (and get Cara's contact).
    await ben.from('connections').update({ from_family: famC, status: 'accepted', message: 'Rewritten' }).eq('from_family', famA).eq('to_family', famB);
    const mine = ok(await ben.rpc('my_connections')) as { family_id: string; status: string; contact: string; message: string }[];
    expect(mine.some((c) => c.family_id === famC)).toBe(false);
    expect(JSON.stringify(mine)).not.toContain(`cara-${run}@example.test`);
    expect(ok(await cara.rpc('my_connections'))).toEqual([]);
    // What did happen is just Ben's answer to Ana's request, with her message intact.
    const withAna = mine.find((c) => c.family_id === famA);
    expect(withAna === undefined || (withAna.status === 'accepted' && withAna.message === 'Park day?')).toBe(true);
    expect(msg(await ben.rpc('send_message', { to_family: famC, body: 'Hi Cara' }))).toMatch(/once you're connected/);
  });

  it('only accepted connections share contacts, and either side can remove one', async () => {
    ok(await ben.from('connections').update({ status: 'accepted' }).eq('from_family', famA).eq('to_family', famB));
    expect((ok(await ana.rpc('my_connections')) as { contact: string }[])[0].contact).toBe(`ben-${run}@example.test`);
    // A third family can't see or delete it.
    expect(ok(await cara.from('connections').select('*').eq('from_family', famA))).toHaveLength(0);
    expect(refused(await cara.from('connections').delete().eq('from_family', famA).select())).toBe(true);
    ok(await ben.from('connections').delete().eq('from_family', famA).eq('to_family', famB));
    expect(ok(await ana.rpc('my_connections'))).toEqual([]);
  });

  it('declined requests don’t show and share nothing', async () => {
    ok(await cara.from('connections').insert({ from_family: famC, to_family: famA }));
    ok(await ana.from('connections').update({ status: 'declined' }).eq('from_family', famC).eq('to_family', famA));
    expect(ok(await cara.rpc('my_connections'))).toEqual([]);
    const seen = (ok(await cara.rpc('nearby_families', { max_miles: 50 })) as { family_id: string; connection: string }[]).find((f) => f.family_id === famA);
    expect(seen?.connection).toBe('declined');
    // Re-requesting is not allowed while the old one stands, and a declined one can't be flipped by the sender.
    expect((await cara.from('connections').insert({ from_family: famC, to_family: famA })).error).toBeTruthy();
    expect(refused(await cara.from('connections').update({ status: 'accepted' }).eq('from_family', famC).eq('to_family', famA).select())).toBe(true);
  });
});

describe('field trips', () => {
  let ev: string;

  it('hosts are their own family, and are going', async () => {
    expect((await ben.from('events').insert({ title: 'Fake', starts_on: day(7), host_family: famA, host_name: 'Ana' })).error).toBeTruthy();
    ev = (ok(await ana.from('events').insert({ title: `Zoo ${run}`, starts_on: day(7), zip5: '80202', capacity: 2, host_family: famA, host_name: 'Ana' }).select('id').single()) as { id: string }).id;
    const seen = (ok(await ana.rpc('nearby_events', { max_miles: 50 })) as { id: string; going: number; i_host: boolean; i_am_going: boolean }[]).find((e) => e.id === ev)!;
    expect(seen).toMatchObject({ going: 1, i_host: true, i_am_going: true });
  });

  it('only the host edits or cancels', async () => {
    expect(refused(await ben.from('events').update({ title: 'Hijacked' }).eq('id', ev).select())).toBe(true);
    expect(refused(await ben.from('events').delete().eq('id', ev).select())).toBe(true);
    expect((await ana.from('events').update({ host_family: famB }).eq('id', ev)).error).toBeTruthy();
  });

  it('RSVPs are for your own family, names are set by the server, and carpools stay among carpoolers', async () => {
    expect((await ben.from('event_rsvps').insert({ event_id: ev, family_id: famC, display_name: 'x' })).error).toBeTruthy();
    ok(await ben.from('event_rsvps').insert({ event_id: ev, family_id: famB, display_name: 'The Host' }));
    const host = ok(await ana.from('event_rsvps').select('family_id, display_name').eq('event_id', ev)) as { family_id: string; display_name: string }[];
    expect(host.find((r) => r.family_id === famB)?.display_name).toBe(`Ben ${run}`);
    // Ben can see only his own RSVP, not the host's list.
    expect((ok(await ben.from('event_rsvps').select('family_id').eq('event_id', ev)) as { family_id: string }[]).map((r) => r.family_id)).toEqual([famB]);
    // Renaming yourself afterwards doesn't stick.
    await ben.from('event_rsvps').update({ display_name: `Ana ${run}` }).eq('event_id', ev).eq('family_id', famB);
    ok(await ana.from('event_rsvps').update({ carpool: true }).eq('event_id', ev).eq('family_id', famA));
    ok(await ben.from('event_rsvps').update({ carpool: true }).eq('event_id', ev).eq('family_id', famB));
    const fromAna = (ok(await ana.rpc('nearby_events', { max_miles: 50 })) as { id: string; carpool_names: string[] }[]).find((e) => e.id === ev)!;
    expect(fromAna.carpool_names).toEqual([`Ben ${run}`]);
    const fromCara = (ok(await cara.rpc('nearby_events', { max_miles: 50 })) as { id: string; carpool_names: string[] | null; going: number }[]).find((e) => e.id === ev)!;
    expect(fromCara).toMatchObject({ carpool_names: null, going: 2 });
  });

  it('a full trip can’t be joined by moving an RSVP over from another trip', async () => {
    expect(msg(await cara.from('event_rsvps').insert({ event_id: ev, family_id: famC, display_name: '' }))).toMatch(/full/);
    const other = (ok(await cara.from('events').insert({ title: `Library ${run}`, starts_on: day(9), zip5: '80202', host_family: famC, host_name: 'Cara' }).select('id').single()) as { id: string }).id;
    await cara.from('event_rsvps').update({ event_id: ev }).eq('event_id', other).eq('family_id', famC);
    const going = (ok(await ana.from('event_rsvps').select('family_id').eq('event_id', ev)) as { family_id: string }[]).map((r) => r.family_id);
    expect(going).not.toContain(famC);
    expect(going).toHaveLength(2);
  });

  it('past trips take no RSVPs and drop out of the list', async () => {
    // (The host's own RSVP is added when the trip is created, so a trip in the past can't even be created.)
    expect(msg(await ana.from('events').insert({ title: `Past ${run}`, starts_on: day(-3), zip5: '80202', host_family: famA, host_name: 'Ana' }))).toMatch(/already happened/);
    expect((await anon().rpc('nearby_events', { max_miles: 50 })).error).toBeTruthy();
  });

  it('an RSVP can be cancelled only by its family', async () => {
    expect(refused(await ana.from('event_rsvps').delete().eq('event_id', ev).eq('family_id', famB).select())).toBe(true);
    ok(await ben.from('event_rsvps').delete().eq('event_id', ev).eq('family_id', famB));
    expect((ok(await ben.rpc('nearby_events', { max_miles: 50 })) as { id: string; i_am_going: boolean }[]).find((e) => e.id === ev)?.i_am_going).toBe(false);
  });
});

describe('co-ops', () => {
  it('members join as themselves; the organizer can’t move a membership to another family', async () => {
    const coop = (ok(await ana.from('coops').insert({ name: `Explorers ${run}`, organizer_family: famA, zip5: '80202' }).select('id').single()) as { id: string }).id;
    expect((await ben.from('coops').insert({ name: 'Fake', organizer_family: famA })).error).toBeTruthy();
    ok(await ben.from('coop_members').insert({ coop_id: coop, family_id: famB, display_name: `Ana ${run}` }));
    const pending = (ok(await ana.rpc('nearby_coops', { max_miles: 50 })) as { id: string; pending: string[] }[]).find((c) => c.id === coop)!;
    // The name on a request is the family's own community name.
    expect(pending.pending).toEqual([`${famB}|Ben ${run}`]);
    // Approving Ben, but pointing the row at Cara instead, doesn't put Cara in the co-op.
    await ana.from('coop_members').update({ status: 'active', family_id: famC }).eq('coop_id', coop).eq('family_id', famB);
    const asCara = (ok(await cara.rpc('nearby_coops', { max_miles: 50 })) as { id: string; my_role: string | null }[]).find((c) => c.id === coop);
    expect(asCara?.my_role ?? null).toBeNull();
    expect(refused(await ben.from('coops').update({ name: 'Hijacked' }).eq('id', coop).select())).toBe(true);
    expect(refused(await cara.from('coop_members').delete().eq('coop_id', coop).eq('family_id', famA).select())).toBe(true);
  });
});

describe('messages and verification', () => {
  it('need a family, a community profile, and a confirmed email', async () => {
    const lone = await user('sc-lone');
    expect(msg(await lone.rpc('send_message', { to_family: famA, body: 'Hi' }))).toMatch(/family first/);
    expect(msg(await lone.rpc('request_verification', {}))).toMatch(/family first/);
    ok(await lone.rpc('create_family', { family_name: 'Lone', initial_data: {} }));
    expect(msg(await lone.rpc('request_verification', {}))).toMatch(/Join the community first/);
    expect((await anon().rpc('my_conversations')).error).toBeTruthy();
    expect((await anon().rpc('request_verification', {})).error).toBeTruthy();
  });

  it('a message to a family that doesn’t exist, or a malformed id, is refused', async () => {
    expect((await ana.rpc('send_message', { to_family: '00000000-0000-0000-0000-000000000000', body: 'Hi' })).error).toBeTruthy();
    expect((await ana.rpc('send_message', { to_family: 'not-a-uuid', body: 'Hi' })).error).toBeTruthy();
    expect(msg(await ana.rpc('report_content', { kind: 'message', target: 'not-a-uuid', why: 'spam', info: '' }))).toMatch(/isn't available/);
  });

  it('families can’t write verification or moderation records directly', async () => {
    expect((await ana.from('moderation_events').insert({ family_id: famA, target_kind: 'verification', target_id: famA, action: 'verified' })).error).toBeTruthy();
    const v = await ana.from('family_verifications').select('*');
    expect(v.error !== null || v.data?.length === 0).toBe(true);
    expect(ok(await ben.from('moderation_events').select('id').eq('family_id', famA))).toEqual([]);
  });
});

describe('page fetch limits through fetch-page', () => {
  const status = (r: { error: unknown }) => (r.error as { context?: Response } | null)?.context?.status;

  it('every request counts, and the 21st in a minute is refused with a wait time; others aren’t affected', async () => {
    const busy = await user('sc-busy');
    // Refused addresses still count (the claim comes before the address check), so the limit can't be probed around.
    const results = [];
    for (let i = 0; i < 21; i++) results.push(await busy.functions.invoke('fetch-page', { body: { url: `http://127.0.0.1:1/${i}` } }));
    expect(results.slice(0, 20).map(status).every((s) => s !== 429)).toBe(true);
    expect(status(results[20])).toBe(429);
    const body = await (results[20].error as { context: Response }).context.json();
    expect(body.error).toMatch(/a lot of pages in a minute\. Try again in \d+ seconds?\./);
    expect(status(await busy.functions.invoke('fetch-page', { body: { url: 'https://example.org/' } }))).toBe(429);
    // Not a web address: turned away before anything is counted.
    const fresh = await user('sc-fresh');
    expect(status(await fresh.functions.invoke('fetch-page', { body: { url: 'not a url' } }))).toBe(400);
    expect(status(await fresh.functions.invoke('fetch-page', { body: { url: 42 } }))).toBe(400);
  });
});
