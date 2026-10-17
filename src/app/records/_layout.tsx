import { Redirect, Stack } from 'expo-router';

import { useStore } from '@/store/useStore';
import { useColors } from '@/ui';

export default function RecordsLayout() {
  const c = useColors();
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);
  if (!family) return <Redirect href="/onboarding" />;
  if (mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.bg },
        headerBackTitle: 'Compass',
      }}>
      <Stack.Screen name="noi" options={{ title: 'Notice of Intent' }} />
      <Stack.Screen name="hours" options={{ title: 'Hours & Attendance' }} />
      <Stack.Screen name="portfolio" options={{ title: 'Portfolio Vault' }} />
      <Stack.Screen name="expenses" options={{ title: 'ESA & Expenses' }} />
    </Stack>
  );
}
