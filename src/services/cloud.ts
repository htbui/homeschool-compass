import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * The Freerange service (Supabase). When the environment variables aren't set
 * the app runs local-only: everything stays on the device and the
 * marketplace and community show sample data.
 */
// EXPO_PUBLIC_KINSHIP_LOCAL_ONLY=1 forces local-only mode (used by the offline e2e suites).
const url = process.env.EXPO_PUBLIC_KINSHIP_LOCAL_ONLY === '1' ? undefined : process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          storageKey: 'kinship-auth',
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
  if (/JWT|not authenticated|Sign in first/i.test(msg)) return 'Please sign in again.';
  return msg;
}
