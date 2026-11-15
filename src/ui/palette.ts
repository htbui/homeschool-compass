// Colors only (no React Native imports), so the contrast tests can check every pair.
import type { AttentionMode } from '@/lib/types';

const light = {
  bg: '#FBF8F3',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EEE5',
  border: '#E6DFD3',
  text: '#1F2A26',
  textMuted: '#5F6964',
  /** Input placeholders: lighter than helper text, so an empty field never looks filled in. */
  placeholder: '#8C9490',
  primary: '#2F6B5E',
  primaryText: '#FFFFFF',
  primarySoft: '#DCEBE5',
  accent: '#E3A33B',
  accentSoft: '#FBEBCF',
  danger: '#B83F38',
  dangerSoft: '#F8DCDA',
  success: '#3D9970',
  successSoft: '#D9F0E3',
  parent: '#E0605A',
  parentSoft: '#FBE1DF',
  solo: '#3D9970',
  soloSoft: '#DDF1E6',
  group: '#4C7FD9',
  groupSoft: '#DDE7FA',
  // "Ink": text on the matching soft/tinted background (pills, badges, notes). ≥ 4.5:1, see contrast.test.ts.
  primaryInk: '#245A4E',
  accentInk: '#7A5208',
  dangerInk: '#A8322D',
  successInk: '#24714C',
  parentInk: '#A8322D',
  soloInk: '#24714C',
  groupInk: '#2C5FAF',
};

const dark: typeof light = {
  bg: '#121614',
  surface: '#1B211E',
  surfaceAlt: '#232B27',
  border: '#2F3934',
  text: '#ECF1EE',
  textMuted: '#9AA6A0',
  placeholder: '#6F7B75',
  primary: '#6FB8A5',
  primaryText: '#0D1F1A',
  primarySoft: '#21362F',
  accent: '#F0B95A',
  accentSoft: '#3A2F1A',
  danger: '#F0807A',
  dangerSoft: '#3D2322',
  success: '#6CC79B',
  successSoft: '#1E3428',
  parent: '#F0807A',
  parentSoft: '#3D2322',
  solo: '#6CC79B',
  soloSoft: '#1E3428',
  group: '#86A9F0',
  groupSoft: '#1F2A40',
  // On dark backgrounds the base hues already read well on their soft tints.
  primaryInk: '#6FB8A5',
  accentInk: '#F0B95A',
  dangerInk: '#F0807A',
  successInk: '#6CC79B',
  parentInk: '#F0807A',
  soloInk: '#6CC79B',
  groupInk: '#86A9F0',
};

export type Palette = typeof light;

export const palettes = { light, dark } as const;

/** `fg` for bars and dots, `ink` for text on `bg`. */
export function modeColors(c: Palette, mode: AttentionMode) {
  return mode === 'parent'
    ? { fg: c.parent, bg: c.parentSoft, ink: c.parentInk }
    : mode === 'solo'
      ? { fg: c.solo, bg: c.soloSoft, ink: c.soloInk }
      : { fg: c.group, bg: c.groupSoft, ink: c.groupInk };
}

export type Tone = 'neutral' | 'primary' | 'accent' | 'danger' | 'success';

/** Background and readable text for a tinted pill/badge/note. */
export function toneColors(c: Palette, tone: Tone): { bg: string; fg: string } {
  switch (tone) {
    case 'primary':
      return { bg: c.primarySoft, fg: c.primaryInk };
    case 'accent':
      return { bg: c.accentSoft, fg: c.accentInk };
    case 'danger':
      return { bg: c.dangerSoft, fg: c.dangerInk };
    case 'success':
      return { bg: c.successSoft, fg: c.successInk };
    default:
      return { bg: c.surfaceAlt, fg: c.textMuted };
  }
}
