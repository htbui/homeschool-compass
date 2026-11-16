import type { Listing } from './market';
import type { ID } from './types';

/**
 * Creator promotions: sales, bundles, and coupon codes.
 *
 * With an account the server prices every order (quote_order() in the
 * database); this module is the same math for showing prices in the app and
 * for the on-device demo marketplace. Keep the two in step.
 */

export interface Bundle {
  id: ID;
  title: string;
  description: string;
  seller: string;
  /** The Studio creator who made it. */
  creatorUser?: string;
  listingIds: ID[];
  price: number;
  cover: string;
  color: string;
  status: 'active' | 'removed';
  createdAt: string;
  mine?: boolean;
}

export interface Coupon {
  id: ID;
  /** Upper case, 3–24 letters, digits, dashes, or underscores. */
  code: string;
  kind: 'percent' | 'fixed';
  /** Percent off (1–100), or dollars off. */
  amount: number;
  /** One curriculum; storewide (every curriculum and bundle) when unset. */
  listingId?: ID;
  maxUses?: number;
  uses: number;
  expiresAt?: string;
  active: boolean;
  createdAt: string;
}

export type PriceTarget = { kind: 'listing'; id: ID } | { kind: 'bundle'; id: ID };

export interface QuoteItem {
  listingId: ID;
  title: string;
  seller: string;
  esaEligible: boolean;
  listPrice: number;
  /** This curriculum's share of the total (bundles split it by list price). */
  price: number;
}

export interface Quote {
  kind: PriceTarget['kind'];
  id: ID;
  title: string;
  seller: string;
  /** Before the sale, bundle price, and coupon. */
  listPrice: number;
  salePercent?: number;
  saleEndsAt?: string;
  /** After the sale or bundle price, before the coupon. */
  price: number;
  couponId?: ID;
  couponCode?: string;
  discount: number;
  total: number;
  items: QuoteItem[];
  /** Bundle curricula this family already has (not charged again). */
  owned: ID[];
}

export const SALE_MIN = 5;
export const SALE_MAX = 90;
export const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,23}$/;

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (n: number) => n / 100;

export const normalizeCode = (s: string) => s.trim().toUpperCase();

/** The sale is on right now. */
export function onSale(l: Pick<Listing, 'salePercent' | 'saleEndsAt'>, now = new Date()): boolean {
  return !!l.salePercent && !!l.saleEndsAt && Date.parse(l.saleEndsAt) > now.getTime();
}

/** What a listing costs today (its sale applied). */
export function currentPrice(l: Pick<Listing, 'price' | 'salePercent' | 'saleEndsAt'>, now = new Date()): number {
  if (!onSale(l, now)) return l.price;
  return fromCents(Math.round((toCents(l.price) * (100 - l.salePercent!)) / 100));
}

/** "Save 25%", or 0 when there's nothing to save. */
export function savePercent(list: number, price: number): number {
  return list > 0 && price < list ? Math.round((1 - price / list) * 100) : 0;
}

/** Savings smaller than this aren't advertised ("Save 4%" reads as a gimmick). */
export const MIN_SHOWN_SAVE = 5;

/** "Save X%" to show next to a price, or 0 when it's too small to mention. */
export function shownSavePercent(reference: number, price: number): number {
  const p = savePercent(reference, price);
  return p >= MIN_SHOWN_SAVE ? p : 0;
}

export interface BundleSummary {
  /** Curricula still in the Marketplace, in the bundle's order. */
  items: Listing[];
  /** Ones this family already has. */
  owned: Listing[];
  /** What the curricula still needed cost one by one (list prices). */
  listTotal: number;
  /** What they cost one by one today, with any sales: the honest comparison. */
  nowTotal: number;
  price: number;
  /** Percent saved against buying them separately today (0 when under MIN_SHOWN_SAVE). */
  save: number;
}

export function bundleSummary(b: Pick<Bundle, 'listingIds' | 'price'>, listings: Listing[], owned: Set<ID> = new Set(), now = new Date()): BundleSummary {
  const items = b.listingIds.map((id) => listings.find((l) => l.id === id && !l.suspended)).filter((l): l is Listing => !!l);
  const have = items.filter((l) => owned.has(l.id));
  const need = items.filter((l) => !owned.has(l.id));
  const listTotal = fromCents(need.reduce((a, l) => a + toCents(l.price), 0));
  const nowTotal = fromCents(need.reduce((a, l) => a + toCents(currentPrice(l, now)), 0));
  const price = Math.min(b.price, nowTotal);
  return { items, owned: have, listTotal, nowTotal, price, save: shownSavePercent(nowTotal, price) };
}

/** Why a coupon can't be used here (the same words the server uses), or undefined. */
export function couponProblem(c: Coupon | undefined, target: PriceTarget, now = new Date()): string | undefined {
  if (!c || !c.active || (c.listingId && (target.kind !== 'listing' || c.listingId !== target.id))) return 'That coupon code doesn’t work for this curriculum';
  if (c.expiresAt && Date.parse(c.expiresAt) <= now.getTime()) return 'That coupon code has expired';
  if (c.maxUses && c.uses >= c.maxUses) return 'That coupon code has been used up';
  return undefined;
}

export function couponDiscount(c: Pick<Coupon, 'kind' | 'amount'>, price: number): number {
  return c.kind === 'percent' ? fromCents(Math.round((toCents(price) * c.amount) / 100)) : Math.min(c.amount, price);
}

/** Split a total across items by weight, in cents; the last item takes what's left. */
export function allocate(total: number, weights: number[]): number[] {
  const t = toCents(total);
  const sum = weights.reduce((a, w) => a + toCents(w), 0);
  let left = t;
  return weights.map((w, i) => {
    const share = i === weights.length - 1 ? left : sum > 0 ? Math.min(left, Math.round((t * toCents(w)) / sum)) : 0;
    left -= share;
    return fromCents(share);
  });
}

export interface QuoteContext {
  listings: Listing[];
  bundles: Bundle[];
  /** The seller's coupons (on this device). */
  coupons: Coupon[];
  owned: Set<ID>;
  code?: string;
  now?: Date;
}

/** The price of a listing or bundle, as the server would charge it. Throws with a reason if it can't be bought. */
export function quote(target: PriceTarget, ctx: QuoteContext): Quote {
  const now = ctx.now ?? new Date();
  let base: Omit<Quote, 'couponId' | 'couponCode' | 'discount' | 'total' | 'items'> & { lines: (Omit<QuoteItem, 'price'> & { weight: number })[] };
  if (target.kind === 'listing') {
    const l = ctx.listings.find((x) => x.id === target.id && !x.suspended);
    if (!l) throw new Error('That listing is no longer available');
    if (l.mine) throw new Error('You can’t buy your own listing');
    const price = currentPrice(l, now);
    base = {
      kind: 'listing',
      id: l.id,
      title: l.title,
      seller: l.seller,
      listPrice: l.price,
      salePercent: onSale(l, now) ? l.salePercent : undefined,
      saleEndsAt: onSale(l, now) ? l.saleEndsAt : undefined,
      price,
      owned: [],
      lines: [{ listingId: l.id, title: l.title, seller: l.seller, esaEligible: l.esaEligible, listPrice: l.price, weight: price }],
    };
  } else {
    const b = ctx.bundles.find((x) => x.id === target.id && x.status === 'active');
    if (!b) throw new Error('That bundle is no longer available');
    if (b.mine) throw new Error('You can’t buy your own bundle');
    const s = bundleSummary(b, ctx.listings, ctx.owned, now);
    const need = s.items.filter((l) => !ctx.owned.has(l.id));
    if (!need.length) throw new Error('You already have everything in this bundle');
    base = {
      kind: 'bundle',
      id: b.id,
      title: b.title,
      seller: b.seller,
      listPrice: s.listTotal,
      price: s.price,
      owned: s.owned.map((l) => l.id),
      lines: need.map((l) => ({ listingId: l.id, title: l.title, seller: l.seller, esaEligible: l.esaEligible, listPrice: l.price, weight: l.price })),
    };
  }
  let coupon: Coupon | undefined;
  let discount = 0;
  const code = ctx.code ? normalizeCode(ctx.code) : '';
  if (code) {
    coupon = ctx.coupons.find((c) => c.code === code);
    const problem = couponProblem(coupon, target, now);
    if (problem) throw new Error(problem);
    discount = couponDiscount(coupon!, base.price);
  }
  const total = Math.max(0, fromCents(toCents(base.price) - toCents(discount)));
  const shares = allocate(total, base.lines.map((x) => x.weight));
  const { lines, ...rest } = base;
  return { ...rest, couponId: coupon?.id, couponCode: coupon?.code, discount, total, items: lines.map(({ weight: _w, ...x }, i) => ({ ...x, price: shares[i] })) };
}

// ───────────────────────────── Forms

export function saleIssues(pct: number | undefined, endsAt: string | undefined, price: number, now = new Date()): string[] {
  const ends = endsAt ? Date.parse(endsAt) : NaN;
  return [
    price === 0 && 'a price (free curricula can’t go on sale)',
    (!pct || pct < SALE_MIN || pct > SALE_MAX) && `a discount between ${SALE_MIN}% and ${SALE_MAX}%`,
    (!endsAt || Number.isNaN(ends) || ends <= now.getTime() || ends > now.getTime() + 366 * 86400000) && 'an end date within the next year',
  ].filter((x): x is string => !!x);
}

export function bundleIssues(b: Pick<Bundle, 'title' | 'listingIds' | 'price'>, listings: Listing[]): string[] {
  const picked = listings.filter((l) => b.listingIds.includes(l.id));
  const sum = fromCents(picked.reduce((a, l) => a + toCents(l.price), 0));
  return [
    !b.title.trim() && 'a name',
    b.listingIds.length < 2 && 'at least 2 curricula',
    b.listingIds.length > 20 && 'at most 20 curricula',
    !(b.price >= 0) && 'a bundle price',
    sum > 0 && b.price >= sum && `a price under $${sum} (what they cost separately)`,
  ].filter((x): x is string => !!x);
}

export function couponIssues(c: Pick<Coupon, 'code' | 'kind' | 'amount' | 'maxUses' | 'expiresAt'>, existing: Pick<Coupon, 'code'>[] = []): string[] {
  const code = normalizeCode(c.code);
  return [
    !CODE_RE.test(code) && 'a code of 3–24 letters or numbers',
    existing.some((x) => x.code === code) && 'a code you haven’t used yet',
    !(c.amount > 0) && 'an amount',
    c.kind === 'percent' && c.amount > 100 && 'a percent of 100 or less',
    c.maxUses !== undefined && !(c.maxUses >= 1) && 'a number of uses (1 or more)',
    c.expiresAt !== undefined && Date.parse(c.expiresAt) <= Date.now() && 'an expiry date in the future',
  ].filter((x): x is string => !!x);
}

export function couponLabel(c: Pick<Coupon, 'kind' | 'amount'>): string {
  return c.kind === 'percent' ? `${c.amount}% off` : `$${c.amount % 1 ? c.amount.toFixed(2) : c.amount} off`;
}
