// Stripe → Freerange: marks orders (purchases or gifts) paid, or cancelled, when Checkout finishes.
// Verifies Stripe's signature, so it must be deployed with JWT verification
// off (see supabase/config.toml) and STRIPE_WEBHOOK_SECRET set.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json } from '../_shared/http.ts';
import { settlementFor, verifyStripeSignature } from './stripe.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Webhook not configured' }, 503);
  const body = await req.text();
  if (!(await verifyStripeSignature(body, req.headers.get('stripe-signature') ?? '', secret))) return json({ error: 'Bad signature' }, 400);

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  // settle_order() settles the whole order: every purchase in a bundle, or a gift
  // (which becomes claimable), and gives back the coupon use if it expired.
  const settle = settlementFor(event);
  if (settle) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { error } = await admin.rpc('settle_order', { sid: settle.session, paid: settle.paid });
    if (error) return json({ error: error.message }, 500);
  }
  return json({ received: true });
});
