import { useState } from 'react';
import { View } from 'react-native';

import { ageOn, todayKey } from '@/lib/dates';
import { uid } from '@/lib/id';
import type { Child, LearningDifference } from '@/lib/types';
import { AVATARS, KID_COLORS } from '@/store/seed';
import { Button, Chip, Field, Row, space, Stack, T } from '@/ui';

const DIFFS: { value: LearningDifference; label: string }[] = [
  { value: 'adhd', label: 'ADHD' },
  { value: 'dyslexia', label: 'Dyslexia' },
  { value: 'dysgraphia', label: 'Dysgraphia' },
  { value: 'dyscalculia', label: 'Dyscalculia' },
  { value: 'autism', label: 'Autism' },
  { value: 'gifted', label: 'Gifted' },
  { value: '2e', label: '2E' },
  { value: 'speech', label: 'Speech' },
];

const SOLO = [5, 10, 15, 25, 45, 60];
export const GRADES = ['Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade', '9th Grade', '10th Grade', '11th Grade', '12th Grade'];

export function gradeForAge(age: number) {
  return GRADES[Math.max(0, Math.min(GRADES.length - 1, age - 4))];
}

export function ChildForm({ initial, index, onSave, onCancel }: { initial?: Child; index: number; onSave: (c: Child) => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? '');
  const [grade, setGrade] = useState(initial?.grade ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? AVATARS[index % AVATARS.length]);
  const [diffs, setDiffs] = useState<LearningDifference[]>(initial?.learningDifferences ?? []);
  const [passions, setPassions] = useState((initial?.passions ?? []).join(', '));
  const [solo, setSolo] = useState(initial?.soloToleranceMin ?? 15);
  const [pin, setPin] = useState(initial?.pin ?? '');

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(birthdate) && !Number.isNaN(Date.parse(birthdate)) && birthdate < todayKey();
  const age = validDate ? ageOn(birthdate) : undefined;
  const ok = name.trim() && validDate && (pin === '' || /^\d{4}$/.test(pin));

  return (
    <Stack gap={space.lg}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Maya" />
      <Field
        label="Birthdate"
        placeholder="YYYY-MM-DD"
        value={birthdate}
        onChangeText={(v) => {
          setBirthdate(v);
          if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !grade) setGrade(gradeForAge(ageOn(v)));
        }}
        hint={age !== undefined ? `Age ${age}` : 'Format: 2017-05-21'}
        keyboardType="numbers-and-punctuation"
      />
      <View style={{ gap: 6 }}>
        <T v="label">Grade level</T>
        <Row wrap gap={6}>
          {GRADES.map((g) => (
            <Chip key={g} label={g} selected={grade === g} onPress={() => setGrade(g)} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <T v="label">Avatar</T>
        <Row wrap gap={6}>
          {AVATARS.map((a) => (
            <Chip key={a} label={a} selected={avatar === a} onPress={() => setAvatar(a)} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <T v="label">Learning differences (optional)</T>
        <Row wrap gap={6}>
          {DIFFS.map((d) => (
            <Chip key={d.value} label={d.label} selected={diffs.includes(d.value)} onPress={() => setDiffs(diffs.includes(d.value) ? diffs.filter((x) => x !== d.value) : [...diffs, d.value])} />
          ))}
        </Row>
      </View>
      <Field label="Passions" placeholder="dinosaurs, robotics, creative writing" value={passions} onChangeText={setPassions} />
      <View style={{ gap: 6 }}>
        <T v="label">Can work solo for about…</T>
        <Row wrap gap={6}>
          {SOLO.map((m) => (
            <Chip key={m} label={`${m} min`} selected={solo === m} onPress={() => setSolo(m)} />
          ))}
        </Row>
      </View>
      <Field label="Kid PIN (optional)" hint="4 digits. Leave blank for tap-your-avatar login." keyboardType="number-pad" maxLength={4} value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} />
      <Row style={{ justifyContent: 'flex-end' }}>
        {onCancel ? <Button title="Cancel" kind="secondary" onPress={onCancel} /> : null}
        <Button
          title={initial ? 'Save' : 'Add child'}
          disabled={!ok}
          onPress={() =>
            onSave({
              id: initial?.id ?? uid('k'),
              name: name.trim(),
              birthdate,
              grade: grade || gradeForAge(age ?? 6),
              avatar,
              color: initial?.color ?? KID_COLORS[index % KID_COLORS.length],
              learningDifferences: diffs,
              passions: passions.split(',').map((p) => p.trim()).filter(Boolean),
              soloToleranceMin: solo,
              sparks: initial?.sparks ?? 0,
              pin: pin || undefined,
            })
          }
        />
      </Row>
    </Stack>
  );
}
