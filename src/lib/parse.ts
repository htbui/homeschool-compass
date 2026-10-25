import type { ClockTime, DateKey } from './types';

/**
 * Forgiving parsers for typed input. People write dates and times many ways;
 * these accept the common US forms and return the canonical value, or
 * undefined when the text isn't a real date/time yet.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function build(y: number, m: number, d: number): DateKey | undefined {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return undefined;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(y, m - 1, d);
  // Reject roll-overs like Feb 30 → Mar 2.
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Two-digit years: 00–(this year+1) → 2000s, otherwise 1900s. */
function fullYear(y: string): number {
  if (y.length !== 2) return Number(y);
  const n = Number(y);
  const cutoff = (new Date().getFullYear() % 100) + 1;
  return n <= cutoff ? 2000 + n : 1900 + n;
}

export function parseDate(input: string): DateKey | undefined {
  const s = input.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!s) return undefined;
  let m: RegExpMatchArray | null;

  // 2017-05-21, 2017/5/21, 2017.5.21
  if ((m = s.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/))) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  // 05/21/2017, 5-21-17, 5.21.2017 (US month-first)
  if ((m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/))) return build(fullYear(m[3]), Number(m[1]), Number(m[2]));
  // 20170521
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  // May 21 2017
  if ((m = s.match(/^([a-z]+)\.? (\d{1,2}) (\d{2}|\d{4})$/))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    return mi >= 0 ? build(fullYear(m[3]), mi + 1, Number(m[2])) : undefined;
  }
  // 21 May 2017
  if ((m = s.match(/^(\d{1,2}) ([a-z]+)\.? (\d{2}|\d{4})$/))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3));
    return mi >= 0 ? build(fullYear(m[3]), mi + 1, Number(m[1])) : undefined;
  }
  return undefined;
}

/**
 * "9" → 09:00, "930" → 09:30, "9:30 pm" → 21:30, "13:30" → 13:30, "1pm" → 13:00.
 * Without am/pm, 1–6 o'clock is read as afternoon (school days don't start at 2 AM).
 */
export function parseTime(input: string): ClockTime | undefined {
  const s = input.trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.[0];
  if (min > 59) return undefined;
  if (ampm) {
    if (h < 1 || h > 12) return undefined;
    if (ampm === 'p' && h !== 12) h += 12;
    if (ampm === 'a' && h === 12) h = 0;
  } else {
    if (h > 23) return undefined;
    if (h >= 1 && h <= 6 && m[1].length === 1) h += 12;
  }
  return `${pad(h)}:${pad(min)}`;
}

/** "$1,250.50" → 1250.5; undefined for anything that isn't a non-negative amount. */
export function parseMoney(input: string): number | undefined {
  const s = input.trim().replace(/[$,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '' || s === '.') return undefined;
  return Math.round(Number(s) * 100) / 100;
}

/** Positive whole number, e.g. lesson counts and minutes. */
export function parseCount(input: string): number | undefined {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n > 0 ? n : undefined;
}
