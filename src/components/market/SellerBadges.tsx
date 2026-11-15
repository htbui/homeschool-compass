import { useState } from 'react';
import { Pressable } from 'react-native';

import { ESA_EXPLAINER, stateList, VERIFIED_EXPLAINER, VERIFIED_LABEL } from '@/lib/creators';
import { Pill, Sheet, T, useColors } from '@/ui';

/** "✓ Verified creator": tap it to see what Freerange checked. Cards pass `plain` (the card itself is the button). */
export function VerifiedBadge({ plain }: { plain?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const pill = <Pill text={VERIFIED_LABEL} bg={c.successSoft} fg={c.success} />;
  if (plain) return pill;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="What verified creator means" accessibilityHint={VERIFIED_EXPLAINER}>
        {pill}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={VERIFIED_LABEL}>
        <T>{VERIFIED_EXPLAINER}</T>
        <T v="caption" muted>Creators apply from Freerange Studio. Sellers can’t give themselves this badge.</T>
      </Sheet>
    </>
  );
}

/** Approved ESA vendor, with the states; tap for what that does and doesn't mean. */
export function EsaBadge({ states, homeState }: { states?: string[]; homeState?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const yours = !!homeState && !!states?.includes(homeState);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="What approved ESA vendor means">
        <Pill text={`🏛️ ESA vendor${states?.length ? `: ${[...states].sort().join(', ')}` : ''}${yours ? ' · your state' : ''}`} bg={c.primarySoft} fg={c.text} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="🏛️ Approved ESA vendor">
        {states?.length ? <T v="label">Approved in {stateList(states)}.</T> : null}
        <T>{ESA_EXPLAINER}</T>
      </Sheet>
    </>
  );
}
