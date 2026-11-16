import { router } from 'expo-router';
import { View } from 'react-native';

import { isPlannedDay, nextPlannedDay } from '@/lib/agenda';
import { todayKey } from '@/lib/dates';
import { cloudEnabled } from '@/services/cloud';
import { enterStudio } from '@/services/studioMode';
import { useDraft } from '@/store/onboardingDraft';
import { demoWorkspace } from '@/store/seed';
import { useStore } from '@/store/useStore';
import { Button, Screen, space, Stack, T, useColors } from '@/ui';

// Short enough that both buttons fit on a phone screen without scrolling.
const PILLARS = [
  { icon: '👨‍👩‍👧‍👦', title: 'Several kids, one plan', body: 'Stagger 1-on-1 time so no one waits.' },
  { icon: '⚖️', title: 'Legal peace of mind', body: 'Your state’s rules, hours, and letters.' },
  { icon: '🧭', title: 'Your style', body: 'A 3-minute quiz picks a daily rhythm.' },
  { icon: '⭐', title: 'Kids run their day', body: 'Mission cards, timers, a help button.' },
];

export default function Welcome() {
  const c = useColors();
  const reset = useDraft((s) => s.reset);
  const completeOnboarding = useStore((s) => s.completeOnboarding);

  const startDemo = () => {
    const demo = demoWorkspace();
    completeOnboarding(demo);
    // On a weekend or day off, open on the demo family's next school day so the plan shows.
    const today = todayKey();
    const day = isPlannedDay(today, demo.blocks ?? [], demo.tasks ?? []) ? undefined : nextPlannedDay(today, demo.blocks ?? [], demo.tasks ?? []);
    router.replace(day ? { pathname: '/today', params: { date: day } } : '/today');
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingTop: space.lg, gap: space.sm }}>
        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontSize: 34 }}>🧭</T>
        </View>
        <T v="display" style={{ textAlign: 'center' }}>Welcome to Freerange</T>
        <T muted style={{ textAlign: 'center', maxWidth: 480 }}>
          The homeschool operating system for families teaching several kids at several paces.
        </T>
      </View>

      <View style={{ marginTop: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 720 }}>
        {PILLARS.map((p) => (
          <View key={p.title} style={{ flexBasis: '45%', flexGrow: 1, minWidth: 150, flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.sm, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <T style={{ fontSize: 22 }}>{p.icon}</T>
            <View style={{ flex: 1 }}>
              <T v="label">{p.title}</T>
              <T v="caption" muted>{p.body}</T>
            </View>
          </View>
        ))}
      </View>

      <Stack style={{ marginTop: space.lg, alignSelf: 'center', width: '100%', maxWidth: 420 }}>
        <Button
          size="lg"
          title="Set up my family"
          onPress={() => {
            reset();
            router.push('/onboarding/family');
          }}
        />
        <Button size="lg" kind="secondary" title="Explore with a demo family" onPress={startDemo} />
        <Button kind="secondary" icon="🎨" title="Curriculum Creator Studio" onPress={enterStudio} />
        {cloudEnabled ? <Button kind="ghost" title="Already use Freerange? Sign in" onPress={() => router.push('/account')} /> : null}
        <T v="caption" muted style={{ textAlign: 'center' }}>
          Your data stays on this device until you choose to sync.
        </T>
      </Stack>
    </Screen>
  );
}
