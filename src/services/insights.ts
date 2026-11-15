import AsyncStorage from '@react-native-async-storage/async-storage';

import { aggregateReports, lessonReports, type LessonReport, type LessonStat } from '@/lib/insights';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';

import { supabase } from './cloud';

/**
 * Sends this family's anonymous lesson signals (see lib/insights.ts) for the
 * Marketplace plans it uses, and loads a creator's totals. Only rows that
 * changed since the last send go up; nothing goes up when the family turned
 * sharing off in Settings or isn't signed in.
 */

const SENT_KEY = 'freerange-insights-sent';
const DELAY = 8000;

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let sending = false;

const key = (r: LessonReport) => `${r.listingId}|${r.lessonId}`;
const ready = () => !!supabase && !!useAccount.getState().userId && !!useAccount.getState().familyId;

/** Call once at app start: sends shortly after lessons are finished or skipped. */
export function startInsights() {
  if (!supabase || started) return;
  started = true;
  useStore.subscribe((s, prev) => {
    if (s.tasks !== prev.tasks || s.curricula !== prev.curricula) schedule();
  });
  useAccount.subscribe((s, prev) => {
    if (s.familyId && s.familyId !== prev.familyId) schedule();
  });
  schedule();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flushInsights().catch(() => {});
  }, DELAY);
}

export async function flushInsights(): Promise<void> {
  const s = useStore.getState();
  if (!ready() || !s.family || s.family.insightsOptOut || sending) return;
  sending = true;
  try {
    const sent: Record<string, string> = JSON.parse((await AsyncStorage.getItem(SENT_KEY)) ?? '{}');
    // Plans this account made in Studio aren't reported (the server ignores a creator's own family too).
    const own = new Set(useStudio.getState().packages.map((p) => p.id));
    const changed = lessonReports(s.curricula.filter((c) => !c.packageId || !own.has(c.packageId)), s.tasks).filter((r) => sent[key(r)] !== JSON.stringify(r));
    for (let i = 0; i < changed.length; i += 500) {
      const batch = changed.slice(i, i + 500);
      const { error } = await supabase!.rpc('report_lesson_progress', { reports: batch });
      if (error) return;
      for (const r of batch) sent[key(r)] = JSON.stringify(r);
      await AsyncStorage.setItem(SENT_KEY, JSON.stringify(sent));
    }
  } finally {
    sending = false;
  }
}

/** Turning sharing off: delete what this family shared (the server also does when the setting syncs). */
export async function forgetInsights(): Promise<void> {
  await AsyncStorage.removeItem(SENT_KEY);
  if (ready()) await supabase!.rpc('forget_lesson_reports');
}

/** Turning it back on: send everything again. */
export async function resumeInsights(): Promise<void> {
  await AsyncStorage.removeItem(SENT_KEY);
  schedule();
}

export interface InsightsResult {
  stats: LessonStat[];
  /** Totals come from every family on the Marketplace (signed in), or only this device. */
  source: 'cloud' | 'device';
}

/** A creator's per-lesson totals for one listing. */
export async function lessonInsights(listingId: string): Promise<InsightsResult> {
  if (supabase && useAccount.getState().userId) {
    const { data, error } = await supabase.rpc('lesson_insights', { lid: listingId });
    if (error) throw new Error('Couldn’t load insights right now.');
    return {
      source: 'cloud',
      stats: ((data ?? []) as { lesson_id: string; families: number; done: number; skipped: number; tricky: number; avg_minutes: number | string | null; avg_planned: number | string | null; stopped_here: number; total_families: number }[]).map((r) => ({
        lessonId: r.lesson_id,
        families: r.families,
        done: r.done,
        skipped: r.skipped,
        tricky: r.tricky,
        avgMinutes: r.avg_minutes == null ? undefined : Number(r.avg_minutes),
        avgPlanned: r.avg_planned == null ? undefined : Number(r.avg_planned),
        stoppedHere: r.stopped_here,
        totalFamilies: r.total_families,
      })),
    };
  }
  // On this device only: the one family here, which never reaches the 5-family minimum.
  const s = useStore.getState();
  const now = new Date().toISOString();
  const rows = s.family?.insightsOptOut ? [] : lessonReports(s.curricula.filter((c) => c.listingId === listingId), s.tasks).map((r) => ({ ...r, family: 'this-device', updatedAt: now }));
  return { source: 'device', stats: aggregateReports(rows) };
}
