import { router } from 'expo-router';
import { View } from 'react-native';

import { useDraft } from '@/store/onboardingDraft';
import { demoWorkspace } from '@/store/seed';
import { useStore } from '@/store/useStore';
import { Button, Card, Row, Screen, space, Stack, T, useColors } from '@/ui';

const PILLARS = [
  { icon: '👨‍👩‍👧‍👦', title: 'Multi-kid synchrony', body: 'Group subjects together, stagger 1-on-1 time so no one waits.' },
  { icon: '⚖️', title: 'Legal peace of mind', body: 'Your state\'s rules, hours, NOI letters, and portfolio in one place.' },
  { icon: '🧭', title: 'Your homeschool style', body: 'A 3-minute quiz matches you to a philosophy and a daily rhythm.' },
  { icon: '⭐', title: 'Kids run their own day', body: 'Age-tailored mission cards, timers, and an "I need help" button.' },
];

export default function Welcome() {
  const c = useColors();
  const reset = useDraft((s) => s.reset);
  const completeOnboarding = useStore((s) => s.completeOnboarding);

  const startDemo = () => {
    completeOnboarding(demoWorkspace());
    router.replace('/today');
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingTop: space.xxl, gap: space.md }}>
        <View style={{ width: 84, height: 84, borderRadius: 28, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontSize: 44 }}>🧭</T>
        </View>
        <T v="display" style={{ textAlign: 'center' }}>Welcome to Kinship</T>
        <T muted style={{ textAlign: 'center', maxWidth: 480 }}>
          The homeschool operating system for families teaching several kids at several paces.
        </T>
      </View>

      <Row wrap gap={space.md} style={{ marginTop: space.xxl, justifyContent: 'center' }} align="stretch">
        {PILLARS.map((p) => (
          <Card key={p.title} style={{ width: 250, flexGrow: 1 }}>
            <T style={{ fontSize: 28 }}>{p.icon}</T>
            <T v="heading">{p.title}</T>
            <T muted>{p.body}</T>
          </Card>
        ))}
      </Row>

      <Stack style={{ marginTop: space.xxl, alignSelf: 'center', width: '100%', maxWidth: 420 }}>
        <Button
          size="lg"
          title="Set up my family"
          onPress={() => {
            reset();
            router.push('/onboarding/family');
          }}
        />
        <Button size="lg" kind="secondary" title="Explore with a demo family" onPress={startDemo} />
        <T v="caption" muted style={{ textAlign: 'center' }}>
          Your data stays on this device until you choose to sync.
        </T>
      </Stack>
    </Screen>
  );
}
