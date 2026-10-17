import type { Child, Subject } from './types';
import { ageOn } from './dates';

/**
 * Unit Study Generator (offline template version). Given a theme and the kids'
 * ages, produce a 2-week plan where everyone shares the theme but each child
 * works at their own depth. A future AI service can replace `ACTIVITY_BANK`
 * with generated content behind the same shape.
 */

export type Tier = 'early' | 'middle' | 'upper';

export const tierForAge = (age: number): Tier => (age <= 7 ? 'early' : age <= 11 ? 'middle' : 'upper');

export const TIER_LABEL: Record<Tier, string> = { early: 'Ages 4–7', middle: 'Ages 8–11', upper: 'Ages 12+' };

interface ActivityTemplate {
  subject: Subject;
  early: string;
  middle: string;
  upper: string;
}

const ACTIVITY_BANK: ActivityTemplate[] = [
  { subject: 'reading', early: 'Read-aloud picture books about {theme}; draw a favorite page', middle: 'Read an illustrated nonfiction book on {theme}; narrate 3 facts', upper: 'Read a primary source or long-form article on {theme}; annotate key claims' },
  { subject: 'science', early: 'Hands-on sensory bin or simple experiment related to {theme}', middle: 'Design an experiment about {theme}; record a hypothesis and results', upper: 'Research the science behind {theme}; write a lab report with data' },
  { subject: 'history', early: 'Make a picture timeline of {theme}', middle: 'Build a 10-event timeline of {theme} with dates', upper: 'Compare two perspectives on {theme} in a one-page analysis' },
  { subject: 'geography', early: 'Find {theme} places on a globe with stickers', middle: 'Draw and label a map related to {theme}', upper: 'Analyze how geography shaped {theme}' },
  { subject: 'writing', early: 'Dictate a short story about {theme} to a parent', middle: 'Write a one-page report on {theme}', upper: 'Write a persuasive essay taking a position on {theme}' },
  { subject: 'math', early: 'Count and sort {theme} objects', middle: 'Word problems using {theme} data', upper: 'Gather real {theme} data and chart it in a spreadsheet' },
  { subject: 'art', early: 'Craft project inspired by {theme}', middle: 'Sketch {theme} from observation', upper: 'Create a detailed infographic or illustration about {theme}' },
];

export interface UnitDay {
  day: number;
  focus: Subject;
  together: string;
  perChild: { childId: string; tier: Tier; activity: string }[];
}

export interface UnitPlan {
  theme: string;
  days: UnitDay[];
}

const fill = (s: string, theme: string) => s.replace(/\{theme\}/g, theme);

export function generateUnitStudy(theme: string, children: Child[], days = 10): UnitPlan {
  const t = theme.trim() || 'Our World';
  const plan: UnitDay[] = [];
  for (let i = 0; i < days; i++) {
    const a = ACTIVITY_BANK[i % ACTIVITY_BANK.length];
    plan.push({
      day: i + 1,
      focus: a.subject,
      together: i === 0 ? `Kickoff: family read-aloud and KWL chart (Know / Want to know / Learned) on ${t}` : i === days - 1 ? `Showcase: each child presents their ${t} project to the family` : `Family discussion: what surprised you about ${t} today?`,
      perChild: children.map((c) => {
        const tier = tierForAge(ageOn(c.birthdate));
        return { childId: c.id, tier, activity: fill(a[tier], t) };
      }),
    });
  }
  return { theme: t, days: plan };
}
