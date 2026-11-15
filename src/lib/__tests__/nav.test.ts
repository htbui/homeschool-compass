import { describe, expect, it } from 'vitest';

import { backAction, parentRoute } from '@/lib/nav';

describe('parentRoute (back from a deep link)', () => {
  it.each([
    ['/listing/abc', '/market', 'Marketplace'],
    ['/bundle/b1', '/market', 'Marketplace'],
    ['/creator/c-9', '/market', 'Marketplace'],
    ['/gift/ABCD2345', '/market', 'Marketplace'],
    ['/coop/XYZ', '/community', 'Community'],
    ['/studio', '/today', 'Today'],
    ['/studio/', '/today', 'Today'],
    ['/studio/pkg-1', '/studio', 'Studio'],
    ['/studio/import', '/studio', 'Studio'],
    ['/studio/badge', '/studio', 'Studio'],
    ['/studio/promotions', '/studio', 'Studio'],
    ['/studio/class/k1', '/studio/classes', 'Co-op classes'],
    ['/records/noi', '/compliance', 'Compass'],
    ['/messages/fam-2', '/messages', 'Messages'],
    ['/messages', '/community', 'Community'],
    ['/account', '/settings', 'Settings'],
    ['/settings', '/today', 'Today'],
    ['/notifications', '/today', 'Today'],
    ['/moderation', '/today', 'Today'],
  ])('%s → %s', (path, href, label) => {
    expect(parentRoute(path)).toEqual({ href, label });
  });

  it('ignores query strings, hashes and trailing slashes', () => {
    expect(parentRoute('/listing/abc?from=share#top').href).toBe('/market');
    expect(parentRoute('/account/').href).toBe('/settings');
  });

  it('falls back to home for anything else', () => {
    expect(parentRoute('/somewhere/else')).toEqual({ href: '/', label: 'Home' });
    expect(parentRoute('')).toEqual({ href: '/', label: 'Home' });
  });
});

describe('backAction', () => {
  it('goes back through history when there is any', () => {
    expect(backAction(true, '/listing/abc')).toEqual({ kind: 'back' });
  });
  it('goes up to the parent screen when opened from a link', () => {
    expect(backAction(false, '/listing/abc')).toEqual({ kind: 'replace', to: { href: '/market', label: 'Marketplace' } });
  });
});
