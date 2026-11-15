/**
 * Where "back" goes from a screen that was opened straight from a link (a shared listing,
 * a gift, a refresh), when there's no history to go back to.
 */
export interface BackTarget {
  href: '/market' | '/community' | '/studio' | '/studio/classes' | '/compliance' | '/messages' | '/settings' | '/today' | '/';
  label: string;
}

const RULES: [RegExp, BackTarget][] = [
  [/^\/(listing|bundle|creator|gift)(\/|$)/, { href: '/market', label: 'Marketplace' }],
  [/^\/coop(\/|$)/, { href: '/community', label: 'Community' }],
  [/^\/studio\/class\/[^/]+/, { href: '/studio/classes', label: 'Co-op classes' }],
  [/^\/studio\/.+/, { href: '/studio', label: 'Studio' }],
  [/^\/records(\/|$)/, { href: '/compliance', label: 'Compass' }],
  [/^\/messages\/.+/, { href: '/messages', label: 'Messages' }],
  [/^\/messages\/?$/, { href: '/community', label: 'Community' }],
  [/^\/account(\/|$)/, { href: '/settings', label: 'Settings' }],
  [/^\/(studio|settings|notifications|moderation)\/?$/, { href: '/today', label: 'Today' }],
];

export function parentRoute(pathname: string): BackTarget {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return RULES.find(([re]) => re.test(path))?.[1] ?? { href: '/', label: 'Home' };
}

/** What a back button does: go back through history when there is any, otherwise up to the parent screen. */
export function backAction(canGoBack: boolean, pathname: string): { kind: 'back' } | { kind: 'replace'; to: BackTarget } {
  return canGoBack ? { kind: 'back' } : { kind: 'replace', to: parentRoute(pathname) };
}
