import type { Subject } from './types';

export interface SubjectInfo {
  label: string;
  icon: string;
  core: boolean;
}

/**
 * Core vs non-core follows the common split used by hour-counting states
 * (e.g. Missouri's 600 core hours: reading/language arts, math, social studies, science).
 */
export const SUBJECTS: Record<Subject, SubjectInfo> = {
  math: { label: 'Math', icon: '🧮', core: true },
  reading: { label: 'Reading', icon: '📖', core: true },
  writing: { label: 'Writing', icon: '✏️', core: true },
  phonics: { label: 'Phonics', icon: '🔤', core: true },
  science: { label: 'Science', icon: '🔬', core: true },
  history: { label: 'History', icon: '🏛️', core: true },
  geography: { label: 'Geography', icon: '🗺️', core: true },
  civics: { label: 'Civics', icon: '⚖️', core: true },
  foreign_language: { label: 'Foreign Language', icon: '🌍', core: false },
  art: { label: 'Art', icon: '🎨', core: false },
  music: { label: 'Music', icon: '🎵', core: false },
  pe: { label: 'PE', icon: '🏃', core: false },
  health: { label: 'Health', icon: '🍎', core: false },
  life_skills: { label: 'Life Skills', icon: '🧺', core: false },
  bible: { label: 'Bible / Faith', icon: '🕊️', core: false },
  free_play: { label: 'Free Play', icon: '🧸', core: false },
  other: { label: 'Other', icon: '⭐', core: false },
};

export const SUBJECT_LIST = Object.keys(SUBJECTS) as Subject[];

export const subjectLabel = (s: Subject) => SUBJECTS[s].label;
export const subjectIcon = (s: Subject) => SUBJECTS[s].icon;
export const isCore = (s: Subject) => SUBJECTS[s].core;
