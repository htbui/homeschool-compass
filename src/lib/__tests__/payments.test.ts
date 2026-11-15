import { describe, expect, it } from 'vitest';

import { allowedReturn, DEFAULT_RETURN_ORIGINS } from '../../../supabase/functions/create-checkout/returnUrl';
import { hmacHex, settlementFor, timingSafeEqual, TOLERANCE_SECONDS, verifyStripeSignature } from '../../../supabase/functions/stripe-webhook/stripe';

// The payment functions' pure helpers (the functions themselves run on Deno).

const SECRET = 'whsec_test_freerange';
const NOW = 1_800_000_000;
const sign = async (payload: string, t = NOW, secret = SECRET) => `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
const event = (type: string, object: Record<string, unknown>) => JSON.stringify({ id: 'evt_1', type, data: { object } });

describe('Stripe webhook signatures', () => {
  const body = event('checkout.session.completed', { id: 'cs_test_1', payment_status: 'paid' });

  it('accepts what Stripe signs with the endpoint secret', async () => {
    expect(await verifyStripeSignature(body, await sign(body), SECRET, NOW)).toBe(true);
    // Within the tolerance either way (clocks drift).
    expect(await verifyStripeSignature(body, await sign(body, NOW - TOLERANCE_SECONDS), SECRET, NOW)).toBe(true);
    expect(await verifyStripeSignature(body, await sign(body, NOW + 60), SECRET, NOW)).toBe(true);
  });

  it('accepts any of several signatures while a secret rolls over', async () => {
    const good = (await sign(body)).split(',')[1];
    expect(await verifyStripeSignature(body, `t=${NOW},v1=${'0'.repeat(64)},${good},v0=ignored`, SECRET, NOW)).toBe(true);
  });

  it('refuses a changed payload, another secret, or a missing or malformed header', async () => {
    const header = await sign(body);
    expect(await verifyStripeSignature(body.replace('"paid"', '"unpaid"'), header, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(body, await sign(body, NOW, 'whsec_other'), SECRET, NOW)).toBe(false);
    for (const h of ['', 'garbage', `t=${NOW}`, `v1=${'a'.repeat(64)}`, `t=abc,v1=${'a'.repeat(64)}`, `t=0,${header.split(',')[1]}`, header.toUpperCase()]) {
      expect(await verifyStripeSignature(body, h, SECRET, NOW), h).toBe(false);
    }
  });

  it('refuses replays of an old (or far-future) signed request', async () => {
    expect(await verifyStripeSignature(body, await sign(body, NOW - TOLERANCE_SECONDS - 1), SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(body, await sign(body, NOW + TOLERANCE_SECONDS + 1), SECRET, NOW)).toBe(false);
  });

  it('compares in constant time, and only equal strings match', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('Stripe events → order settlement', () => {
  it('marks an order paid only when the session is completed and paid', () => {
    expect(settlementFor(JSON.parse(event('checkout.session.completed', { id: 'cs_1', payment_status: 'paid' })))).toEqual({ session: 'cs_1', paid: true });
    expect(settlementFor(JSON.parse(event('checkout.session.completed', { id: 'cs_1', payment_status: 'unpaid' })))).toBeNull();
    expect(settlementFor(JSON.parse(event('checkout.session.completed', { id: 'cs_1', payment_status: 'no_payment_required' })))).toBeNull();
  });

  it('cancels an order whose session expired', () => {
    expect(settlementFor(JSON.parse(event('checkout.session.expired', { id: 'cs_2', payment_status: 'unpaid' })))).toEqual({ session: 'cs_2', paid: false });
  });

  it('ignores every other event and anything without a session id', () => {
    for (const type of ['payment_intent.succeeded', 'charge.refunded', 'checkout.session.async_payment_failed', '']) expect(settlementFor(JSON.parse(event(type, { id: 'cs_3', payment_status: 'paid' }))), type).toBeNull();
    expect(settlementFor(JSON.parse(event('checkout.session.completed', { payment_status: 'paid' })))).toBeNull();
    expect(settlementFor(JSON.parse(event('checkout.session.completed', { id: 42, payment_status: 'paid' })))).toBeNull();
    expect(settlementFor({ type: 'checkout.session.expired' })).toBeNull();
    expect(settlementFor(null)).toBeNull();
    expect(settlementFor('checkout.session.completed')).toBeNull();
  });
});

describe('checkout return addresses', () => {
  const origins = 'http://localhost:8081, freerange://, https://app.example.com/';

  it('send buyers back only to the app', () => {
    expect(allowedReturn('http://localhost:8081', origins)).toBe(true);
    expect(allowedReturn('http://localhost:8081/market?view=library', origins)).toBe(true);
    expect(allowedReturn('freerange://market?view=library', origins)).toBe(true);
    expect(allowedReturn('https://app.example.com/market', origins)).toBe(true);
  });

  it('refuse look-alike hosts, other ports, and other schemes', () => {
    for (const url of ['http://localhost:8081.evil.example/market', 'http://localhost:80812/market', 'http://localhost:8082/market', 'https://localhost:8081/market', 'https://evil.example/?u=http://localhost:8081/', 'javascript:alert(1)', 'freerangex://market', 'https://app.example.com.evil.example/', '']) {
      expect(allowedReturn(url, origins), url).toBe(false);
    }
  });

  it('default to the local dev server and the app scheme', () => {
    expect(DEFAULT_RETURN_ORIGINS.split(',')).toEqual(['http://localhost:8081', 'freerange://']);
    expect(allowedReturn('http://localhost:8081/market')).toBe(true);
    expect(allowedReturn('exp://192.168.1.5:8081/--/market')).toBe(false);
    expect(allowedReturn('http://localhost:8081/x', ' , ')).toBe(false);
  });
});
