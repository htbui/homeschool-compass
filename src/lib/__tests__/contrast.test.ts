import { describe, expect, it } from 'vitest';

import { AA_TEXT, contrastRatio, readableOn } from '@/lib/contrast';
import { TIER_INFO } from '@/lib/states';
import { modeColors, palettes, toneColors, type Palette, type Tone } from '@/ui/palette';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    // Order doesn't matter.
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#777777'), 10);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('readableOn picks the stronger of white and near-black', () => {
    expect(readableOn('#000000')).toBe('#FFFFFF');
    expect(readableOn('#FFFFFF')).toBe('#1F2A26');
    expect(readableOn('#E3A33B')).toBe('#1F2A26');
  });
});

/** Every text/background pair the shared components draw (Pill, ModeBadge, Chip, Button, captions). */
function pairs(c: Palette): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const bg of ['bg', 'surface', 'surfaceAlt'] as const) {
    out.push([`text on ${bg}`, c.text, c[bg]], [`textMuted on ${bg}`, c.textMuted, c[bg]]);
    for (const ink of ['primaryInk', 'accentInk', 'dangerInk', 'successInk', 'groupInk', 'danger'] as const) out.push([`${ink} on ${bg}`, c[ink], c[bg]]);
  }
  for (const tone of ['neutral', 'primary', 'accent', 'danger', 'success'] as Tone[]) {
    const t = toneColors(c, tone);
    out.push([`Pill tone ${tone}`, t.fg, t.bg], [`Pill text on ${tone} tint`, c.text, t.bg]);
  }
  for (const mode of ['parent', 'solo', 'group'] as const) {
    const m = modeColors(c, mode);
    out.push([`ModeBadge ${mode}`, m.ink, m.bg]);
  }
  out.push(
    ['Chip selected', c.primaryText, c.primary],
    ['Chip unselected', c.text, c.surface],
    ['Button primary', c.primaryText, c.primary],
    ['Button secondary', c.text, c.surface],
    ['Button ghost on bg', c.primary, c.bg],
    ['Button ghost on surface', c.primary, c.surface],
    ['Button danger', c.dangerInk, c.dangerSoft],
    ['Button quietDanger on bg', c.dangerInk, c.bg],
    ['Button accent', '#2B1D05', c.accent],
    ['Discard bar', c.accentInk, c.accentSoft],
  );
  return out;
}

describe.each(Object.entries(palettes))('%s theme meets WCAG AA (4.5:1) for text', (_name, c) => {
  it.each(pairs(c))('%s', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('placeholders are lighter than helper text but still visible', () => {
    expect(contrastRatio(c.placeholder, c.surface)).toBeLessThan(contrastRatio(c.textMuted, c.surface));
    expect(contrastRatio(c.placeholder, c.surface)).toBeGreaterThanOrEqual(2.5);
  });

  it('custom chip colors get readable text', () => {
    for (const color of ['#3D9970', '#E07A5F', '#4C7FD9', '#E3A33B', c.primary]) expect(contrastRatio(readableOn(color), color)).toBeGreaterThanOrEqual(3);
  });
});

describe('state regulation pills', () => {
  it.each(Object.entries(TIER_INFO))('%s tier label is readable on its color', (_tier, info) => {
    expect(contrastRatio(readableOn(info.color), info.color)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
