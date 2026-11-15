import { describe, expect, it } from 'vitest';

import { draftKey, sameDraft } from '@/lib/draft';

describe('sameDraft (unsaved-changes guard)', () => {
  const lesson = { id: 'l1', title: 'Halves', steps: ['Fold', 'Shade'], questions: [], notes: undefined, versions: { easier: { steps: ['Fold'], questions: [] } } };

  it('treats an untouched draft as unchanged', () => {
    expect(sameDraft(lesson, structuredClone(lesson))).toBe(true);
  });

  it('ignores key order and undefined fields', () => {
    const reordered = { versions: { easier: { questions: [], steps: ['Fold'] } }, questions: [], steps: ['Fold', 'Shade'], title: 'Halves', id: 'l1' };
    expect(sameDraft(lesson, reordered)).toBe(true);
    expect(draftKey({ a: 1, b: undefined })).toBe(draftKey({ a: 1 }));
  });

  it('notices any real edit', () => {
    expect(sameDraft(lesson, { ...lesson, title: 'Halves!' })).toBe(false);
    expect(sameDraft(lesson, { ...lesson, steps: ['Shade', 'Fold'] })).toBe(false);
    expect(sameDraft(lesson, { ...lesson, notes: 'New note' })).toBe(false);
    expect(sameDraft(lesson, { ...lesson, versions: { easier: { steps: ['Fold', 'Cut'], questions: [] } } })).toBe(false);
  });
});
