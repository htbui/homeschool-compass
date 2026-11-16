import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * The Freerange service (Supabase). When the environment variables aren't set
 * the app runs local-only: everything stays on the device and the
 * marketplace and community show sample data.
 */
// EXPO_PUBLIC_FREERANGE_LOCAL_ONLY=1 forces local-only mode (used by the offline e2e suites).
const url = process.env.EXPO_PUBLIC_FREERANGE_LOCAL_ONLY === '1' ? undefined : process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Opened from a password-reset email (web). Read before the auth client consumes the link:
 * it reports the reset during its own start-up, before the app is listening.
 */
export const openedFromResetLink = Platform.OS === 'web' && typeof window !== 'undefined' && /(^|[#&])type=recovery(&|$)/.test(window.location.hash);

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          storageKey: 'freerange-auth',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

export const cloudEnabled = supabase !== null;

if (supabase && Platform.OS !== 'web') {
  // Refresh tokens only while the app is in the foreground.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turn a Supabase/PostgREST error into a sentence a parent can act on. */
export function friendlyError(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/Failed to fetch|Network request failed|NetworkError/i.test(msg)) return 'Can’t reach Freerange right now. Your changes are saved on this device and will sync when you’re back online.';
  if (/Invalid login credentials/i.test(msg)) return 'That email and password don’t match.';
  if (/User already registered/i.test(msg)) return 'There’s already an account with that email — sign in instead.';
  if (/Password should be at least/i.test(msg)) return 'Use a password of at least 6 characters.';
  if (/Email not confirmed/i.test(msg)) return 'Check your inbox and confirm your email first.';
  if (/only request this after|rate limit|too many/i.test(msg)) return 'We just sent one. Wait a minute, then try again.';
  if (/should be different from the old/i.test(msg)) return 'Choose a password you haven’t used for this account.';
  if (/Unable to validate email|invalid format/i.test(msg)) return 'That doesn’t look like an email address.';
  if (/JWT|not authenticated|Sign in first/i.test(msg)) return 'Please sign in again.';
  return msg;
}
