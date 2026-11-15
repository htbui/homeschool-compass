import { describe, expect, it } from 'vitest';

import { accountCopy, DEVICE_ONLY, mentionsSignIn } from '@/lib/accountCopy';

describe('accountCopy', () => {
  const signIn = 'Sign in (Settings → Account) to publish to everyone.';
  const local = 'Publishing lists curricula on this device only.';

  it('asks people to sign in when the build can', () => {
    expect(accountCopy(true, signIn, local)).toBe(signIn);
  });

  it('explains the device-only build instead of saying "Sign in"', () => {
    const text = accountCopy(false, signIn, local);
    expect(text.startsWith(DEVICE_ONLY)).toBe(true);
    expect(text).toContain(local);
    expect(mentionsSignIn(text)).toBe(false);
  });

  it('mentionsSignIn spots the wording', () => {
    expect(mentionsSignIn('Sign in to see insights')).toBe(true);
    expect(mentionsSignIn('once you sign in to Freerange')).toBe(true);
    expect(mentionsSignIn('Signed in as you')).toBe(true);
    expect(mentionsSignIn('Assign individual tasks')).toBe(false);
    expect(mentionsSignIn(DEVICE_ONLY)).toBe(false);
  });
});
