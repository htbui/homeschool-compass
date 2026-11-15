import { Pill, useColors } from '@/ui';

/** Shown next to families the Freerange team has verified. */
export function VerifiedBadge() {
  const c = useColors();
  return <Pill text="✓ Verified family" bg={c.successSoft} fg={c.success} />;
}
