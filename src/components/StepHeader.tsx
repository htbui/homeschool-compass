import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Progress, Row, space, T, useColors } from '@/ui';

/** Progress header for the onboarding steps. */
export function StepHeader({ step, total, title, subtitle }: { step: number; total: number; title: string; subtitle?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: space.md, marginBottom: space.xl }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding'))} hitSlop={10}>
          <T v="label" color={c.primary}>‹ Back</T>
        </Pressable>
        <T v="caption" muted>Step {step} of {total}</T>
      </Row>
      <Progress value={step / total} />
      <T v="display">{title}</T>
      {subtitle ? <T muted>{subtitle}</T> : null}
    </View>
  );
}
