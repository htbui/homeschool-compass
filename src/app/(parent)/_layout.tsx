import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';

import { selectOpenHelp, useStore } from '@/store/useStore';
import { useColors } from '@/ui';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'today', title: 'Today', icon: 'sunny-outline' },
  { name: 'schedule', title: 'Rhythm', icon: 'calendar-outline' },
  { name: 'learn', title: 'Curriculum', icon: 'library-outline' },
  { name: 'market', title: 'Market', icon: 'storefront-outline' },
  { name: 'compliance', title: 'Compass', icon: 'compass-outline' },
  { name: 'community', title: 'Community', icon: 'people-outline' },
];

export default function ParentTabs() {
  const c = useColors();
  const { width } = useWindowDimensions();
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
        // On web the default 49px bar clips label descenders; native adds safe-area insets itself.
        tabBarStyle: { backgroundColor: c.surface, borderColor: c.border, ...(wide ? { width: 220 } : Platform.OS === 'web' ? { height: 56 } : {}) },
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarLabelPosition: wide ? 'beside-icon' : 'below-icon',
        // Six tabs: keep labels whole on narrow phones.
        tabBarLabelStyle: wide ? undefined : { fontSize: 10, lineHeight: 13, letterSpacing: -0.2 },
        tabBarItemStyle: wide ? undefined : { paddingHorizontal: 0 },
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
