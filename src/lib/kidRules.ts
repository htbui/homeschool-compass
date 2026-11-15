import type { FamilyProfile, Task } from './types';

/**
 * What a kid may do on their own in kid mode. Anything that needs a grown-up
 * (1-on-1 time, family sessions, setting up the printer) stays with the parent.
 */

/** Kids may start upcoming missions early unless the parent turned it off. */
export const kidsMayStartEarly = (family?: Pick<FamilyProfile, 'kidsStartEarly'>) => family?.kidsStartEarly !== false;

/**
 * Only an unstarted solo mission on a later day can be pulled into today: moving a
 * 1-on-1 or a family session would break the parent's staggered plan.
 */
export function canStartEarly(task: Pick<Task, 'mode' | 'status' | 'date'>, today: string, family?: Pick<FamilyProfile, 'kidsStartEarly'>): boolean {
  return kidsMayStartEarly(family) && task.mode === 'solo' && task.date > today && task.status === 'todo';
}

/** Kids may print their own pages unless the parent turned it off. */
export const kidsMayPrint = (family?: Pick<FamilyProfile, 'kidsCanPrint'>) => family?.kidsCanPrint !== false;

/** Why an upcoming mission can't be started early, in words a kid understands. */
export function startEarlyBlocked(task: Pick<Task, 'mode'>, family?: Pick<FamilyProfile, 'kidsStartEarly' | 'parentName'>): string | undefined {
  const grownUp = family?.parentName?.split(' ')[0] || 'your grown-up';
  if (!kidsMayStartEarly(family)) return `You can read it and get ready. ${grownUp} will start it with you on the day.`;
  if (task.mode === 'parent') return `This one is with ${grownUp}, so you'll do it together on the day.`;
  if (task.mode === 'group') return 'This one is with the family, so everyone does it together on the day.';
  return undefined;
}

/** What a kid sees (or hears) after asking for help: neutral, no guesses about what the grown-up is doing. */
export const helpSentText = (grownUp: string) => `${grownUp} got your message 👍`;

export type MissionStatus = 'done' | 'in_progress' | 'up_next' | 'start_early' | 'not_finished' | 'later';

/** Where a mission stands on the kid's day list. */
export function missionStatus(task: Pick<Task, 'status' | 'mode' | 'date'>, ctx: { current: boolean; isToday: boolean; isFuture: boolean; today: string; family?: Pick<FamilyProfile, 'kidsStartEarly'> }): MissionStatus {
  if (task.status === 'done') return 'done';
  if (task.status === 'in_progress') return 'in_progress';
  if (ctx.current) return 'up_next';
  if (ctx.isFuture) return canStartEarly(task, ctx.today, ctx.family) ? 'start_early' : 'later';
  if (!ctx.isToday) return 'not_finished';
  return 'later';
}

/** Status words with an icon, so it never rests on colour alone. */
export const MISSION_STATUS_TEXT: Record<MissionStatus, string> = {
  done: '✓ Done',
  in_progress: '▶ In progress',
  up_next: '★ Up next',
  start_early: '🚀 Start early?',
  not_finished: '○ Not finished',
  later: '',
};

/** What a screen reader says for a mission card: "Mission 1, Leaf rubbing journal, 11:50 AM, up next". */
export function missionLabel(n: number, title: string, time: string, status: MissionStatus, extra?: string): string {
  const words = MISSION_STATUS_TEXT[status].replace(/^[^A-Za-z]+/, '').toLowerCase();
  return [`Mission ${n}`, title, time, words, extra].filter(Boolean).join(', ');
}
