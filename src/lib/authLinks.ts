/**
 * Password-reset links. The reset email sends the parent back to the app with the session in
 * the link's #fragment (…#access_token=…&refresh_token=…&type=recovery). The web build's auth
 * client reads it by itself; on phones the deep link is read with this.
 */
export function parseAuthRedirect(url: string): { accessToken: string; refreshToken: string; type: string } | undefined {
  const hash = url.split('#')[1];
  if (!hash) return undefined;
  const p = new URLSearchParams(hash);
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  if (!accessToken || !refreshToken) return undefined;
  return { accessToken, refreshToken, type: p.get('type') ?? '' };
}

/** Where the reset email should send the parent: this app's account screen. */
export function resetRedirect(origin: string | undefined, nativeUrl: string): string {
  return origin ? `${origin.replace(/\/+$/, '')}/account` : nativeUrl;
}

export const MIN_PASSWORD = 6;

/** Problems with a new password, as "Still needed" items. */
export function passwordProblems(pw: string, confirm: string): string[] {
  return [pw.length < MIN_PASSWORD && `a password of ${MIN_PASSWORD}+ characters`, pw.length >= MIN_PASSWORD && pw !== confirm && 'the same password twice'].filter(Boolean) as string[];
}

export const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());
