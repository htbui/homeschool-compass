import { Redirect, Stack } from 'expo-router';

import { useHeaderOptions } from '@/components/HeaderBack';
import { useStore } from '@/store/useStore';
import { useColors } from '@/ui';

/** Studio: where curricula are made, converted, and published. Grown-ups only: kid mode never shows it. */
export default function StudioLayout() {
  const c = useColors();
  const header = useHeaderOptions();
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);
  if (family && mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;
  return (
    <Stack screenOptions={{ headerShown: true, contentStyle: { backgroundColor: c.bg }, ...header }}>
      <Stack.Screen name="index" options={{ title: 'Freerange Studio' }} />
      <Stack.Screen name="setup" options={{ title: 'Creator profile' }} />
      <Stack.Screen name="new" options={{ title: 'New curriculum' }} />
      <Stack.Screen name="import" options={{ title: 'Import' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit curriculum' }} />
      <Stack.Screen name="promotions" options={{ title: 'Sales, bundles & coupons' }} />
      <Stack.Screen name="classes" options={{ title: 'Co-op classes' }} />
      <Stack.Screen name="class/[id]" options={{ title: 'Co-op class' }} />
      <Stack.Screen name="badge" options={{ title: 'Badges' }} />
    </Stack>
  );
}
