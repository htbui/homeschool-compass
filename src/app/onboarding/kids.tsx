import { router } from 'expo-router';
import { useState } from 'react';

import { ChildForm } from '@/components/ChildForm';
import { StepHeader } from '@/components/StepHeader';
import { ageOn } from '@/lib/dates';
import type { Child } from '@/lib/types';
import { useDraft } from '@/store/onboardingDraft';
import { Button, Card, Row, Screen, Sheet, space, Stack, T } from '@/ui';

export default function KidsStep() {
  const { children, set } = useDraft();
  const [editing, setEditing] = useState<Child | 'new' | null>(children.length ? null : 'new');

  const save = (c: Child) => {
    set({ children: children.some((x) => x.id === c.id) ? children.map((x) => (x.id === c.id ? c : x)) : [...children, c] });
    setEditing(null);
  };

  return (
    <Screen>
      <StepHeader step={2} total={4} title="Your learners" subtitle="Ages, passions, and how long each can work solo shape the daily rhythm." />
      <Stack>
        {children.map((c) => (
          <Card key={c.id} onPress={() => setEditing(c)}>
            <Row>
              <T style={{ fontSize: 34 }}>{c.avatar}</T>
              <Stack gap={2} style={{ flex: 1 }}>
                <T v="heading">{c.name}</T>
                <T muted>
                  Age {ageOn(c.birthdate)} · {c.grade} · solo ~{c.soloToleranceMin} min
                </T>
                {c.passions.length ? <T v="caption" muted>Loves {c.passions.join(', ')}</T> : null}
              </Stack>
              <T v="caption" muted>Edit</T>
            </Row>
          </Card>
        ))}
        <Button kind="secondary" icon="＋" title="Add a child" onPress={() => setEditing('new')} />
        <Button size="lg" title="Continue to style quiz" disabled={children.length === 0} onPress={() => router.push('/onboarding/quiz')} style={{ marginTop: space.lg }} />
      </Stack>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a child' : 'Edit child'}>
        {editing !== null ? (
          <ChildForm initial={editing === 'new' ? undefined : editing} index={children.length} onSave={save} onCancel={() => setEditing(null)} />
        ) : null}
      </Sheet>
    </Screen>
  );
}
