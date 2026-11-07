import { describe, expect, it } from 'vitest';

import { deepEqual, mergeWorkspace } from '../sync';

const task = (id: string, p: Record<string, unknown> = {}) => ({ id, title: id, status: 'todo', start: '09:00', ...p });

describe('deepEqual', () => {
  it('compares structurally and ignores undefined fields', () => {
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, x: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: null }, { a: 0 })).toBe(false);
  });
});

describe('mergeWorkspace', () => {
  it('keeps both sides’ field edits to the same task', () => {
    const base = { tasks: [task('t1')] };
    const local = { tasks: [task('t1', { start: '10:00' })] }; // parent moved it
    const remote = { tasks: [task('t1', { status: 'done' })] }; // kid finished it
    expect(mergeWorkspace(base, local, remote).tasks).toEqual([task('t1', { start: '10:00', status: 'done' })]);
  });

  it('adds records from both sides and keeps deletions', () => {
    const base = { tasks: [task('a'), task('b'), task('c')] };
    const local = { tasks: [task('a'), task('c'), task('local-new')] }; // deleted b
    const remote = { tasks: [task('remote-new'), task('a'), task('b'), task('c')] };
    expect(mergeWorkspace(base, local, remote).tasks.map((t) => t.id)).toEqual(['remote-new', 'a', 'c', 'local-new']);
  });

  it('keeps a record deleted on one side but edited on the other', () => {
    const base = { tasks: [task('a')] };
    expect(mergeWorkspace(base, { tasks: [] as ReturnType<typeof task>[] }, { tasks: [task('a', { status: 'done' })] }).tasks).toEqual([task('a', { status: 'done' })]);
    expect(mergeWorkspace(base, { tasks: [task('a', { title: 'x' })] }, { tasks: [] as ReturnType<typeof task>[] }).tasks).toEqual([task('a', { title: 'x' })]);
    expect(mergeWorkspace(base, { tasks: [] as ReturnType<typeof task>[] }, { tasks: [task('a')] }).tasks).toEqual([]);
  });

  it('merges objects per field and prefers this device on a true conflict', () => {
    const base = { family: { familyName: 'Millers', parentPin: '1234', zip: '80202' }, esaAnnualAward: 0 };
    const local = { family: { familyName: 'The Miller Crew', parentPin: '1234', zip: '80202' }, esaAnnualAward: 7000 };
    const remote = { family: { familyName: 'Miller Family', parentPin: '9999', zip: '80202' }, esaAnnualAward: 0 };
    expect(mergeWorkspace(base, local, remote)).toEqual({ family: { familyName: 'The Miller Crew', parentPin: '9999', zip: '80202' }, esaAnnualAward: 7000 });
  });

  it('takes remote wholesale when nothing changed locally, and vice versa', () => {
    const base = { children: [{ id: 'k', name: 'Leo' }] };
    const remote = { children: [{ id: 'k', name: 'Leo' }, { id: 'm', name: 'Maya' }] };
    expect(mergeWorkspace(base, base, remote)).toEqual(remote);
    expect(mergeWorkspace(base, remote, base)).toEqual(remote);
  });

  it('merges with an empty base (first sync of two devices) as a union', () => {
    const merged = mergeWorkspace({}, { tasks: [task('a')] }, { tasks: [task('b')] });
    expect(merged.tasks.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});
