import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { deepEqual, mergeWorkspace } from '@/lib/sync';
import { useAccount } from '@/store/useAccount';
import { useStore, type Store } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';

import { friendlyError, supabase } from './cloud';
import { readForUpload } from './media';

/**
 * Family workspace sync. Each device keeps working offline against its local
 * store; this pushes changes (debounced), pulls other devices' changes in real
 * time, and three-way merges when two devices edited at once.
 */

export const SYNC_KEYS = ['family', 'children', 'blocks', 'tasks', 'help', 'moods', 'evidence', 'hoursLogs', 'curricula', 'expenses', 'esaAnnualAward', 'noi', 'purchases'] as const;
type SyncKey = (typeof SYNC_KEYS)[number];
export type Workspace = Pick<Store, SyncKey>;

const BASE_KEY = 'kinship-sync-base';
const PUSH_DELAY = 1200;

let base: Partial<Workspace> = {};
let channel: RealtimeChannel | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let busy = false;
let again = false;
let started = false;
let unsubscribeStore: (() => void) | null = null;

const account = () => useAccount.getState();

/** The synced part of the store. Local photo files stay on this device; other devices load them from storage. */
export function snapshot(s: Store = useStore.getState()): Workspace {
  const out = {} as Record<string, unknown>;
  for (const k of SYNC_KEYS) out[k] = s[k];
  out.evidence = s.evidence.map((e) => ({ ...e, uri: '' }));
  out.expenses = s.expenses.map(({ receiptUri: _r, ...e }) => e);
  out.curricula = s.curricula.map((c) => (c.materials ? { ...c, materials: c.materials.map(({ uri: _u, ...m }) => m) } : c));
  // Round-trip through JSON so `undefined` fields match what the server stores.
  return JSON.parse(JSON.stringify(out));
}

/** Write a synced document into the store, keeping this device's local photo files. */
function apply(ws: Partial<Workspace>) {
  useStore.setState((s) => {
    const next: Partial<Store> = {};
    for (const k of SYNC_KEYS) {
      if (ws[k] !== undefined) (next as Record<string, unknown>)[k] = ws[k];
    }
    if (ws.evidence) next.evidence = ws.evidence.map((e) => ({ ...e, uri: s.evidence.find((x) => x.id === e.id)?.uri || e.uri || '' }));
    if (ws.expenses) next.expenses = ws.expenses.map((e) => ({ ...e, receiptUri: s.expenses.find((x) => x.id === e.id)?.receiptUri }));
    if (ws.curricula) {
      const local = new Map(s.curricula.flatMap((c) => c.materials ?? []).map((m) => [m.id, m.uri]));
      next.curricula = ws.curricula.map((c) => (c.materials ? { ...c, materials: c.materials.map((m) => ({ ...m, uri: local.get(m.id) })) } : c));
    }
    return next;
  });
}

async function saveBase(ws: Partial<Workspace>, version: number) {
  base = ws;
  useAccount.getState().set({ version, lastSyncedAt: new Date().toISOString(), status: 'idle', error: undefined });
  await AsyncStorage.setItem(BASE_KEY, JSON.stringify(ws));
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

function fail(e: unknown) {
  const msg = friendlyError(e);
  const offline = /reach Freerange/.test(msg);
  account().set({ status: offline ? 'offline' : 'error', error: msg });
  // Network blips: try again shortly instead of waiting for the next edit.
  if (offline && account().familyId && !retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      pull();
    }, 15_000);
  }
}

// ───────────────────────────── Lifecycle

/** Call once at app start. Connects whenever someone signs in. */
export function startSync() {
  if (!supabase || started) return;
  started = true;
  AsyncStorage.getItem(BASE_KEY).then((raw) => {
    if (raw) base = JSON.parse(raw);
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      // Leave the auth callback before doing more Supabase calls (supabase-js deadlocks otherwise).
      setTimeout(() => connect(session.user.id, session.user.email ?? undefined), 0);
    }
    if (event === 'SIGNED_OUT') stop();
  });
  AppState.addEventListener('change', (st) => {
    if (st === 'active' && account().familyId) pull();
  });
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => account().familyId && pull());
  }
  // Anyone can browse the live catalog; buying needs an account.
  import('./marketApi').then((m) => m.refreshMarketplace());
}

async function connect(userId: string, email?: string) {
  if (!supabase) return;
  account().set({ userId, email, status: 'syncing', error: undefined });
  // Studio drafts and the creator profile belong to the account, not the family.
  import('./studioApi').then((m) => m.loadStudio()).catch(() => {});
  try {
    const { data, error } = await supabase.from('family_members').select('family_id, families(name)').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    const local = useStore.getState().family;
    if (data) {
      const fid = data.family_id as string;
      const name = (data.families as unknown as { name: string } | null)?.name ?? 'Your family';
      if (account().familyId === fid) {
        await pull();
      } else if (local) {
        // This device already has a family and the account has one too: let the parent choose.
        account().set({ conflict: { familyId: fid, familyName: name }, status: 'idle' });
        return;
      } else {
        await adoptCloud(fid, name);
      }
      listen(fid);
    } else if (local) {
      await createFamily();
    } else {
      // Signed in on a fresh device with no family yet: create one when onboarding finishes.
      account().set({ status: 'idle', familyId: undefined });
    }
    watchStore();
    const { refreshMarketplace } = await import('./marketApi');
    refreshMarketplace();
  } catch (e) {
    fail(e);
    // Offline at launch: keep recording changes and catch up when the network returns.
    const fid = account().familyId;
    if (fid) {
      watchStore();
      listen(fid);
    }
  }
}

function stop() {
  if (pushTimer) clearTimeout(pushTimer);
  if (pollTimer) clearInterval(pollTimer);
  pushTimer = null;
  pollTimer = null;
  channel?.unsubscribe();
  channel = null;
  unsubscribeStore?.();
  unsubscribeStore = null;
}

function watchStore() {
  if (unsubscribeStore) return;
  unsubscribeStore = useStore.subscribe((s, prev) => {
    if (!SYNC_KEYS.some((k) => s[k] !== prev[k])) return;
    if (!account().familyId && s.family && !prev.family && account().userId && !account().conflict) {
      // Onboarding just finished on a signed-in device.
      createFamily();
      return;
    }
    schedulePush();
  });
}

function listen(fid: string) {
  if (!supabase) return;
  channel?.unsubscribe();
  channel = supabase
    .channel(`workspace:${fid}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspaces', filter: `family_id=eq.${fid}` }, (payload) => {
      const row = payload.new as { version: number; data: Workspace };
      if (row.version > account().version) receive(row.data, row.version);
    })
    .subscribe();
  if (pollTimer) clearInterval(pollTimer);
  // Realtime can drop on flaky networks; poll as a fallback.
  pollTimer = setInterval(() => pull(), 60_000);
}

// ───────────────────────────── Family setup

async function createFamily() {
  if (!supabase) return;
  const s = useStore.getState();
  if (!s.family) return;
  account().set({ status: 'syncing' });
  try {
    await uploadMedia(undefined);
    const ws = snapshot();
    const { data, error } = await supabase.rpc('create_family', { family_name: s.family.familyName, initial_data: ws });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { family_id: string; version: number };
    account().set({ familyId: row.family_id, familyName: s.family.familyName, conflict: undefined });
    await saveBase(ws, Number(row.version));
    listen(row.family_id);
    schedulePush(); // uploads any photos now that the family folder exists
  } catch (e) {
    fail(e);
  }
}

async function adoptCloud(fid: string, name: string) {
  if (!supabase) return;
  const { data, error } = await supabase.from('workspaces').select('data, version').eq('family_id', fid).single();
  if (error) throw error;
  apply(data.data as Workspace);
  account().set({ familyId: fid, familyName: name, conflict: undefined });
  await saveBase(data.data as Workspace, Number(data.version));
}

/** Resolve "this device vs. the account" when both already have a family. */
export async function resolveConflict(choice: 'cloud' | 'device') {
  const c = account().conflict;
  if (!supabase || !c) return;
  account().set({ status: 'syncing' });
  try {
    if (choice === 'cloud') {
      await adoptCloud(c.familyId, c.familyName);
    } else {
      const { data, error } = await supabase.from('workspaces').select('version').eq('family_id', c.familyId).single();
      if (error) throw error;
      account().set({ familyId: c.familyId, familyName: c.familyName, conflict: undefined });
      await uploadMedia(c.familyId);
      const ws = snapshot();
      const res = await supabase.rpc('push_workspace', { fid: c.familyId, base_version: data.version, new_data: ws });
      if (res.error) throw res.error;
      await saveBase(ws, Number((res.data as { version: number }[])[0].version));
    }
    listen(c.familyId);
    watchStore();
  } catch (e) {
    fail(e);
  }
}

/** Join another parent's family with an invite code (replaces this device's data). */
export async function joinFamily(code: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('join_family', { invite_code: code });
  if (error) throw new Error(friendlyError(error));
  const fid = data as string;
  const fam = await supabase.from('families').select('name').eq('id', fid).single();
  await adoptCloud(fid, fam.data?.name ?? 'Your family');
  listen(fid);
  watchStore();
}

export async function createInvite(): Promise<string> {
  if (!supabase) throw new Error('Sign in first');
  const { data, error } = await supabase.rpc('create_family_invite');
  if (error) throw new Error(friendlyError(error));
  return data as string;
}

// ───────────────────────────── Push / pull

export function schedulePush() {
  if (!account().familyId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(), PUSH_DELAY);
}

export async function push(): Promise<void> {
  const fid = account().familyId;
  if (!supabase || !fid || account().conflict) return;
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    await uploadMedia(fid);
    for (let attempt = 0; attempt < 4; attempt++) {
      const local = snapshot();
      if (!local.family) return; // never overwrite the cloud with an erased device
      if (deepEqual(local, base)) {
        account().set({ status: 'idle', error: undefined });
        return;
      }
      account().set({ status: 'syncing' });
      const { data, error } = await supabase.rpc('push_workspace', { fid, base_version: account().version, new_data: local });
      if (error) throw error;
      const row = (data as { ok: boolean; version: number; data: Workspace | null }[])[0];
      if (row.ok) {
        await saveBase(local, Number(row.version));
        return;
      }
      // Someone else synced first: merge their changes with ours and try again.
      const merged = mergeWorkspace(base, local, row.data ?? {});
      apply(merged);
      await saveBase(row.data ?? {}, Number(row.version));
      account().set({ status: 'syncing' });
    }
  } catch (e) {
    fail(e);
  } finally {
    busy = false;
    if (again) {
      again = false;
      schedulePush();
    }
  }
}

export async function pull(): Promise<void> {
  const fid = account().familyId;
  if (!supabase || !fid || account().conflict) return;
  try {
    const { data, error } = await supabase.from('workspaces').select('data, version').eq('family_id', fid).single();
    if (error) throw error;
    if (Number(data.version) > account().version) await receive(data.data as Workspace, Number(data.version));
    else if (!deepEqual(snapshot(), base)) schedulePush();
    else account().set({ status: 'idle', error: undefined });
  } catch (e) {
    fail(e);
  }
}

async function receive(remote: Workspace, version: number) {
  if (busy) {
    // A push is in flight; it will reconcile through the version check.
    again = true;
    return;
  }
  const local = snapshot();
  if (deepEqual(local, base)) {
    apply(remote);
    await saveBase(remote, version);
  } else {
    apply(mergeWorkspace(base, local, remote));
    await saveBase(remote, version);
    schedulePush();
  }
}

// ───────────────────────────── Media

const UPLOAD_LIMIT = 6;

/** Upload portfolio photos, receipts, and lesson files that only exist on this device. */
async function uploadMedia(fid: string | undefined) {
  if (!supabase || !fid) return;
  const s = useStore.getState();
  const photos = s.evidence.filter((e) => e.uri && !e.remotePath).slice(0, UPLOAD_LIMIT);
  const receipts = s.expenses.filter((e) => e.receiptUri && !e.receiptPath).slice(0, UPLOAD_LIMIT);
  const files = s.curricula.flatMap((c) => (c.materials ?? []).filter((m) => m.uri && !m.remotePath).map((m) => ({ c, m }))).slice(0, UPLOAD_LIMIT);
  for (const { c, m } of files) {
    const path = await upload(fid, `materials/${m.id}`, m.uri!, m.mimeType);
    if (path) useStore.getState().updateMaterial(c.id, m.id, { remotePath: path });
  }
  for (const e of photos) {
    const path = await upload(fid, `evidence/${e.id}`, e.uri);
    if (path) useStore.setState((st) => ({ evidence: st.evidence.map((x) => (x.id === e.id ? { ...x, remotePath: path } : x)) }));
  }
  for (const e of receipts) {
    const path = await upload(fid, `receipts/${e.id}`, e.receiptUri!);
    if (path) useStore.setState((st) => ({ expenses: st.expenses.map((x) => (x.id === e.id ? { ...x, receiptPath: path } : x)) }));
  }
}

/** Store a file in family cloud storage right away (signed in only); returns its path. */
export async function uploadFamilyFile(name: string, uri: string, contentType?: string): Promise<string | undefined> {
  const fid = account().familyId;
  return supabase && fid ? upload(fid, name, uri, contentType) : undefined;
}

async function upload(fid: string, name: string, uri: string, type?: string): Promise<string | undefined> {
  try {
    const read = await readForUpload(uri);
    const body = read.body;
    const contentType = type || read.contentType;
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const path = `${fid}/${name}.${ext}`;
    const { error } = await supabase!.storage.from('family-media').upload(path, body, { contentType, upsert: true });
    if (error) throw error;
    return path;
  } catch {
    return undefined; // try again on the next sync
  }
}

const signed = new Map<string, { url: string; expires: number }>();

/** A short-lived URL for a family photo or file stored in the cloud. */
export async function mediaUrl(path: string): Promise<string | undefined> {
  if (!supabase) return undefined;
  const hit = signed.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage.from('family-media').createSignedUrl(path, 3600);
  if (!data?.signedUrl) return undefined;
  signed.set(path, { url: data.signedUrl, expires: Date.now() + 3500_000 });
  return data.signedUrl;
}

// ───────────────────────────── Account actions

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Cloud sync isn’t set up for this build.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(friendlyError(error));
}

/** Returns true when the account needs email confirmation before signing in. */
export async function signUp(email: string, password: string): Promise<boolean> {
  if (!supabase) throw new Error('Cloud sync isn’t set up for this build.');
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(friendlyError(error));
  return !data.session;
}

/** Sign out. `keepData: false` also clears the family from this device. */
export async function signOut(keepData: boolean) {
  stop();
  await push().catch(() => {});
  await supabase?.auth.signOut();
  account().reset();
  base = {};
  await AsyncStorage.removeItem(BASE_KEY);
  if (!keepData) {
    useStore.getState().resetAll();
    useStudio.getState().reset();
  }
  const { refreshMarketplace } = await import('./marketApi');
  await refreshMarketplace();
}

/** Leave the family in the cloud (deleting it if you're the last member) and sign out. */
export async function leaveFamily() {
  if (!supabase) return;
  const { error } = await supabase.rpc('leave_family');
  if (error) throw new Error(friendlyError(error));
  await signOut(false);
}
