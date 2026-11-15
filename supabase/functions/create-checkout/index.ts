// Starts a purchase: a paid listing, a creator's bundle, or either as a gift
// for another family. Prices (sales, bundle price, coupon codes) come from
// checkout_record() in the database, never from the app.
//
// - STRIPE_SECRET_KEY set: records a pending order and a Stripe Checkout
//   session; the stripe-webhook function marks it paid (or cancels it).
// - PAYMENTS_MODE=demo (local development only): marks it paid immediately,
//   flagged `demo`, so the flow can be tested without a payment provider.
// - Neither: refuses, so production never hands out paid content for free.
// A total of $0 (a 100% coupon) is recorded as free in every mode.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_shared/http.ts';
import { allowedReturn, DEFAULT_RETURN_ORIGINS } from './returnUrl.ts';

const FUNDING = new Set(['esa', 'tax', 'out_of_pocket']);

type Order = { order_id: string; total: number | string; title?: string; owned?: boolean; purchases?: Record<string, unknown>[]; gift?: { title?: string } & Record<string, unknown> };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    const user = auth.user;
    if (!user) return json({ error: 'Sign in to buy.' }, 401);

    const body = await req.json();
    const { fundingSource, returnUrl, coupon } = body;
    // A single listing (`listingId`) or a creator's bundle (`bundleId`), optionally as a gift.
    const kind = typeof body.bundleId === 'string' ? 'bundle' : 'listing';
    const targetId = kind === 'bundle' ? body.bundleId : body.listingId;
    const gift =
      body.gift && typeof body.gift === 'object'
        ? { email: typeof body.gift.email === 'string' ? body.gift.email : null, family_id: typeof body.gift.familyId === 'string' ? body.gift.familyId : null, note: typeof body.gift.note === 'string' ? body.gift.note : '' }
        : null;
    if (typeof targetId !== 'string' || !FUNDING.has(fundingSource) || (coupon != null && typeof coupon !== 'string')) return json({ error: 'Bad request' }, 400);
    if (typeof returnUrl !== 'string' || !allowedReturn(returnUrl, Deno.env.get('CHECKOUT_RETURN_ORIGINS') ?? DEFAULT_RETURN_ORIGINS)) return json({ error: 'Return address not allowed' }, 400);

    const { data: member } = await admin.from('family_members').select('family_id').eq('user_id', user.id).maybeSingle();
    if (!member) return json({ error: 'Finish setting up your family first.' }, 400);

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const demo = !stripeKey && Deno.env.get('PAYMENTS_MODE') === 'demo';
    const record = async (payStatus: 'paid' | 'pending') => {
      const { data, error } = await admin.rpc('checkout_record', {
        buyer_family: member.family_id,
        buyer_user: user.id,
        target_kind: kind,
        target_id: targetId,
        coupon_code: coupon ?? null,
        // ESA funds and tax deductions don't cover gifts to other families.
        funding: gift ? 'out_of_pocket' : fundingSource,
        pay_status: payStatus,
        is_demo: demo,
        gift,
      });
      if (error) throw new CheckoutError(error.message);
      return data as Order;
    };
    const reply = (o: Order) => json({ purchase: o.purchases?.[0], purchases: o.purchases, gift: o.gift, total: Number(o.total) });

    if (stripeKey) {
      const o = await record('pending');
      // Already owned, a 100% coupon, or a free gift: nothing to pay.
      if (o.owned || Number(o.total) === 0) return reply(o);
      const sep = returnUrl.includes('?') ? '&' : '?';
      const form = new URLSearchParams({
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(Math.round(Number(o.total) * 100)),
        'line_items[0][price_data][product_data][name]': `${gift ? 'Gift: ' : ''}${o.title ?? o.gift?.title ?? 'Curriculum'}`.slice(0, 250),
        success_url: `${returnUrl}${sep}checkout=success`,
        cancel_url: `${returnUrl}${sep}checkout=cancelled`,
        client_reference_id: o.order_id,
        'metadata[order_id]': o.order_id,
      });
      if (user.email) form.set('customer_email', user.email);
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': o.order_id },
        body: form,
      });
      const session = await res.json();
      if (!res.ok) {
        await admin.rpc('settle_order', { sid: null, paid: false, order_ref: o.order_id });
        return json({ error: session?.error?.message ?? 'Checkout failed to start' }, 502);
      }
      await admin.from(gift ? 'gifts' : 'purchases').update({ provider_session: session.id }).eq('id', o.order_id);
      return json({ url: session.url });
    }

    if (demo) return reply(await record('paid'));

    return json({ error: 'Payments aren’t set up yet, so paid curricula can’t be bought through Freerange.' }, 503);
  } catch (e) {
    if (e instanceof CheckoutError) return json({ error: e.message }, 400);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/** A reason the database refused the order (unavailable, your own, a bad coupon…), shown to the buyer. */
class CheckoutError extends Error {}
