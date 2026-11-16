import { View } from 'react-native';

import { ageOn } from '@/lib/dates';
import { helpSentText } from '@/lib/kidRules';
import type { Child, ID } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { speak } from '@/services/speech';
import { Button, space, T, useColors } from '@/ui';

/**
 * The kid's help button, the same big button on their day and on a mission. Once asked it
 * says the grown-up got the message, and "I figured it out" takes the request back so the
 * parent's queue doesn't fill with stale requests.
 */
export function KidHelp({ kid, taskId, onAsked }: { kid: Child; taskId?: ID; onAsked?: () => void }) {
  const c = useColors();
  const family = useStore((s) => s.family);
  const open = useStore((s) => s.help.find((h) => h.childId === kid.id && !h.resolvedAt));
  const { requestHelp, withdrawHelp } = useStore.getState();
  const grownUp = family?.parentName.split(' ')[0] || 'your grown-up';
  const nonReader = ageOn(kid.birthdate) <= 6;

  if (!open) {
    return (
      <Button
        kind="accent"
        size="lg"
        title={`Ask ${grownUp} for help ✋`}
        onPress={() => {
          requestHelp(kid.id, taskId);
          if (nonReader) speak(helpSentText(grownUp));
          onAsked?.();
        }}
      />
    );
  }
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: space.sm, padding: space.md, borderRadius: 16, backgroundColor: c.accentSoft }}>
      <T v="heading" color={c.accentInk}>{helpSentText(grownUp)}</T>
      <T v="caption" color={c.accentInk}>They&apos;ll come as soon as they can.</T>
      <Button
        kind="secondary"
        size="lg"
        title="I figured it out ✓"
        onPress={() => {
          withdrawHelp(kid.id);
          if (nonReader) speak('Great job figuring it out!');
        }}
      />
    </View>
  );
}
