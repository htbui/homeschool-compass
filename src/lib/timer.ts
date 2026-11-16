/**
 * A mission's focus timer, kept on the task itself so it keeps counting while a
 * kid checks their day, asks for help, or the app reloads. Only two facts are
 * stored: when it was last started (while running) and the time banked before.
 */

export type TimerMode = 'stopwatch' | 'pomodoro';

export interface TaskTimer {
  mode: TimerMode;
  /** ISO time the timer was last started; absent while paused. */
  startedAt?: string;
  /** Time counted before `startedAt` (all of it while paused). */
  pausedMs: number;
}

/** A Pomodoro focus block. */
export const POMODORO_MS = 25 * 60 * 1000;

export const newTimer = (mode: TimerMode = 'stopwatch'): TaskTimer => ({ mode, pausedMs: 0 });

const ms = (iso: string) => Date.parse(iso);

/** Milliseconds counted so far. A Pomodoro stops counting at 25 minutes. */
export function elapsedMs(timer: TaskTimer | undefined, now: number = Date.now()): number {
  if (!timer) return 0;
  const raw = timer.pausedMs + (timer.startedAt ? Math.max(0, now - ms(timer.startedAt)) : 0);
  return timer.mode === 'pomodoro' ? Math.min(raw, POMODORO_MS) : raw;
}

export const isRunning = (timer: TaskTimer | undefined) => !!timer?.startedAt;

/** The Pomodoro has run its full 25 minutes. */
export const pomodoroDone = (timer: TaskTimer | undefined, now: number = Date.now()) => timer?.mode === 'pomodoro' && elapsedMs(timer, now) >= POMODORO_MS;

export function startTimer(timer: TaskTimer | undefined, now: number = Date.now()): TaskTimer {
  const t = timer ?? newTimer();
  if (t.startedAt || pomodoroDone(t, now)) return t;
  return { ...t, startedAt: new Date(now).toISOString() };
}

export function pauseTimer(timer: TaskTimer | undefined, now: number = Date.now()): TaskTimer {
  const t = timer ?? newTimer();
  if (!t.startedAt) return t;
  return { mode: t.mode, pausedMs: elapsedMs(t, now) };
}

/** Switching between stopwatch and Pomodoro starts over. */
export const switchMode = (mode: TimerMode): TaskTimer => newTimer(mode);

/** What the big clock shows: time spent, or time left in a Pomodoro. */
export function clockText(timer: TaskTimer | undefined, now: number = Date.now()): string {
  const spent = elapsedMs(timer, now);
  const shown = Math.floor((timer?.mode === 'pomodoro' ? POMODORO_MS - spent : spent) / 1000);
  const mm = String(Math.floor(shown / 60)).padStart(2, '0');
  const ss = String(shown % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Whole minutes spent, for the hours records (undefined when the timer never ran). */
export function minutesSpent(timer: TaskTimer | undefined, now: number = Date.now()): number | undefined {
  const m = Math.round(elapsedMs(timer, now) / 60000);
  return m > 0 ? m : undefined;
}

/** Short badge for a mission card: "⏱ 12 min" (or "⏱ 0 min" just after starting); nothing if never started. */
export function timerBadge(timer: TaskTimer | undefined, now: number = Date.now()): string | undefined {
  if (!timer || (!timer.startedAt && timer.pausedMs === 0)) return undefined;
  const min = Math.floor(elapsedMs(timer, now) / 60000);
  return `${timer.startedAt ? '⏱' : '⏸'} ${min} min`;
}
