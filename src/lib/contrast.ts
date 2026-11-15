/**
 * WCAG 2.x contrast math, used to check the theme's text/background pairs
 * (small bold text such as pills and chips needs 4.5:1 for AA).
 */

/** Relative luminance of a #RGB or #RRGGBB color. */
export function luminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colors, from 1 (same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal-size text. */
export const AA_TEXT = 4.5;

/** White or near-black, whichever reads better on `bg` (for text on a custom solid color). */
export function readableOn(bg: string, dark = '#1F2A26', light = '#FFFFFF'): string {
  return contrastRatio(light, bg) >= contrastRatio(dark, bg) ? light : dark;
}
