import { Platform, useColorScheme } from 'react-native';

import type { AttentionMode } from '@/lib/types';

const light = {
  bg: '#FBF8F3',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EEE5',
  border: '#E6DFD3',
  text: '#1F2A26',
  textMuted: '#66706B',
  primary: '#2F6B5E',
  primaryText: '#FFFFFF',
  primarySoft: '#DCEBE5',
  accent: '#E3A33B',
  accentSoft: '#FBEBCF',
  danger: '#C8463F',
  dangerSoft: '#F8DCDA',
  success: '#3D9970',
  successSoft: '#D9F0E3',
  parent: '#E0605A',
  parentSoft: '#FBE1DF',
  solo: '#3D9970',
  soloSoft: '#DDF1E6',
  group: '#4C7FD9',
  groupSoft: '#DDE7FA',
};

const dark: typeof light = {
  bg: '#121614',
  surface: '#1B211E',
  surfaceAlt: '#232B27',
  border: '#2F3934',
  text: '#ECF1EE',
  textMuted: '#9AA6A0',
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
};

export type Palette = typeof light;

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const MAX_WIDTH = 1100;

export const fonts = {
  display: Platform.select({ ios: 'ui-rounded', web: "'SF Pro Rounded', ui-rounded, 'Nunito', system-ui, sans-serif", default: undefined }),
  body: Platform.select({ web: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", default: undefined }),
};

export const MODE_META: Record<AttentionMode, { label: string; short: string; emoji: string }> = {
  parent: { label: 'With parent (1-on-1)', short: 'With you', emoji: '🔴' },
  solo: { label: 'Independent', short: 'Solo', emoji: '🟢' },
  group: { label: 'Family together', short: 'Together', emoji: '🔵' },
};

export function modeColors(c: Palette, mode: AttentionMode) {
  return mode === 'parent' ? { fg: c.parent, bg: c.parentSoft } : mode === 'solo' ? { fg: c.solo, bg: c.soloSoft } : { fg: c.group, bg: c.groupSoft };
}
