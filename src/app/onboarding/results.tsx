import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { RhythmPreview } from '@/components/RhythmPreview';
import { StepHeader } from '@/components/StepHeader';
import { SwitchRow } from '@/components/SwitchRow';
import { DIMENSION_POLES, FAMILY_INTERESTS, FAMILY_VALUES, leanHeadline, PHILOSOPHY_INFO } from '@/lib/quiz';
import { CURRICULUM_SUGGESTIONS, recommendRhythm } from '@/lib/recommend';
import type { QuizDimension } from '@/lib/types';
import { useDraft } from '@/store/onboardingDraft';
import { defaultSchoolYear } from '@/store/seed';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, Empty, Progress, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';


export default function Results() {
  const c = useColors();
  const d = useDraft();
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const updateFamily = useStore((s) => s.updateFamily);
  const [withRhythm, setWithRhythm] = useState(true);
  // Sharing lesson insights is a choice made here, off until the parent turns it on.
  const [shareInsights, setShareInsights] = useState(false);
  const result = d.result;
  const primary = result?.breakdown[0]?.philosophy;
  const rhythm = useMemo(() => recommendRhythm(d.children, primary), [d.children, primary]);

  if (!result) return <Screen><Empty icon="🧭" title="Take the quiz first" action={<Button title="Go to quiz" onPress={() => router.replace('/onboarding/quiz')} />} /></Screen>;

  const info = primary ? PHILOSOPHY_INFO[primary] : undefined;
  const headline = leanHeadline(result);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const saveRetake = () => {
    updateFamily({ philosophy: result, values: d.values, interests: d.interests });
    d.reset();
    router.replace('/settings');
  };

  const finish = () => {
    const { start, end } = defaultSchoolYear();
    completeOnboarding({
      family: {
        familyName: d.familyName.trim(),
        parentName: d.parentName.trim(),
        parentPin: d.parentPin,
        stateCode: d.stateCode,
        zip: d.zip,
        philosophy: result,
        values: d.values,
        interests: d.interests,
        schoolYearStart: start,
        schoolYearEnd: end,
        schoolDays: [1, 2, 3, 4, 5],
        flexDay: 5,
        insightsOptOut: !shareInsights,
        createdAt: new Date().toISOString(),
      },
      children: d.children,
      blocks: withRhythm ? rhythm : [],
    });
    d.reset();
    router.replace('/today');
  };

  return (
    <Screen>
      <StepHeader step={4} total={4} title="Your homeschool style" onBack={d.retake ? () => router.replace('/settings') : undefined} />
      <Card tint={c.primarySoft}>
        <T style={{ fontSize: 40 }}>{info?.emoji ?? '🧭'}</T>
        <T v="title">{headline.lead}</T>
        {headline.touch ? <T v="heading" muted>{headline.touch}</T> : null}
        {info ? <T>{info.summary}</T> : null}
        {info ? (
          <View style={{ marginTop: space.sm, gap: 4 }}>
            <T v="label">A typical day</T>
            <T muted>{info.typicalDay}</T>
          </View>
        ) : null}
      </Card>

      <Section title="Compatibility breakdown">
        <Stack gap={space.sm}>
          {result.breakdown.map((b) => (
            <View key={b.philosophy} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="label">{PHILOSOPHY_INFO[b.philosophy].emoji} {PHILOSOPHY_INFO[b.philosophy].label}</T>
                <T v="label">{b.percent}%</T>
              </Row>
              <Progress value={b.percent / 100} />
            </View>
          ))}
        </Stack>
      </Section>

      <Section title="Your five dimensions">
        <Stack gap={space.md}>
          {(Object.keys(DIMENSION_POLES) as QuizDimension[]).map((k) => (
            <View key={k} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="caption" muted>{DIMENSION_POLES[k][0]}</T>
                <T v="caption" muted>{DIMENSION_POLES[k][1]}</T>
              </Row>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt }}>
                <View style={{ position: 'absolute', left: `${((result.dimensions[k] + 1) / 2) * 100}%`, top: -4, width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: c.accent }} />
              </View>
            </View>
          ))}
        </Stack>
      </Section>

      <Section title="Family values" subtitle="Optional: pick any that fit. They tailor recommendations and community matches.">
        <Row wrap gap={6}>
          {FAMILY_VALUES.map((v) => (
            <Chip key={v} label={v} selected={d.values.includes(v)} onPress={() => d.set({ values: toggle(d.values, v) })} />
          ))}
        </Row>
      </Section>
      <Section title="Core interests" subtitle="Optional: pick any that fit.">
        <Row wrap gap={6}>
          {FAMILY_INTERESTS.map((v) => (
            <Chip key={v} label={v} selected={d.interests.includes(v)} onPress={() => d.set({ interests: toggle(d.interests, v) })} />
          ))}
        </Row>
      </Section>

      {primary ? (
        <Section title="Curricula families like yours use">
          <Row wrap gap={6}>
            {CURRICULUM_SUGGESTIONS[primary].map((s) => (
              <Chip key={s} label={s} />
            ))}
          </Row>
        </Section>
      ) : null}

      {d.retake ? (
        <>
          <T muted style={{ marginTop: space.xl }}>Your weekly rhythm stays as it is. Change it any time on the Plan tab.</T>
          <Button size="lg" title="Save my style" onPress={saveRetake} style={{ marginTop: space.md }} />
        </>
      ) : (
        <>
          <Section title="Recommended daily rhythm" subtitle="1-on-1 lessons are staggered so only one child needs you at a time.">
            <SwitchRow label="Start with this daily rhythm" body={withRhythm ? 'You can edit it anytime.' : 'You’ll start with an empty week and build your own.'} value={withRhythm} onChange={setWithRhythm} />
            {withRhythm ? <RhythmPreview blocks={rhythm} kids={d.children} /> : null}
          </Section>

          <Section title="Help curriculum creators?">
            <SwitchRow
              label="Share anonymous lesson insights"
              body="When you use a Marketplace curriculum, its creator learns how lessons went (finished or skipped, time taken, marked tricky) as totals from 5+ families. Never names, ages, or who your kids are. Change it any time in Settings."
              value={shareInsights}
              onChange={setShareInsights}
            />
          </Section>

          <Button size="lg" title="Start homeschooling with Freerange" onPress={finish} style={{ marginTop: space.xxl }} />
        </>
      )}
    </Screen>
  );
}
