import { Redirect } from 'expo-router';

import { useStore } from '@/store/useStore';

/** Entry point: route to onboarding, the locked kid view, or the parent deck. */
export default function Index() {
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);

  if (!family) return <Redirect href="/onboarding" />;
  if (mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;
  return <Redirect href="/today" />;
}
