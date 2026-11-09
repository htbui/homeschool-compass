import { Stack } from 'expo-router';

import { useColors } from '@/ui';

/** Studio: where curricula are made, converted, and published. */
export default function StudioLayout() {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerShown: true, contentStyle: { backgroundColor: c.bg }, headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text }}>
      <Stack.Screen name="index" options={{ title: 'Kinship Studio' }} />
      <Stack.Screen name="setup" options={{ title: 'Creator profile' }} />
      <Stack.Screen name="new" options={{ title: 'New curriculum' }} />
      <Stack.Screen name="import" options={{ title: 'Import' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit curriculum' }} />
    </Stack>
  );
}
