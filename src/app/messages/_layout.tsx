import { Redirect, Stack } from 'expo-router';

import { useInboxLive } from '@/services/inbox';
import { useStore } from '@/store/useStore';
import { useColors } from '@/ui';

/** Messages are for parents only: kid mode never shows them. */
export default function MessagesLayout() {
  const c = useColors();
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);
  useInboxLive(!!family && mode.kind === 'parent');
  if (!family) return <Redirect href="/onboarding" />;
  if (mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.bg },
        headerBackTitle: 'Back',
      }}>
      <Stack.Screen name="index" options={{ title: 'Messages' }} />
      <Stack.Screen name="[familyId]" options={{ title: 'Conversation', headerBackTitle: 'Messages' }} />
    </Stack>
  );
}
