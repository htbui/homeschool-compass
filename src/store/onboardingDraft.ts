import { create } from 'zustand';

import type { Child, QuizResult } from '@/lib/types';

/** In-memory state while a family walks through onboarding. */
interface Draft {
  familyName: string;
  parentName: string;
  parentPin: string;
  zip: string;
  stateCode: string;
  children: Child[];
  answers: Record<string, number>;
  result?: QuizResult;
  values: string[];
  interests: string[];
  set: (patch: Partial<Omit<Draft, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const blank = { familyName: '', parentName: '', parentPin: '', zip: '', stateCode: '', children: [], answers: {}, result: undefined, values: [], interests: [] };

export const useDraft = create<Draft>()((set) => ({
  ...blank,
  set: (patch) => set(patch),
  reset: () => set(blank),
}));
