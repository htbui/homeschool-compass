/**
 * Comparing a form's draft with what's saved, to know whether closing it would lose edits.
 * Key order and `undefined` fields don't count as changes.
 */
export function draftKey(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
    }
    return v;
  });
}

export function sameDraft(a: unknown, b: unknown): boolean {
  return draftKey(a) === draftKey(b);
}
