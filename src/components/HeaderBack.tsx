import { router, useCanGoBack, usePathname } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { backAction, parentRoute } from '@/lib/nav';
import { fonts, useColors } from '@/ui';

/** Go back, or up to the parent screen when this one was opened from a link (no history). */
export function goBackOr(pathname: string, canGoBack = router.canGoBack()) {
  const a = backAction(canGoBack, pathname);
  if (a.kind === 'back') router.back();
  else router.replace(a.to.href);
}

/**
 * Header back button for every pushed screen. Shared links (a listing, a gift, a storefront)
 * often open with no history, so it then reads "‹ Marketplace" and goes there instead of nowhere.
 */
export function HeaderBack() {
  const c = useColors();
  const pathname = usePathname();
  const canGoBack = useCanGoBack();
  const label = canGoBack ? 'Back' : parentRoute(pathname).label;
  return (
    <Pressable
      onPress={() => goBackOr(pathname, canGoBack)}
      accessibilityRole="button"
      accessibilityLabel={canGoBack ? 'Back' : `Back to ${label}`}
      style={({ pressed }) => ({ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingRight: 8, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600', fontFamily: fonts.body }}>‹ {label}</Text>
    </Pressable>
  );
}

/** Header options shared by every stack, so pushed screens look like the rest of the app (C-27). */
export function useHeaderOptions() {
  const c = useColors();
  return {
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.text,
    headerShadowVisible: false,
    headerTitleStyle: { fontFamily: fonts.display, fontWeight: '700' as const },
    headerLeft: () => <HeaderBack />,
  };
}
