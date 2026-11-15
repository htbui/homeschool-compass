import type { ID } from './types';

/**
 * Gifting a curriculum to another family. The giver pays (or, for free
 * curricula, just sends it); the recipient claims it once with a code.
 */

export type GiftStatus = 'pending' | 'ready' | 'claimed' | 'cancelled';

export interface SentGift {
  id: ID;
  code: string;
  listingId: ID;
  title: string;
  seller: string;
  /** An email address, or the connected family's name. */
  recipientLabel: string;
  recipientEmail?: string;
  recipientFamily?: ID;
  note: string;
  /** What the giver paid. */
  price: number;
  status: GiftStatus;
  demo?: boolean;
  createdAt: string;
  claimedAt?: string;
}

export interface IncomingGift {
  id: ID;
  code: string;
  listingId: ID;
  title: string;
  seller: string;
  giverName: string;
  note: string;
  createdAt: string;
}

export const GIFT_STATUS: Record<GiftStatus, string> = {
  pending: '⏳ Waiting for payment',
  ready: '📬 Not claimed yet',
  claimed: '✓ Claimed',
  cancelled: 'Taken back',
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random code from the same alphabet the server uses (no 0/O or 1/I). */
export function randomCode(length: number, random: () => number = Math.random): string {
  return Array.from({ length }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join('');
}

/** Codes are typed in by hand: ignore spaces, dashes, and case. */
export const normalizeGiftCode = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** "ABCDE-FGHJK", easier to read aloud. */
export const formatGiftCode = (code: string) => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code);

export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

export const GIFT_NOTE_MAX = 500;
