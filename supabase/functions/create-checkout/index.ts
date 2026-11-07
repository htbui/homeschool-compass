// Starts a purchase of a paid marketplace listing.
//
// - STRIPE_SECRET_KEY set: creates a pending purchase and a Stripe Checkout
//   session; the stripe-webhook function marks it paid.
// - PAYMENTS_MODE=demo (local development only): marks it paid immediately,
//   flagged `demo`, so the flow can be tested without a payment provider.
// - Neither: refuses, so production never hands out paid content for free.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/http.ts';

const FUNDING = new Set(['esa', 'tax', 'out_of_pocket']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    const user = auth.user;
    if (!user) return json({ error: 'Sign in to buy.' }, 401);

    const { listingId, fundingSource, returnUrl } = await req.json();
    if (typeof listingId !== 'string' || !FUNDING.has(fundingSource)) return json({ error: 'Bad request' }, 400);
    if (typeof returnUrl !== 'string' || !allowedReturn(returnUrl)) return json({ error: 'Return address not allowed' }, 400);

    const { data: member } = await admin.from('family_members').select('family_id').eq('user_id', user.id).maybeSingle();
    if (!member) return json({ error: 'Finish setting up your family first.' }, 400);
    const { data: listing } = await admin.from('listings').select('*').eq('id', listingId).eq('status', 'active').maybeSingle();
    if (!listing) return json({ error: 'That listing is no longer available.' }, 404);
    const price = Number(listing.price);
    if (price <= 0) return json({ error: 'This listing is free — claim it instead.' }, 400);
    if (listing.seller_family === member.family_id) return json({ error: 'You can’t buy your own listing.' }, 400);

    const { data: owned } = await admin.from('purchases').select('*').eq('family_id', member.family_id).eq('listing_id', listingId).eq('status', 'paid').maybeSingle();
    if (owned) return json({ purchase: owned });

    const row = {
      family_id: member.family_id,
      listing_id: listingId,
      title: listing.title,
      seller: listing.seller_name,
      price,
      funding_source: fundingSource,
      esa_eligible: listing.esa_eligible,
    };

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (stripeKey) {
      const { data: pending, error } = await admin.from('purchases').insert({ ...row, status: 'pending' }).select().single();
      if (error) throw error;
      const sep = returnUrl.includes('?') ? '&' : '?';
      const form = new URLSearchParams({
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(Math.round(price * 100)),
        'line_items[0][price_data][product_data][name]': listing.title,
        success_url: `${returnUrl}${sep}checkout=success`,
        cancel_url: `${returnUrl}${sep}checkout=cancelled`,
        client_reference_id: pending.id,
        'metadata[purchase_id]': pending.id,
      });
      if (user.email) form.set('customer_email', user.email);
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': pending.id },
        body: form,
      });
      const session = await res.json();
      if (!res.ok) {
        await admin.from('purchases').update({ status: 'cancelled' }).eq('id', pending.id);
        return json({ error: session?.error?.message ?? 'Checkout failed to start' }, 502);
      }
      await admin.from('purchases').update({ provider_session: session.id }).eq('id', pending.id);
      return json({ url: session.url });
    }

    if (Deno.env.get('PAYMENTS_MODE') === 'demo') {
      const { data: paid, error } = await admin.from('purchases').insert({ ...row, status: 'paid', demo: true, paid_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      return json({ purchase: paid });
    }

    return json({ error: 'Payments aren’t set up yet, so paid curricula can’t be bought through Kinship.' }, 503);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/** Only send buyers back to the app itself. */
function allowedReturn(url: string): boolean {
  const allowed = (Deno.env.get('CHECKOUT_RETURN_ORIGINS') ?? 'http://localhost:8081,kinship://').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.some((origin) => url === origin || url.startsWith(origin.endsWith('/') || origin.endsWith('://') ? origin : `${origin}/`));
}
