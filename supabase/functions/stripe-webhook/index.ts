// Stripe → Kinship: marks purchases paid (or cancelled) when Checkout finishes.
// Verifies Stripe's signature, so it must be deployed with JWT verification
// off (see supabase/config.toml) and STRIPE_WEBHOOK_SECRET set.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json } from '../_shared/http.ts';

const TOLERANCE_SECONDS = 300;

Deno.serve(async (req) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Webhook not configured' }, 503);
  const body = await req.text();
  if (!(await verify(body, req.headers.get('stripe-signature') ?? '', secret))) return json({ error: 'Bad signature' }, 400);

  const event = JSON.parse(body);
  const session = event?.data?.object;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  if (event.type === 'checkout.session.completed' && session?.payment_status === 'paid') {
    await admin.from('purchases').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('provider_session', session.id).eq('status', 'pending');
  } else if (event.type === 'checkout.session.expired') {
    await admin.from('purchases').update({ status: 'cancelled' }).eq('provider_session', session.id).eq('status', 'pending');
  }
  return json({ received: true });
});

async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  const sig = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  if (!t || !sig.length || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sig.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
