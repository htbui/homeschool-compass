import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, Text, View } from 'react-native';

import { cloudEnabled } from '@/services/cloud';
import { selectOpenHelp, useStore } from '@/store/useStore';
import { fonts, space, useColors } from '@/ui';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * The parent's five sections. "Plan" is the weekly rhythm and the curricula together
 * (two routes, one tab), so every label fits on one line on a phone.
 */
export const PARENT_TABS: { key: string; title: string; icon: IconName; routes: string[] }[] = [
  { key: 'today', title: 'Today', icon: 'sunny-outline', routes: ['today'] },
  { key: 'plan', title: 'Plan', icon: 'calendar-outline', routes: ['schedule', 'learn'] },
  { key: 'market', title: 'Marketplace', icon: 'storefront-outline', routes: ['market'] },
  { key: 'compliance', title: 'Compass', icon: 'compass-outline', routes: ['compliance'] },
  { key: 'community', title: 'Community', icon: 'people-outline', routes: ['community'] },
];

/** Which tab a route belongs to. */
export const tabForRoute = (name: string) => PARENT_TABS.find((t) => t.routes.includes(name));

/**
 * Bottom bar on phones; on wide screens a slim sidebar with the family's name on top and
 * Settings, Account and Kid mode at the bottom.
 */
export function ParentTabBar({ state, descriptors, emitter, navigateToTab, insets, wide }: BottomTabBarProps & { wide: boolean }) {
  const c = useColors();
  const familyName = useStore((s) => s.family?.familyName);
  const helpCount = useStore((s) => selectOpenHelp(s).length);
  const focusedName = state.routes[state.index]?.name;
  const focusedTab = tabForRoute(focusedName)?.key;

  const go = (tabKey: string) => {
    const tab = PARENT_TABS.find((t) => t.key === tabKey)!;
    // Plan opens where the parent last was inside it (the week, or the curricula).
    const target = tab.routes.includes(focusedName) ? state.routes.find((r) => r.name === focusedName) : state.routes.find((r) => r.name === tab.routes[0]);
    if (!target) return;
    const event = emitter.emit({ type: 'tabPress', target: target.key, canPreventDefault: true });
    if (focusedTab !== tabKey && !event.defaultPrevented) navigateToTab(target.key);
  };

  const items = PARENT_TABS.filter((t) => t.routes.some((r) => state.routes.some((x) => x.name === r && descriptors[x.key]))).map((t) => {
    const on = focusedTab === t.key;
    const badge = t.key === 'today' && helpCount > 0 ? helpCount : undefined;
    const color = on ? c.primary : c.textMuted;
    return (
      <Pressable
        key={t.key}
        role="tab"
        aria-selected={on}
        accessibilityLabel={badge ? `${t.title}, ${badge} waiting for help` : t.title}
        onPress={() => go(t.key)}
        style={({ pressed }) => ({
          flex: wide ? undefined : 1,
          flexDirection: wide ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: wide ? 'flex-start' : 'center',
          gap: wide ? space.md : 2,
          minHeight: wide ? 44 : 52,
          paddingHorizontal: wide ? space.md : 0,
          paddingVertical: wide ? 8 : 6,
          borderRadius: wide ? 12 : 0,
          backgroundColor: wide && on ? c.primarySoft : 'transparent',
          opacity: pressed ? 0.75 : 1,
        })}>
        <View>
          <Ionicons name={t.icon} size={wide ? 22 : 24} color={color} />
          {badge ? (
            <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={{ color, fontSize: wide ? 15 : 11, fontWeight: on ? '700' : '600', fontFamily: fonts.body, letterSpacing: wide ? 0 : -0.1 }}>
          {t.title}
        </Text>
      </Pressable>
    );
  });

  if (!wide) {
    return (
      <View role="tablist" style={{ flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.border, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 4 : 0) }}>
        {items}
      </View>
    );
  }

  const footer: { label: string; icon: IconName; go: () => void }[] = [
    { label: 'Settings', icon: 'settings-outline', go: () => router.push('/settings') },
    ...(cloudEnabled ? [{ label: 'Account & sync', icon: 'cloud-outline' as IconName, go: () => router.push('/account') }] : []),
    { label: 'Kid mode', icon: 'happy-outline', go: () => router.push('/kid') },
  ];
  return (
    <View style={{ width: 240, backgroundColor: c.surface, borderRightWidth: 1, borderColor: c.border, paddingTop: Math.max(insets.top, space.lg), paddingBottom: Math.max(insets.bottom, space.lg), paddingHorizontal: space.sm, justifyContent: 'space-between' }}>
      <View style={{ gap: space.xs }}>
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, gap: 2 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, fontFamily: fonts.body }}>🧭 Freerange</Text>
          <Text numberOfLines={2} style={{ color: c.text, fontSize: 17, fontWeight: '800', fontFamily: fonts.display }}>{familyName ?? 'Your family'}</Text>
        </View>
        <View role="tablist" style={{ gap: 2 }}>{items}</View>
      </View>
      <View style={{ gap: 2, borderTopWidth: 1, borderColor: c.border, paddingTop: space.sm }}>
        {footer.map((f) => (
          <Pressable key={f.label} onPress={f.go} accessibilityRole="link" accessibilityLabel={f.label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, paddingHorizontal: space.md, borderRadius: 12, opacity: pressed ? 0.75 : 1 })}>
            <Ionicons name={f.icon} size={20} color={c.textMuted} />
            <Text style={{ color: c.text, fontSize: 14, fontFamily: fonts.body }}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
