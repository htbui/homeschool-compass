import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { doneFor, setDoneFor, withLessons } from '@/lib/curriculum';
import { fromMinutes, schoolYearLabel, todayKey } from '@/lib/dates';
import { uid } from '@/lib/id';
import { autoStagger, gentleBump, tasksForDate } from '@/lib/schedule';
import type {
  Child,
  CommunityEvent,
  CoOp,
  Curriculum,
  DateKey,
  Evidence,
  Expense,
  FamilyProfile,
  HelpRequest,
  HoursLog,
  ID,
  LessonMaterial,
  MoodCheckIn,
  NoiDraft,
  RhythmBlock,
  Task,
} from '@/lib/types';
import { planFromListing, type Listing, type PackageContent, type PlanOptions, type Purchase, type Review } from '@/lib/market';

import { seedCommunity } from './seed';

export type AppMode = { kind: 'parent' } | { kind: 'kid'; childId: ID };

interface Data {
  family?: FamilyProfile;
  children: Child[];
  blocks: RhythmBlock[];
  tasks: Task[];
  help: HelpRequest[];
  moods: MoodCheckIn[];
  evidence: Evidence[];
  hoursLogs: HoursLog[];
  curricula: Curriculum[];
  expenses: Expense[];
  esaAnnualAward: number;
  noi: NoiDraft;
  coops: CoOp[];
  events: CommunityEvent[];
  /** Marketplace: what this family bought, listed, and reviewed. */
  purchases: Purchase[];
  myListings: Listing[];
  myReviews: Review[];
  helpfulVotes: ID[];
  mode: AppMode;
}

interface Actions {
  completeOnboarding: (p: { family: FamilyProfile; children: Child[]; blocks?: RhythmBlock[]; curricula?: Curriculum[]; tasks?: Task[] }) => void;
  updateFamily: (patch: Partial<FamilyProfile>) => void;
  upsertChild: (c: Child) => void;
  removeChild: (id: ID) => void;

  upsertBlock: (b: RhythmBlock) => void;
  removeBlock: (id: ID) => void;

  ensureTasks: (date: DateKey) => void;
  addTask: (t: Omit<Task, 'id' | 'status' | 'steps'> & { steps?: string[] }) => void;
  updateTask: (id: ID, patch: Partial<Task>) => void;
  removeTask: (id: ID) => void;
  toggleStep: (taskId: ID, stepId: ID) => void;
  startTask: (id: ID) => void;
  completeTask: (id: ID, p?: { minutesSpent?: number; selfAssessment?: 1 | 2 | 3; reflection?: string }) => void;
  reopenTask: (id: ID) => void;
  /** A kid working ahead: move an upcoming task to today so its time counts today. */
  startEarly: (id: ID) => void;
  staggerDay: (date: DateKey) => number;
  bumpDay: (date: DateKey, target: DateKey, opts?: { fromTime?: string; childId?: ID }) => number;

  requestHelp: (childId: ID, taskId?: ID, note?: string) => void;
  resolveHelp: (id: ID) => void;
  setMood: (m: MoodCheckIn) => void;

  addEvidence: (e: Omit<Evidence, 'id'>) => void;
  removeEvidence: (id: ID) => void;
  addHoursLog: (l: Omit<HoursLog, 'id'>) => void;
  removeHoursLog: (id: ID) => void;

  upsertCurriculum: (c: Curriculum) => void;
  addMaterial: (curriculumId: ID, m: LessonMaterial) => void;
  updateMaterial: (curriculumId: ID, id: ID, patch: Partial<LessonMaterial>) => void;
  removeMaterial: (curriculumId: ID, id: ID) => void;
  removeCurriculum: (id: ID) => void;
  /** Nudge one student's lesson count (or every student's, without a childId). */
  adjustLessons: (id: ID, delta: number, childId?: ID) => void;

  upsertExpense: (e: Expense) => void;
  removeExpense: (id: ID) => void;
  setEsaAward: (n: number) => void;

  updateNoi: (patch: Partial<NoiDraft>) => void;

  toggleCoop: (id: ID) => void;
  addCoop: (c: Omit<CoOp, 'id' | 'joined' | 'members'>) => void;
  toggleEvent: (id: ID, field: 'going' | 'carpool') => void;
  addEvent: (e: Omit<CommunityEvent, 'id' | 'rsvps' | 'going' | 'carpool'>) => void;

  recordPurchase: (p: Purchase) => void;
  /** `content` is the full lesson plan for Studio packages. */
  addListingToPlan: (listing: Listing, opts: PlanOptions, purchaseId?: ID, content?: PackageContent) => { curriculum: Curriculum; blocks: RhythmBlock[] };
  upsertMyListing: (l: Listing) => void;
  removeMyListing: (id: ID) => void;
  upsertMyReview: (r: Review) => void;
  removeMyReview: (id: ID) => void;
  toggleHelpful: (reviewId: ID) => void;

  setMode: (m: AppMode) => void;
  importData: (json: string) => void;
  exportData: () => string;
  resetAll: () => void;
}

export type Store = Data & Actions & { hydrated: boolean };

const emptyNoi = (): NoiDraft => ({
  schoolYear: schoolYearLabel(),
  parentName: '',
  address: '',
  district: '',
  superintendent: '',
  signature: '',
  checklist: {},
});

const initialData = (): Data => ({
  family: undefined,
  children: [],
  blocks: [],
  tasks: [],
  help: [],
  moods: [],
  evidence: [],
  hoursLogs: [],
  curricula: [],
  expenses: [],
  esaAnnualAward: 0,
  noi: emptyNoi(),
  ...seedCommunity(),
  purchases: [],
  myListings: [],
  myReviews: [],
  helpfulVotes: [],
  mode: { kind: 'parent' },
});

/** Sparks awarded per completed task, more for a full self-assessment. */
const SPARKS_PER_TASK = 10;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialData(),
      hydrated: false,

      completeOnboarding: ({ family, children, blocks = [], curricula = [], tasks = [] }) =>
        set({ family, children, blocks, curricula, tasks, noi: { ...emptyNoi(), parentName: family.parentName, signature: '' }, mode: { kind: 'parent' } }),
      updateFamily: (patch) => set((s) => ({ family: s.family ? { ...s.family, ...patch } : s.family })),
      upsertChild: (c) => set((s) => ({ children: s.children.some((x) => x.id === c.id) ? s.children.map((x) => (x.id === c.id ? c : x)) : [...s.children, c] })),
      removeChild: (id) =>
        set((s) => ({
          children: s.children.filter((c) => c.id !== id),
          tasks: s.tasks.filter((t) => t.childId !== id),
          blocks: s.blocks.map((b) => ({ ...b, childIds: b.childIds.filter((c) => c !== id) })).filter((b) => b.childIds.length > 0),
        })),

      upsertBlock: (b) =>
        set((s) => {
          const exists = s.blocks.some((x) => x.id === b.id);
          // Re-plan today+future untouched tasks from this block so edits take effect.
          const today = todayKey();
          const tasks = exists ? s.tasks.filter((t) => !(t.blockId === b.id && t.date >= today && t.status === 'todo' && !t.bumpedFrom)) : s.tasks;
          return { blocks: exists ? s.blocks.map((x) => (x.id === b.id ? b : x)) : [...s.blocks, b], tasks };
        }),
      removeBlock: (id) =>
        set((s) => ({
          blocks: s.blocks.filter((b) => b.id !== id),
          tasks: s.tasks.filter((t) => !(t.blockId === id && t.date >= todayKey() && t.status === 'todo')),
        })),

      ensureTasks: (date) => {
        const s = get();
        const fresh = tasksForDate(s.blocks, date, s.tasks.filter((t) => t.date === date || t.bumpedFrom === date));
        const all = fresh.length ? [...s.tasks, ...fresh] : s.tasks;
        // Lesson-by-lesson curricula: show the lesson that's actually next.
        const next = withLessons(all, s.curricula, date);
        if (next !== s.tasks) set({ tasks: next });
      },
      addTask: ({ steps = [], ...t }) =>
        set((s) => ({ tasks: [...s.tasks, { ...t, id: uid('t'), status: 'todo', steps: steps.map((label) => ({ id: uid('s'), label, done: false })) }] })),
      updateTask: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      toggleStep: (taskId, stepId) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, status: t.status === 'todo' ? 'in_progress' : t.status, steps: t.steps.map((st) => (st.id === stepId ? { ...st, done: !st.done } : st)) } : t,
          ),
        })),
      startTask: (id) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id && t.status === 'todo' ? { ...t, status: 'in_progress' } : t)) })),
      completeTask: (id, p = {}) =>
        set((s) => {
          const task = s.tasks.find((t) => t.id === id);
          if (!task || task.status === 'done') return {};
          const bonus = p.reflection ? 5 : 0;
          const cur = task.curriculumId ? s.curricula.find((c) => c.id === task.curriculumId) : undefined;
          return {
            tasks: s.tasks.map((t) =>
              t.id === id ? { ...t, ...p, status: 'done', completedAt: new Date().toISOString(), steps: t.steps.map((st) => ({ ...st, done: true })), lessonNo: cur ? Math.min(cur.totalLessons, doneFor(cur, t.childId) + 1) : undefined } : t,
            ),
            children: s.children.map((c) => (c.id === task.childId ? { ...c, sparks: c.sparks + SPARKS_PER_TASK + bonus } : c)),
            curricula: cur ? s.curricula.map((c) => (c.id === cur.id ? setDoneFor(c, task.childId, doneFor(c, task.childId) + 1) : c)) : s.curricula,
            help: s.help.map((h) => (h.taskId === id && !h.resolvedAt ? { ...h, resolvedAt: new Date().toISOString() } : h)),
          };
        }),
      reopenTask: (id) =>
        set((s) => {
          const task = s.tasks.find((t) => t.id === id);
          if (!task || task.status !== 'done') return {};
          return {
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: 'in_progress', completedAt: undefined, lessonNo: undefined } : t)),
            children: s.children.map((c) => (c.id === task.childId ? { ...c, sparks: Math.max(0, c.sparks - SPARKS_PER_TASK) } : c)),
            curricula: task.curriculumId ? s.curricula.map((c) => (c.id === task.curriculumId ? setDoneFor(c, task.childId, doneFor(c, task.childId) - 1) : c)) : s.curricula,
          };
        }),
      startEarly: (id) =>
        set((s) => {
          const today = todayKey();
          const task = s.tasks.find((t) => t.id === id);
          if (!task || task.date <= today) return {};
          const now = new Date();
          const start = fromMinutes(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5);
          return {
            tasks: s.tasks.map((t) =>
              t.id === id
                ? {
                    ...t,
                    date: today,
                    start,
                    status: 'in_progress',
                    // Remember the planned day so the rhythm doesn't recreate it there.
                    bumpedFrom: t.bumpedFrom ?? t.date,
                    // Done solo ahead of the family, so it's no longer part of the group session.
                    groupKey: t.groupKey ? `${t.groupKey}>early` : undefined,
                  }
                : t,
            ),
          };
        }),
      staggerDay: (date) => {
        const s = get();
        const day = s.tasks.filter((t) => t.date === date);
        const { tasks, moves } = autoStagger(day);
        const byId = new Map(tasks.map((t) => [t.id, t]));
        set({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) });
        return moves.length;
      },
      bumpDay: (date, target, opts) => {
        // Make sure the target day's rhythm exists first so bumped work lands after it.
        get().ensureTasks(target);
        const { tasks, moved } = gentleBump(get().tasks, date, target, opts);
        set({ tasks });
        return moved;
      },

      requestHelp: (childId, taskId, note) =>
        set((s) =>
          s.help.some((h) => h.childId === childId && !h.resolvedAt)
            ? {}
            : { help: [...s.help, { id: uid('h'), childId, taskId, note, createdAt: new Date().toISOString() }] },
        ),
      resolveHelp: (id) => set((s) => ({ help: s.help.map((h) => (h.id === id ? { ...h, resolvedAt: new Date().toISOString() } : h)) })),
      setMood: (m) => set((s) => ({ moods: [...s.moods.filter((x) => !(x.childId === m.childId && x.date === m.date)), m] })),

      addEvidence: (e) => set((s) => ({ evidence: [{ ...e, id: uid('ev') }, ...s.evidence] })),
      removeEvidence: (id) => set((s) => ({ evidence: s.evidence.filter((e) => e.id !== id) })),
      addHoursLog: (l) => set((s) => ({ hoursLogs: [{ ...l, id: uid('l') }, ...s.hoursLogs] })),
      removeHoursLog: (id) => set((s) => ({ hoursLogs: s.hoursLogs.filter((l) => l.id !== id) })),

      upsertCurriculum: (c) => set((s) => ({ curricula: s.curricula.some((x) => x.id === c.id) ? s.curricula.map((x) => (x.id === c.id ? c : x)) : [...s.curricula, c] })),
      addMaterial: (cid, m) => set((s) => ({ curricula: s.curricula.map((c) => (c.id === cid ? { ...c, materials: [...(c.materials ?? []), m] } : c)) })),
      updateMaterial: (cid, id, patch) =>
        set((s) => ({ curricula: s.curricula.map((c) => (c.id === cid ? { ...c, materials: c.materials?.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : c)) })),
      removeMaterial: (cid, id) => set((s) => ({ curricula: s.curricula.map((c) => (c.id === cid ? { ...c, materials: c.materials?.filter((m) => m.id !== id) } : c)) })),
      removeCurriculum: (id) => set((s) => ({ curricula: s.curricula.filter((c) => c.id !== id) })),
      adjustLessons: (id, delta, childId) =>
        set((s) => ({
          curricula: s.curricula.map((c) => (c.id === id ? (childId ? [childId] : c.childIds).reduce((k, kid) => setDoneFor(k, kid, doneFor(k, kid) + delta), c) : c)),
        })),

      upsertExpense: (e) => set((s) => ({ expenses: s.expenses.some((x) => x.id === e.id) ? s.expenses.map((x) => (x.id === e.id ? e : x)) : [e, ...s.expenses] })),
      removeExpense: (id) => set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),
      setEsaAward: (n) => set({ esaAnnualAward: n }),

      updateNoi: (patch) => set((s) => ({ noi: { ...s.noi, ...patch } })),

      toggleCoop: (id) => set((s) => ({ coops: s.coops.map((c) => (c.id === id ? { ...c, joined: !c.joined } : c)) })),
      addCoop: (c) => set((s) => ({ coops: [{ ...c, id: uid('co'), joined: true, members: [s.family?.parentName ?? 'You'] }, ...s.coops] })),
      toggleEvent: (id, field) =>
        set((s) => ({
          events: s.events.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e, [field]: !e[field] };
            if (field === 'going') next.rsvps = Math.max(0, e.rsvps + (next.going ? 1 : -1));
            if (field === 'going' && !next.going) next.carpool = false;
            return next;
          }),
        })),
      addEvent: (e) => set((s) => ({ events: [...s.events, { ...e, id: uid('e'), rsvps: 1, going: true, carpool: false }] })),

      recordPurchase: (p) =>
        set((s) => {
          // Paid purchases land in the expense tracker for ESA / tax records.
          const expense: Expense | undefined =
            p.price > 0
              ? { id: uid('x'), date: p.purchasedAt.slice(0, 10), vendor: p.seller, description: p.title, amount: p.price, category: 'curriculum', fundingSource: p.fundingSource, approvedVendor: p.esaEligible }
              : undefined;
          return { purchases: [p, ...s.purchases.filter((x) => x.id !== p.id)], expenses: expense ? [expense, ...s.expenses] : s.expenses };
        }),
      addListingToPlan: (listing, opts, purchaseId, content) => {
        const { curriculum, blocks } = planFromListing(listing, opts, content);
        set((s) => ({
          curricula: [...s.curricula, curriculum],
          blocks: [...s.blocks, ...blocks],
          purchases: s.purchases.map((p) => (p.id === purchaseId || (!purchaseId && p.listingId === listing.id) ? { ...p, curriculumId: curriculum.id } : p)),
        }));
        return { curriculum, blocks };
      },
      upsertMyListing: (l) => set((s) => ({ myListings: [{ ...l, mine: true }, ...s.myListings.filter((x) => x.id !== l.id)] })),
      removeMyListing: (id) => set((s) => ({ myListings: s.myListings.filter((x) => x.id !== id) })),
      upsertMyReview: (r) => set((s) => ({ myReviews: [{ ...r, mine: true }, ...s.myReviews.filter((x) => x.id !== r.id && x.listingId !== r.listingId)] })),
      removeMyReview: (id) => set((s) => ({ myReviews: s.myReviews.filter((x) => x.id !== id) })),
      toggleHelpful: (reviewId) => set((s) => ({ helpfulVotes: s.helpfulVotes.includes(reviewId) ? s.helpfulVotes.filter((x) => x !== reviewId) : [...s.helpfulVotes, reviewId] })),

      setMode: (mode) => set({ mode }),
      exportData: () => {
        const { hydrated: _h, ...rest } = get();
        const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function'));
        return JSON.stringify({ app: 'kinship', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
      },
      importData: (json) => {
        const parsed = JSON.parse(json);
        if (parsed?.app !== 'kinship' || !parsed.data) throw new Error('Not a Kinship backup file');
        set({ ...initialData(), ...parsed.data, mode: { kind: 'parent' } });
      },
      resetAll: () => set({ ...initialData() }),
    }),
    {
      name: 'kinship-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
    },
  ),
);

/** Open help requests, oldest first. */
export const selectOpenHelp = (s: Store) => s.help.filter((h) => !h.resolvedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
