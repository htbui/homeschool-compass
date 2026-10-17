import { Redirect, Stack } from 'expo-router';

import { useStore } from '@/store/useStore';
import { useColors } from '@/ui';

export default function KidLayout() {
  const c = useColors();
  const family = useStore((s) => s.family);
  if (!family) return <Redirect href="/onboarding" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, gestureEnabled: false }} />;
}
