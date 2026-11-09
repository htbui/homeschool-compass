import { Redirect } from 'expo-router';

import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';

/** Entry point: route to onboarding, Studio, the locked kid view, or the parent deck. */
export default function Index() {
  const family = useStore((s) => s.family);
  const mode = useStore((s) => s.mode);
  const studio = useStudio((s) => s.active);
  const creator = useStudio((s) => !!s.profile);

  // A kid's locked session always wins; then a creator's Studio.
  if (family && mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;
  if (studio || (!family && creator)) return <Redirect href="/studio" />;
  if (!family) return <Redirect href="/onboarding" />;
  if (mode.kind === 'kid') return <Redirect href={{ pathname: '/kid/[id]', params: { id: mode.childId } }} />;
  return <Redirect href="/today" />;
}
