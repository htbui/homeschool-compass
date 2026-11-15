import { friendlyError, supabase } from './cloud';

/**
 * "Verified family" badges. Today a Freerange moderator checks a family by
 * hand (for example a short video call) and marks it verified; only
 * moderators can set the status (enforced in the database).
 *
 * TODO(ID vendor): to use a real identity check such as Stripe Identity:
 *   1. Add an edge function `create-verification-session` that creates a
 *      vendor session for the signed-in parent (vendor secret key stays on the
 *      server) and returns its URL or client secret.
 *   2. Add a webhook edge function that, on the vendor's "verified" or
 *      "failed" event, calls `record_vendor_verification(fid, 'stripe_identity',
 *      session_id, passed)` with the service role.
 *   3. Make `startIdCheck()` below open that session (expo-web-browser on
 *      phones, a redirect on the web) and set VENDOR_ID_CHECK to true.
 * Families never upload ID documents to Freerange itself.
 */
export const VENDOR_ID_CHECK = false;

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'declined' | 'revoked';

export interface MyVerification {
  status: VerificationStatus;
  requestedAt?: string;
  decidedAt?: string;
}

export interface VerificationRequest {
  familyId: string;
  displayName: string;
  bio: string;
  note: string;
  /** From the community profile, plus the parents' account emails, to set up the check. */
  contact: string;
  emails: string;
  requestedAt: string;
  emailVerified: boolean;
  connections: number;
  familySince: string;
}

const db = () => {
  if (!supabase) throw new Error('Verification needs the Freerange service.');
  return supabase;
};
const check = <T,>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new Error(friendlyError(r.error));
  return r.data;
};

export async function myVerification(): Promise<MyVerification> {
  const rows = check(await db().rpc('my_verification')) as { status: VerificationStatus; requested_at: string; decided_at: string | null }[];
  const r = rows[0];
  return r ? { status: r.status, requestedAt: r.requested_at, decidedAt: r.decided_at ?? undefined } : { status: 'none' };
}

/** Ask the Freerange team to verify this family. */
export async function requestVerification(note: string): Promise<void> {
  check(await db().rpc('request_verification', { note: note.trim().slice(0, 500) }));
}

/** Start a vendor ID check (not available yet; see the TODO above). */
export async function startIdCheck(): Promise<never> {
  throw new Error('ID checks aren’t available yet. Ask the Freerange team instead.');
}

// ───────────────────────────── Moderators

export async function verificationQueue(): Promise<VerificationRequest[]> {
  const rows = check(await db().rpc('verification_queue')) as {
    family_id: string; display_name: string; bio: string; note: string; contact: string; emails: string | null; requested_at: string; email_verified: boolean; connections: number; family_since: string;
  }[];
  return rows.map((r) => ({ familyId: r.family_id, displayName: r.display_name, bio: r.bio, note: r.note, contact: r.contact, emails: r.emails ?? '', requestedAt: r.requested_at, emailVerified: r.email_verified, connections: r.connections, familySince: r.family_since }));
}

export async function decideVerification(familyId: string, decision: 'verified' | 'declined' | 'revoked', note?: string): Promise<void> {
  check(await db().rpc('set_family_verification', { fid: familyId, decision, note: note?.trim() || null }));
}
