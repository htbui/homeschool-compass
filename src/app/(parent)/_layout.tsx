import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { Platform, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { selectOpenHelp, useStore } from '@/store/useStore';
import { useColors } from '@/ui';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'today', title: 'Today', icon: 'sunny-outline' },
  { name: 'schedule', title: 'Rhythm', icon: 'calendar-outline' },
  { name: 'learn', title: 'My Curriculum', icon: 'library-outline' },
  { name: 'market', title: 'Marketplace', icon: 'storefront-outline' },
  { name: 'compliance', title: 'Compass', icon: 'compass-outline' },
  { name: 'community', title: 'Community', icon: 'people-outline' },
];

/** Shrink a narrow tab's label just enough that its longest word fits on one line. */
function labelSize(label: string, screenWidth: number): number {
  const longest = Math.max(...label.split(' ').map((w) => w.length));
  const room = screenWidth / TABS.length - 6;
  return Math.max(8, Math.min(10, Math.floor((room / (longest * 0.58)) * 2) / 2));
}

export default function ParentTabs() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);
  const helpCount = useStore((s) => selectOpenHelp(s).length);
  const wide = width >= 900;

  // Parent area is locked while a kid is using the device.
  if (!family) return <Redirect href="/onboarding" />;
  if (mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        // Narrow screens: labels may wrap to two lines ("My / Curriculum"), so the bar is a little taller.
        tabBarStyle: { backgroundColor: c.surface, borderColor: c.border, ...(wide ? { width: 220 } : { height: (Platform.OS === 'web' ? 66 : 62) + insets.bottom }) },
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarLabelPosition: wide ? 'beside-icon' : 'below-icon',
        // Six tabs: keep labels whole on narrow phones by wrapping instead of truncating.
        tabBarLabel: wide
          ? undefined
          : ({ color, children }) => (
              <Text numberOfLines={2} style={{ color, fontSize: labelSize(children, width), lineHeight: 12, letterSpacing: -0.2, textAlign: 'center', marginTop: 2 }}>
                {children}
              </Text>
            ),
        tabBarItemStyle: wide ? undefined : { paddingHorizontal: 0, paddingTop: 4, paddingBottom: Math.max(4, insets.bottom ? 0 : 6) },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color as string} size={size} />,
            tabBarBadge: t.name === 'today' && helpCount > 0 ? helpCount : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}
