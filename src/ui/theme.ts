import { Platform, useColorScheme } from 'react-native';

import type { AttentionMode } from '@/lib/types';

import { palettes, type Palette } from './palette';

export * from './palette';

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
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

