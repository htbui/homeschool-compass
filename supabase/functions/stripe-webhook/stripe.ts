// Stripe webhook helpers, kept free of Deno APIs so they can be unit-tested
// (src/lib/__tests__/payments.test.ts).

export const TOLERANCE_SECONDS = 300;

/**
 * Checks a `Stripe-Signature` header (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.payload">`, with
 * several v1 entries while a secret rolls over) against the endpoint secret, and that it was made
 * within the last few minutes, so a captured request can't be replayed later.
 */
export async function verifyStripeSignature(payload: string, header: string, secret: string, nowSeconds = Date.now() / 1000): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  const sig = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  if (!t || !sig.length || Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sig.some((s) => timingSafeEqual(s, expected));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * What an event means for its order: paid, gave up, or nothing to do (null). A completed
 * session that hasn't actually been paid (a delayed payment method) settles nothing yet.
 */
export function settlementFor(event: unknown): { session: string; paid: boolean } | null {
  const e = event as { type?: string; data?: { object?: { id?: unknown; payment_status?: unknown } } } | null;
  const session = e?.data?.object;
  if (!session || typeof session.id !== 'string' || !session.id) return null;
  if (e?.type === 'checkout.session.completed' && session.payment_status === 'paid') return { session: session.id, paid: true };
  if (e?.type === 'checkout.session.expired') return { session: session.id, paid: false };
  return null;
}
