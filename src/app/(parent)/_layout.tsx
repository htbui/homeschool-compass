import { Redirect, Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { ParentTabBar, tabForRoute } from '@/components/ParentTabBar';
import { useCoopSync } from '@/hooks/useCoopSync';
import { useInboxLive } from '@/services/inbox';
import { useStore } from '@/store/useStore';
import { useColors } from '@/ui';

const ROUTES = ['today', 'schedule', 'learn', 'market', 'compliance', 'community'];

export default function ParentTabs() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);
  const wide = width >= 900;
  useCoopSync();
  // Messages and moderators' decisions stay live while a parent is here (never in kid mode).
  useInboxLive(!!family && mode.kind === 'parent');

  // Parent area is locked while a kid is using the device.
  if (!family) return <Redirect href="/onboarding" />;
  if (mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;

  return (
    <Tabs
      // Five tabs with one-word labels; the weekly rhythm and the curricula share "Plan".
      tabBar={(props) => <ParentTabBar {...props} wide={wide} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: c.bg },
      }}>
      {ROUTES.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ title: tabForRoute(name)?.title ?? name }} />
      ))}
    </Tabs>
  );
}
