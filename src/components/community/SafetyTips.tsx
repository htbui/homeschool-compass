import { useState } from 'react';
import { View } from 'react-native';

import { MEETUP_SAFETY_TIPS } from '@/lib/community';
import { useStore } from '@/store/useStore';
import { Button, Card, Row, Sheet, space, Stack, T, useColors } from '@/ui';

/** Meetup safety tips. `onContinue` runs after "Got it" (for example the RSVP that opened them). */
export function SafetyTipsSheet({ visible, onClose, onContinue, continueLabel = 'Got it' }: { visible: boolean; onClose: () => void; onContinue?: () => void; continueLabel?: string }) {
  const c = useColors();
  return (
    <Sheet visible={visible} onClose={onClose} title="Before you meet up">
      <T muted>Most families you meet here are lovely. These habits keep first meetups easy and safe for everyone.</T>
      <Stack gap={space.sm}>
        {MEETUP_SAFETY_TIPS.map((t) => (
          <Row key={t.title} align="flex-start" gap={space.sm}>
            <T v="heading">{t.icon}</T>
            <View style={{ flex: 1 }}>
              <T v="label">{t.title}</T>
              <T v="caption">{t.body}</T>
            </View>
          </Row>
        ))}
      </Stack>
      <Card tint={c.surfaceAlt}>
        <T v="caption">A ✓ Verified badge means the Freerange team checked that family. It’s a good sign, not a guarantee, so keep these habits with everyone.</T>
      </Card>
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button
          title={continueLabel}
          onPress={() => {
            useStore.getState().markMeetupTipsSeen();
            onClose();
            onContinue?.();
          }}
        />
      </Row>
    </Sheet>
  );
}

/**
 * Show the safety tips before a family's first meetup. `beforeMeetup(fn)` runs
 * `fn` right away once the tips have been read, otherwise after "Got it".
 */
export function useMeetupTips() {
  const seen = useStore((s) => !!s.meetupTipsSeenAt);
  const [pending, setPending] = useState<{ run?: () => void; label?: string } | null>(null);
  const beforeMeetup = (run: () => void, label = 'Got it, RSVP') => (seen ? run() : setPending({ run, label }));
  const show = () => setPending({});
  const element = <SafetyTipsSheet visible={!!pending} onClose={() => setPending(null)} onContinue={pending?.run} continueLabel={pending?.label} />;
  return { beforeMeetup, show, element };
}
