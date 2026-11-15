/**
 * Copy for features that need a Freerange account. The local-only build can't sign in at all,
 * so there it explains the device-only copy instead of saying "Sign in" (the wording Badges
 * and Messages already used).
 */
export const DEVICE_ONLY = 'This copy of Freerange keeps everything on this device.';

export function accountCopy(cloudEnabled: boolean, signIn: string, deviceOnly: string): string {
  return cloudEnabled ? signIn : `${DEVICE_ONLY} ${deviceOnly}`;
}

/** True when the text would send someone to an account screen that this build doesn't have. */
export const mentionsSignIn = (text: string) => /\bsign(ed)? in\b/i.test(text);
