import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { StepHeader } from '@/components/StepHeader';
import { QUIZ, scoreQuiz } from '@/lib/quiz';
import { useDraft } from '@/store/onboardingDraft';
import { Button, Progress, Row, Screen, space, Stack, T, useColors } from '@/ui';

export default function QuizStep() {
  const c = useColors();
  const { answers, set } = useDraft();
  const [i, setI] = useState(() => Math.min(Object.keys(answers).length, QUIZ.length - 1));
  const q = QUIZ[i];

  const choose = (idx: number) => {
    const next = { ...answers, [q.id]: idx };
    set({ answers: next });
    if (i < QUIZ.length - 1) setI(i + 1);
    else {
      set({ result: scoreQuiz(next) });
      router.push('/onboarding/results');
    }
  };

  return (
    <Screen>
      <StepHeader step={3} total={4} title="Homeschool style quiz" subtitle="15 quick questions. There are no wrong answers." />
      <Stack gap={space.lg}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="label" muted>Question {i + 1} of {QUIZ.length}</T>
          <T v="caption" muted>~{Math.max(1, Math.round(((QUIZ.length - i) * 12) / 60))} min left</T>
        </Row>
        <Progress value={(i + 1) / QUIZ.length} color={c.accent} height={6} />
        <T v="title">{q.prompt}</T>
        <Stack gap={space.sm}>
          {q.options.map((o, idx) => {
            const picked = answers[q.id] === idx;
            return (
              <Pressable
                key={o.label}
                onPress={() => choose(idx)}
                style={({ pressed }) => ({
                  borderWidth: 2,
                  borderColor: picked ? c.primary : c.border,
                  backgroundColor: picked ? c.primarySoft : c.surface,
                  borderRadius: 14,
                  padding: space.lg,
                  opacity: pressed ? 0.85 : 1,
                })}>
                <T>{o.label}</T>
              </Pressable>
            );
          })}
        </Stack>
        <Row style={{ justifyContent: 'space-between' }}>
          <Button kind="ghost" title="‹ Previous" disabled={i === 0} onPress={() => setI(i - 1)} />
          {answers[q.id] !== undefined && i < QUIZ.length - 1 ? <Button kind="ghost" title="Next ›" onPress={() => setI(i + 1)} /> : null}
        </Row>
      </Stack>
    </Screen>
  );
}
