// Compass: families, the synced workspace, invites and family media, checked
// as real users (and an anonymous visitor) through the public API.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:55421';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const client = () => createClient(URL, KEY, { auth: { persistSession: false } });
async function user(name: string): Promise<SupabaseClient & { uid: string }> {
  const c = client();
  const { data, error } = await c.auth.signUp({ email: `compass-${name}-${run}@example.test`, password: 'test-password-1' });
  if (error) throw error;
  return Object.assign(c, { uid: data.user!.id });
}
const ok = <T,>(r: { data: T; error: unknown }) => {
  if (r.error) throw r.error;
  return r.data;
};
type PushRow = { ok: boolean; version: number; data: Record<string, unknown> | null };
const push = async (c: SupabaseClient, fid: string, base: number, data: unknown) => (ok(await c.rpc('push_workspace', { fid, base_version: base, new_data: data })) as PushRow[])[0];
const version = async (c: SupabaseClient, fid: string) => Number((ok(await c.from('workspaces').select('version').eq('family_id', fid).single()) as { version: number }).version);
const createFamily = async (c: SupabaseClient, name: string, data: unknown = {}) => (ok(await c.rpc('create_family', { family_name: name, initial_data: data })) as { family_id: string; version: number }[])[0];

let owner: Awaited<ReturnType<typeof user>>; // first parent
let partner: Awaited<ReturnType<typeof user>>; // second parent (joins by invite)
let other: Awaited<ReturnType<typeof user>>; // a different family
let stranger: Awaited<ReturnType<typeof user>>; // signed in, no family
let anon: SupabaseClient;
let fam: string;
let otherFam: string;

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

beforeAll(async () => {
  [owner, partner, other, stranger] = await Promise.all([user('owner'), user('partner'), user('other'), user('stranger')]);
  anon = client();
  const workspace = { family: { familyName: 'Compass Crew', parentPin: '1234' }, children: [{ id: 'k1', name: 'Leo' }], tasks: [], help: [] };
  const made = await createFamily(owner, 'Compass Crew', workspace);
  expect(made.version).toBe(1);
  fam = made.family_id;
  otherFam = (await createFamily(other, 'Other Crew')).family_id;
});

describe('creating a family', () => {
  it('stores the device’s data as version 1 and makes the creator the owner', async () => {
    const ws = ok(await owner.from('workspaces').select('data, version, updated_by').eq('family_id', fam).single()) as { data: { children: { name: string }[] }; version: number; updated_by: string };
    expect(ws).toMatchObject({ version: 1, updated_by: owner.uid });
    expect(ws.data.children[0].name).toBe('Leo');
    expect(ok(await owner.from('family_members').select('user_id, role').eq('family_id', fam))).toEqual([{ user_id: owner.uid, role: 'owner' }]);
    expect(ok(await owner.from('families').select('name').eq('id', fam).single())).toEqual({ name: 'Compass Crew' });
  });

  it('validates the name and refuses a second family for the same account', async () => {
    const fresh = await user('names');
    expect((await fresh.rpc('create_family', { family_name: '', initial_data: {} })).error).toBeTruthy();
    expect((await fresh.rpc('create_family', { family_name: 'x'.repeat(121), initial_data: {} })).error).toBeTruthy();
    expect((await owner.rpc('create_family', { family_name: 'Again', initial_data: {} })).error?.message).toMatch(/already belongs/);
  });

  it('requires a signed-in user', async () => {
    expect((await anon.rpc('create_family', { family_name: 'Anon', initial_data: {} })).error).toBeTruthy();
  });

  it('only accepts a JSON object as the workspace (regression)', async () => {
    const fresh = await user('arr');
    expect((await fresh.rpc('create_family', { family_name: 'Arr', initial_data: [1, 2] })).error?.message).toMatch(/JSON object/);
    // Nothing was created by the refused call.
    expect(ok(await fresh.from('family_members').select('family_id'))).toEqual([]);
  });
});

describe('workspace sync', () => {
  it('increments the version on every push and records who pushed', async () => {
    const v = await version(owner, fam);
    expect(await push(owner, fam, v, { family: { familyName: 'Compass Crew' }, tasks: [{ id: 't1', status: 'todo' }] })).toMatchObject({ ok: true, version: v + 1, data: null });
    const ws = ok(await owner.from('workspaces').select('version, updated_by, updated_at').eq('family_id', fam).single()) as { version: number; updated_by: string; updated_at: string };
    expect(ws).toMatchObject({ version: v + 1, updated_by: owner.uid });
  });

  it('a stale push is refused and gets the current copy back to merge', async () => {
    const v = await version(owner, fam);
    await push(owner, fam, v, { family: { familyName: 'Compass Crew' }, tasks: [{ id: 't1', status: 'done' }] });
    const stale = await push(owner, fam, v, { family: { familyName: 'Compass Crew' }, tasks: [] });
    expect(stale).toMatchObject({ ok: false, version: v + 1 });
    expect(stale.data).toMatchObject({ tasks: [{ id: 't1', status: 'done' }] });
    // A push from the future is refused too.
    expect((await push(owner, fam, v + 50, {})).ok).toBe(false);
    expect(await version(owner, fam)).toBe(v + 1);
  });

  it('refuses a workspace that is not a JSON object (regression)', async () => {
    const v = await version(owner, fam);
    for (const bad of [[{ id: 'x' }], 'oops', 42, null]) {
      expect((await owner.rpc('push_workspace', { fid: fam, base_version: v, new_data: bad })).error?.message, JSON.stringify(bad)).toMatch(/JSON object/);
    }
    expect(await version(owner, fam)).toBe(v);
  });

  it('other families, strangers and visitors can neither read nor write it', async () => {
    for (const c of [other, stranger, anon]) {
      expect(ok(await c.from('workspaces').select('data').eq('family_id', fam))).toEqual([]);
      expect(ok(await c.from('families').select('name').eq('id', fam))).toEqual([]);
      expect(ok(await c.from('family_members').select('user_id').eq('family_id', fam))).toEqual([]);
    }
    expect((await other.rpc('push_workspace', { fid: fam, base_version: 1, new_data: {} })).error?.message).toMatch(/Not a member/);
    expect((await stranger.rpc('push_workspace', { fid: fam, base_version: 1, new_data: {} })).error?.message).toMatch(/Not a member/);
    expect((await anon.rpc('push_workspace', { fid: fam, base_version: 1, new_data: {} })).error).toBeTruthy();
  });

  it('nobody can bypass push_workspace with direct table writes', async () => {
    const v = await version(owner, fam);
    // Row-level security: no write policies, so these change nothing.
    expect((await owner.from('workspaces').update({ data: {}, version: 999 }).eq('family_id', fam).select()).data ?? []).toEqual([]);
    expect((await owner.from('workspaces').insert({ family_id: otherFam, data: {} })).error?.message).toMatch(/row-level security/);
    expect((await owner.from('workspaces').delete().eq('family_id', fam).select()).data ?? []).toEqual([]);
    expect((await other.from('workspaces').delete().eq('family_id', fam).select()).data ?? []).toEqual([]);
    expect(await version(owner, fam)).toBe(v);
    expect(ok(await owner.from('workspaces').select('data').eq('family_id', fam).single())).toMatchObject({ data: { family: { familyName: 'Compass Crew' } } });
  });
});

describe('the family row and membership', () => {
  it('members can rename their family but not touch its owner or creation date (regression)', async () => {
    ok(await owner.from('families').update({ name: 'Compass Crew!' }).eq('id', fam));
    expect((ok(await owner.from('families').select('name').eq('id', fam).single()) as { name: string }).name).toBe('Compass Crew!');
    expect((await owner.from('families').update({ created_by: other.uid }).eq('id', fam)).error).toBeTruthy();
    expect((await owner.from('families').update({ created_at: '2000-01-01T00:00:00Z' }).eq('id', fam)).error).toBeTruthy();
    expect((await owner.from('families').update({ name: '' }).eq('id', fam)).error).toBeTruthy();
  });

  it('other families cannot rename it', async () => {
    expect(ok(await other.from('families').update({ name: 'Hijacked' }).eq('id', fam).select())).toEqual([]);
    expect((ok(await owner.from('families').select('name').eq('id', fam).single()) as { name: string }).name).toBe('Compass Crew!');
  });

  it('nobody can add or remove members directly', async () => {
    expect((await stranger.from('family_members').insert({ family_id: fam, user_id: stranger.uid })).error).toBeTruthy();
    expect((await owner.from('family_members').insert({ family_id: fam, user_id: stranger.uid })).error).toBeTruthy();
    expect((await owner.from('family_members').update({ role: 'parent' }).eq('family_id', fam).select()).data ?? []).toEqual([]);
    expect((await owner.from('family_members').delete().eq('family_id', fam).select()).data ?? []).toEqual([]);
    expect((await other.from('family_members').delete().eq('family_id', fam).select()).data ?? []).toEqual([]);
    expect(ok(await owner.from('family_members').select('user_id, role').eq('family_id', fam))).toEqual([{ user_id: owner.uid, role: 'owner' }]);
  });
});

describe('invites: a second parent', () => {
  let code: string;

  it('only members can make invites, and only they can see them', async () => {
    expect((await stranger.rpc('create_family_invite')).error?.message).toMatch(/Create or join a family first/);
    expect((await anon.rpc('create_family_invite')).error).toBeTruthy();
    code = ok(await owner.rpc('create_family_invite')) as string;
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(ok(await owner.from('family_invites').select('code').eq('code', code))).toHaveLength(1);
    for (const c of [other, stranger, anon]) expect(ok(await c.from('family_invites').select('code').eq('code', code))).toEqual([]);
    expect((await owner.from('family_invites').insert({ code: 'AAAAAAAA', family_id: fam })).error).toBeTruthy();
    expect(ok(await owner.from('family_invites').update({ expires_at: '2100-01-01T00:00:00Z' }).eq('code', code).select())).toEqual([]);
  });

  it('a bad code, a visitor, or someone already in a family cannot use it', async () => {
    expect((await partner.rpc('join_family', { invite_code: 'NOPE2345' })).error?.message).toMatch(/invalid or expired/);
    expect((await anon.rpc('join_family', { invite_code: code })).error).toBeTruthy();
    expect((await other.rpc('join_family', { invite_code: code })).error?.message).toMatch(/already belongs/);
    // The failed attempt didn't use up the code.
    expect((ok(await owner.from('family_invites').select('used_at').eq('code', code).single()) as { used_at: string | null }).used_at).toBeNull();
  });

  it('the second parent joins (code is trimmed and case-insensitive) and shares the workspace', async () => {
    expect(ok(await partner.rpc('join_family', { invite_code: `  ${code.toLowerCase()} ` }))).toBe(fam);
    const members = ok(await partner.from('family_members').select('user_id, role').eq('family_id', fam)) as { user_id: string; role: string }[];
    expect(members.find((m) => m.user_id === partner.uid)?.role).toBe('parent');
    expect(members).toHaveLength(2);
    const inv = ok(await owner.from('family_invites').select('used_by, used_at').eq('code', code).single()) as { used_by: string; used_at: string };
    expect(inv.used_by).toBe(partner.uid);
    expect(inv.used_at).toBeTruthy();
  });

  it('both parents push to one version line: whoever is second merges', async () => {
    const v = await version(owner, fam);
    expect((await push(partner, fam, v, { family: { familyName: 'Compass Crew' }, tasks: [{ id: 'partner-task' }] })).ok).toBe(true);
    const late = await push(owner, fam, v, { family: { familyName: 'Compass Crew' }, tasks: [{ id: 'owner-task' }] });
    expect(late.ok).toBe(false);
    expect(late.data).toMatchObject({ tasks: [{ id: 'partner-task' }] });
    expect((await push(owner, fam, late.version, { family: { familyName: 'Compass Crew' }, tasks: [{ id: 'partner-task' }, { id: 'owner-task' }] })).ok).toBe(true);
  });

  it('an invite works once', async () => {
    expect((await stranger.rpc('join_family', { invite_code: code })).error?.message).toMatch(/invalid or expired/);
  });

  it('a revoked invite stops working', async () => {
    const c2 = ok(await partner.rpc('create_family_invite')) as string;
    ok(await owner.from('family_invites').delete().eq('code', c2));
    expect((await stranger.rpc('join_family', { invite_code: c2 })).error?.message).toMatch(/invalid or expired/);
    // Other families can't revoke ours.
    const c3 = ok(await owner.rpc('create_family_invite')) as string;
    ok(await other.from('family_invites').delete().eq('code', c3));
    expect(ok(await owner.from('family_invites').select('code').eq('code', c3))).toHaveLength(1);
  });
});

describe('family media (portfolio photos, receipts, lesson files)', () => {
  it('both parents can upload and read; other families and visitors cannot', async () => {
    ok(await owner.storage.from('family-media').upload(`${fam}/evidence/${run}.png`, PNG, { contentType: 'image/png', upsert: true }));
    expect((await partner.storage.from('family-media').createSignedUrl(`${fam}/evidence/${run}.png`, 60)).data?.signedUrl).toBeTruthy();
    ok(await partner.storage.from('family-media').upload(`${fam}/receipts/${run}.png`, PNG, { contentType: 'image/png', upsert: true }));
    expect((await other.storage.from('family-media').createSignedUrl(`${fam}/receipts/${run}.png`, 60)).error).toBeTruthy();
    expect((await anon.storage.from('family-media').createSignedUrl(`${fam}/receipts/${run}.png`, 60)).error).toBeTruthy();
    expect((await anon.storage.from('family-media').upload(`${fam}/evidence/anon.png`, PNG, { contentType: 'image/png' })).error).toBeTruthy();
    expect(ok(await other.storage.from('family-media').list(fam))).toEqual([]);
  });

  it('other families cannot overwrite or delete our files', async () => {
    const path = `${fam}/evidence/${run}.png`;
    expect((await other.storage.from('family-media').upload(path, PNG, { contentType: 'image/png', upsert: true })).error).toBeTruthy();
    const removed = await other.storage.from('family-media').remove([path]);
    expect(removed.data ?? []).toEqual([]);
    expect((await owner.storage.from('family-media').createSignedUrl(path, 60)).data?.signedUrl).toBeTruthy();
  });

  it('uploads must sit in a family folder and be an allowed type', async () => {
    expect((await owner.storage.from('family-media').upload(`not-a-uuid/${run}.png`, PNG, { contentType: 'image/png' })).error).toBeTruthy();
    expect((await owner.storage.from('family-media').upload(`${run}.png`, PNG, { contentType: 'image/png' })).error).toBeTruthy();
    expect((await owner.storage.from('family-media').upload(`${otherFam}/evidence/${run}.png`, PNG, { contentType: 'image/png' })).error).toBeTruthy();
    expect((await owner.storage.from('family-media').upload(`${fam}/evidence/${run}.html`, new TextEncoder().encode('<script>'), { contentType: 'text/html' })).error).toBeTruthy();
  });

  it('members can delete their own family’s files', async () => {
    const path = `${fam}/receipts/${run}.png`;
    expect(ok(await owner.storage.from('family-media').remove([path]))).toHaveLength(1);
    expect((await owner.storage.from('family-media').createSignedUrl(path, 60)).error).toBeTruthy();
  });
});

describe('leaving a family', () => {
  it('a parent who leaves loses access, and the family stays for the other parent', async () => {
    ok(await partner.rpc('leave_family'));
    expect(ok(await partner.from('workspaces').select('version').eq('family_id', fam))).toEqual([]);
    expect((await partner.rpc('push_workspace', { fid: fam, base_version: await version(owner, fam), new_data: {} })).error?.message).toMatch(/Not a member/);
    expect((await partner.storage.from('family-media').createSignedUrl(`${fam}/evidence/${run}.png`, 60)).error).toBeTruthy();
    expect(ok(await owner.from('workspaces').select('version').eq('family_id', fam))).toHaveLength(1);
    // They can start over with a new family.
    expect((await createFamily(partner, 'Partner Fresh Start')).version).toBe(1);
    ok(await partner.rpc('leave_family'));
  });

  it('leaving without a family is a no-op; visitors cannot call it', async () => {
    expect((await stranger.rpc('leave_family')).error).toBeNull();
    expect((await anon.rpc('leave_family')).error).toBeTruthy();
  });

  it('the last member leaving deletes the family, its workspace and invites', async () => {
    const solo = await user('solo');
    const fid = (await createFamily(solo, 'Solo Crew', { family: { familyName: 'Solo' } })).family_id;
    const code = ok(await solo.rpc('create_family_invite')) as string;
    ok(await solo.rpc('leave_family'));
    expect(ok(await solo.from('families').select('id').eq('id', fid))).toEqual([]);
    expect((await stranger.rpc('join_family', { invite_code: code })).error?.message).toMatch(/invalid or expired/);
    // And the account can start a new family afterwards.
    expect((await createFamily(solo, 'Solo Again')).version).toBe(1);
  });
});
