// Where checkout may send buyers back to. Free of Deno APIs so it can be
// unit-tested (src/lib/__tests__/payments.test.ts).

export const DEFAULT_RETURN_ORIGINS = 'http://localhost:8081,freerange://';

/** Only send buyers back to the app itself: one of the allowed origins (a comma-separated list). */
export function allowedReturn(url: string, origins: string = DEFAULT_RETURN_ORIGINS): boolean {
  const allowed = origins.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.some((origin) => url === origin || url.startsWith(origin.endsWith('/') || origin.endsWith('://') ? origin : `${origin}/`));
}
