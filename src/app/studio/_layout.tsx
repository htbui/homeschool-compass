import { Stack } from 'expo-router';

import { useColors } from '@/ui';

/** Studio: where curricula are made, converted, and published. */
export default function StudioLayout() {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerShown: true, contentStyle: { backgroundColor: c.bg }, headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text }}>
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
