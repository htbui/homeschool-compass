/// <reference types="node" />
// Studio Insights on the server: families report anonymous lesson rows,
// creators see totals only for lessons 5+ families reported, and opting out
// deletes what a family shared.
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

const units = [{ id: 'u1', title: 'Rocks', lessons: [{ id: 'l1', title: 'Fossils', steps: [], links: [], questions: [] }, { id: 'l2', title: 'Crystals', steps: [], links: [], questions: [] }] }];
const pkg = (id: string, price: number) => ({
  id, title: `Rock Detectives ${id}`, description: 'Hands-on geology for curious kids.', subjects: ['science'], gradeMin: 2, gradeMax: 4, philosophies: [],
  parentInvolvement: 'medium', familyStyle: false, minutesPerLesson: 30, lessonsPerWeek: 3, format: 'digital', cover: '🪨', color: '#2F6B5E', price, units,
  origin: { kind: 'original' }, license: { kind: 'cc_by', version: '4.0' }, status: 'draft', version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
const report = (listingId: string, lessonId: string, lessonNo: number, p: Record<string, unknown> = {}) => ({ listingId, lessonId, lessonNo, done: true, skipped: false, minutes: 60, planned: 30, tricky: false, ...p });

let creator: SupabaseClient;
let families: SupabaseClient[];
const famIds: string[] = [];
let free: string;
let paid: string;

beforeAll(async () => {
  [creator, ...families] = await Promise.all([user('ins-creator'), ...Array.from({ length: 6 }, (_, i) => user(`ins-fam${i}`))]);
  ok(await creator.from('creator_profiles').insert({ name: `Rocks ${run}`, bio: '' }));
  for (const [id, price] of [[`free-${run}`, 0], [`paid-${run}`, 9]] as const) {
    const p = pkg(id, price);
    ok(await creator.from('packages').upsert({ id, title: p.title, origin_kind: 'original', content: p }));
  }
  free = (ok(await creator.rpc('publish_package', { pkg_id: `free-${run}` })) as { id: string }).id;
  paid = (ok(await creator.rpc('publish_package', { pkg_id: `paid-${run}` })) as { id: string }).id;
  for (const [i, f] of families.entries()) famIds.push((ok(await f.rpc('create_family', { family_name: `Family ${i}`, initial_data: {} })) as { family_id: string }[])[0].family_id);
});

const insights = async (c: SupabaseClient = creator) => ok(await c.rpc('lesson_insights', { lid: free })) as { lesson_id: string; families: number; done: number; tricky: number; avg_minutes: number | null; avg_planned: number | null; total_families: number }[];

describe('reporting', () => {
  it('accepts one row per lesson per family, and re-sends replace it', async () => {
    for (const [i, f] of families.entries()) {
      const rows = [report(free, 'l1', 1, { tricky: i < 3 })];
      if (i < 4) rows.push(report(free, 'l2', 2, { minutes: null }));
      expect(ok(await f.rpc('report_lesson_progress', { reports: rows }))).toBe(rows.length);
    }
    ok(await families[0].rpc('report_lesson_progress', { reports: [report(free, 'l1', 1, { tricky: true })] }));
    const l1 = (await insights()).find((r) => r.lesson_id === 'l1')!;
    expect(l1).toMatchObject({ families: 6, done: 6, tricky: 3, total_families: 6 });
    expect(Number(l1.avg_minutes)).toBe(60);
    expect(Number(l1.avg_planned)).toBe(30);
  });

  it('hides lessons fewer than 5 families reported', async () => {
    expect((await insights()).map((r) => r.lesson_id)).toEqual(['l1']);
  });

  it('shows totals only to the creator, and no one reads the rows', async () => {
    expect(await insights(families[0])).toEqual([]);
    for (const c of [creator, families[0]]) expect((await c.from('lesson_reports').select('*')).data ?? []).toHaveLength(0);
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.rpc('report_lesson_progress', { reports: [report(free, 'l1', 1)] })).error).toBeTruthy();
    expect((await anon.rpc('lesson_insights', { lid: free })).error).toBeTruthy();
  });

  it('ignores plans the family doesn’t own, non-Studio listings, the creator’s own family, and junk', async () => {
    expect(ok(await families[0].rpc('report_lesson_progress', { reports: [report(paid, 'l1', 1), report('no-such-listing', 'l1', 1)] }))).toBe(0);
    expect(ok(await families[0].rpc('report_lesson_progress', { reports: [report(free, 'l9', 'x' as unknown as number), report(free, '', 1), 'nope'] }))).toBe(0);
    ok(await creator.rpc('create_family', { family_name: 'Creator family', initial_data: {} }));
    expect(ok(await creator.rpc('report_lesson_progress', { reports: [report(free, 'l1', 1)] }))).toBe(0);
    expect((await families[0].rpc('report_lesson_progress', { reports: Array.from({ length: 501 }, () => report(free, 'l1', 1)) })).error?.message).toMatch(/500/);
    // Out-of-range minutes are dropped, not stored.
    expect(ok(await families[1].rpc('report_lesson_progress', { reports: [report(free, 'l1', 1, { minutes: 9999 })] }))).toBe(1);
    expect((await insights()).find((r) => r.lesson_id === 'l1')?.families).toBe(6);
  });
});

describe('opting out', () => {
  it('deletes a family’s rows when they turn sharing off, and refuses new ones', async () => {
    const f = families[5];
    ok(await f.rpc('push_workspace', { fid: famIds[5], base_version: 1, new_data: { family: { familyName: 'Family 5', insightsOptOut: true } } }));
    expect((await insights()).find((r) => r.lesson_id === 'l1')?.families).toBe(5);
    expect(ok(await f.rpc('report_lesson_progress', { reports: [report(free, 'l1', 1)] }))).toBe(0);
  });

  it('forgets on request, which drops a lesson below the minimum', async () => {
    ok(await families[4].rpc('forget_lesson_reports'));
    expect(await insights()).toEqual([]);
  });
});
