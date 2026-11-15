/**
 * Three-way merge for the family workspace.
 *
 * Every device keeps the last version it synced (`base`). When two devices
 * edit at once, the server rejects the second push and returns its copy
 * (`remote`); the device merges base → local and base → remote changes:
 *
 * - Lists of records (tasks, children, logs…) merge per record by `id`, and
 *   per field inside a record, so a kid finishing a task on the tablet and a
 *   parent moving its start time on the phone both survive.
 * - A record deleted on one side and untouched on the other stays deleted;
 *   deleted on one side but edited on the other is kept (edits win).
 * - Single objects (family profile, NOI draft) merge per field; plain values
 *   take whichever side changed, preferring this device when both did.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
type Entity = Obj & { id: string };

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as Obj)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Obj)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Obj)[k], (b as Obj)[k]));
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isEntityList = (v: unknown): v is Entity[] => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');

/** Merge a single value: take whichever side changed; local wins a tie. */
function mergeValue(base: Json | undefined, local: Json | undefined, remote: Json | undefined): Json | undefined {
  if (deepEqual(local, base)) return remote;
  if (deepEqual(remote, base)) return local;
  if (isObj(local) && isObj(remote)) return mergeObject(isObj(base) ? base : {}, local, remote);
  if ((isEntityList(local) || local === undefined) && (isEntityList(remote) || remote === undefined) && (local || remote)) {
    return mergeEntities(isEntityList(base) ? base : [], local ?? [], remote ?? []);
  }
  return local;
}

function mergeObject(base: Obj, local: Obj, remote: Obj): Obj {
  const out: Obj = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)])) {
    const v = mergeValue(base[k], local[k], remote[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeEntities(base: Entity[], local: Entity[], remote: Entity[]): Entity[] {
  const b = new Map(base.map((e) => [e.id, e]));
  const l = new Map(local.map((e) => [e.id, e]));
  const r = new Map(remote.map((e) => [e.id, e]));
  const keep = new Map<string, Entity>();
  for (const id of new Set([...l.keys(), ...r.keys(), ...b.keys()])) {
    const be = b.get(id);
    const le = l.get(id);
    const re = r.get(id);
    if (!le && !re) continue; // deleted on both sides (or never existed)
    if (!be) {
      // Added on one or both sides.
      keep.set(id, le && re ? mergeObject({}, le, re) as Entity : (le ?? re)!);
      continue;
    }
    if (!le) {
      // Deleted locally: stays deleted unless the remote edited it.
      if (re && !deepEqual(re, be)) keep.set(id, re);
      continue;
    }
    if (!re) {
      if (!deepEqual(le, be)) keep.set(id, le);
      continue;
    }
    keep.set(id, mergeObject(be, le, re) as Entity);
  }
  // Local order first (it's what this device shows), then records new from remote,
  // placed where the remote had them relative to the start.
  const out: Entity[] = [];
  const placed = new Set<string>();
  const remoteOnlyFront = remote.filter((e) => !l.has(e.id) && !b.has(e.id) && keep.has(e.id));
  for (const e of remoteOnlyFront) {
    out.push(keep.get(e.id)!);
    placed.add(e.id);
  }
  for (const e of local) {
    if (keep.has(e.id) && !placed.has(e.id)) {
      out.push(keep.get(e.id)!);
      placed.add(e.id);
    }
  }
  for (const e of remote) {
    if (keep.has(e.id) && !placed.has(e.id)) {
      out.push(keep.get(e.id)!);
      placed.add(e.id);
    }
  }
  return out;
}

/** Where a task happens: these move together, never field by field. */
const WHEN = ['date', 'start', 'bumpedFrom', 'groupKey'] as const;

/**
 * A task finished on one device while another device moved it to another day
 * (a bump) keeps the day and time it was done on: per-field merging would
 * otherwise file finished work, and its hours, under the day it was bumped to.
 */
function finishedStayPut(tasks: Json[], local: unknown, remote: unknown): Json[] {
  const byId = (v: unknown) => new Map((isEntityList(v) ? v : []).map((e) => [e.id, e]));
  const l = byId(local);
  const r = byId(remote);
  return tasks.map((t) => {
    if (!isObj(t) || t.status !== 'done' || typeof t.id !== 'string') return t;
    const le = l.get(t.id);
    const re = r.get(t.id);
    const finisher = le?.status === 'done' && re?.status !== 'done' ? le : re?.status === 'done' && le?.status !== 'done' ? re : undefined;
    // A new time on the same day is fine; only moving it to another day is undone.
    if (!finisher || finisher.date === t.date) return t;
    const out: Obj = { ...t };
    for (const k of WHEN) {
      if (finisher[k] === undefined) delete out[k];
      else out[k] = finisher[k];
    }
    return out;
  });
}

/** Merge whole workspace documents (top-level keys are collections or values). */
export function mergeWorkspace<T extends Record<string, unknown>>(base: Partial<T>, local: T, remote: Partial<T>): T {
  const out = mergeObject(base as Obj, local as unknown as Obj, remote as Obj);
  if (Array.isArray(out.tasks)) out.tasks = finishedStayPut(out.tasks, (local as Obj).tasks, (remote as Obj).tasks);
  return out as unknown as T;
}

/** True when `local` has changes that `base` doesn't. */
export const hasLocalChanges = (base: unknown, local: unknown) => !deepEqual(base, local);
