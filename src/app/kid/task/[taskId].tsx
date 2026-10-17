import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { ageOn, todayKey } from '@/lib/dates';
import { subjectLabel } from '@/lib/subjects';
import { useStore } from '@/store/useStore';
import { pickPhoto } from '@/services/media';
import { speak } from '@/services/speech';
import { Button, Card, Chip, Field, Row, Screen, Segmented, space, Stack, T, useColors } from '@/ui';

const ASSESS = [
  { v: 1 as const, e: '😕', l: 'Tricky' },
  { v: 2 as const, e: '🙂', l: 'Got it' },
  { v: 3 as const, e: '🤩', l: 'Easy!' },
];

type TimerMode = 'stopwatch' | 'pomodoro';

/** The Active Task interface: prompt, steps, focus timer, photo, help, reflection. */
export default function ActivityCard() {
  const c = useColors();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const kid = useStore((s) => s.children.find((k) => k.id === task?.childId));
  const family = useStore((s) => s.family);
  const photos = useStore(useShallow((s) => s.evidence.filter((e) => e.taskId === taskId)));
  const openHelp = useStore((s) => s.help.find((h) => h.childId === task?.childId && !h.resolvedAt));
  const { toggleStep, startTask, completeTask, requestHelp, addEvidence } = useStore.getState();

  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<TimerMode>('stopwatch');
  const [finishing, setFinishing] = useState(false);
  const [assess, setAssess] = useState<1 | 2 | 3 | undefined>();
  const [reflection, setReflection] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) tick.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  const POMODORO = 25 * 60;
  useEffect(() => {
    if (timerMode === 'pomodoro' && elapsed >= POMODORO && running) {
      setRunning(false);
      speak('Great focus! Time for a 5 minute break.');
    }
  }, [elapsed, timerMode, running, POMODORO]);

  if (!task || !kid) {
    return (
      <Screen>
        <T>Mission not found.</T>
        <Button title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const nonReader = ageOn(kid.birthdate) <= 6;
  const parentWord = family?.parentName.split(' ')[0] ?? 'your grown-up';
  const shown = timerMode === 'pomodoro' ? Math.max(0, POMODORO - elapsed) : elapsed;
  const mm = String(Math.floor(shown / 60)).padStart(2, '0');
  const ss = String(shown % 60).padStart(2, '0');
  const done = task.status === 'done';

  const addPhoto = async (source: 'camera' | 'library') => {
    const uri = await pickPhoto(source);
    if (!uri) return;
    addEvidence({ childId: kid.id, date: todayKey(), subject: task.subject, uri, note: task.title, taskId: task.id });
    startTask(task.id);
  };

  const finish = () => {
    setRunning(false);
    const minutes = Math.round(elapsed / 60);
    completeTask(task.id, { minutesSpent: minutes > 0 ? minutes : undefined, selfAssessment: assess, reflection: reflection.trim() || undefined });
    setCelebrate(true);
    speak(`Woohoo! You finished ${task.title}!`);
    setTimeout(() => router.back(), 1800);
  };

  if (celebrate) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, gap: space.lg, paddingTop: space.xxl * 2 }}>
          <Text style={{ fontSize: 96 }}>🌟</Text>
          <T v="display" style={{ textAlign: 'center' }}>Mission complete!</T>
          <T v="title">+{reflection ? 15 : 10} Sparks</T>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button kind="ghost" title="‹ My day" onPress={() => router.back()} />
        <Button
          kind={openHelp ? 'secondary' : 'accent'}
          size="sm"
          title={openHelp ? `${parentWord} is coming` : 'Need help ✋'}
          disabled={!!openHelp}
          onPress={() => requestHelp(kid.id, task.id)}
        />
      </Row>

      <Card style={{ alignItems: 'center', marginTop: space.md }}>
        <Text style={{ fontSize: nonReader ? 96 : 64 }}>{task.icon}</Text>
        <Pressable onPress={() => speak(task.title)}>
          <T v="display" style={{ textAlign: 'center' }}>{task.title} {nonReader ? '🔊' : ''}</T>
        </Pressable>
        <T muted>{subjectLabel(task.subject)} · {task.durationMin} min{task.mode === 'parent' ? ` · with ${parentWord}` : task.mode === 'group' ? ' · with the family' : ''}</T>
      </Card>

      {task.steps.length > 0 ? (
        <Stack gap={space.sm} style={{ marginTop: space.lg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">Steps</T>
            <Button kind="ghost" size="sm" title="🔊 Read steps" onPress={() => speak(task.steps.map((s, i) => `Step ${i + 1}: ${s.label}.`).join(' '))} />
          </Row>
          {task.steps.map((s) => (
            <Pressable
              key={s.id}
              disabled={done}
              onPress={() => toggleStep(task.id, s.id)}
              style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, borderRadius: 14, backgroundColor: s.done ? c.successSoft : c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontSize: 26 }}>{s.done ? '✅' : '⬜️'}</Text>
              <T v={nonReader ? 'title' : 'body'} style={{ flex: 1 }}>{s.label}</T>
            </Pressable>
          ))}
        </Stack>
      ) : null}

      {!done ? (
        <Card style={{ marginTop: space.lg, alignItems: 'center' }}>
          <Segmented<TimerMode>
            value={timerMode}
            onChange={(m) => {
              setTimerMode(m);
              setElapsed(0);
              setRunning(false);
            }}
            options={[
              { value: 'stopwatch', label: '⏱️ Timer' },
              { value: 'pomodoro', label: '🍅 Focus 25' },
            ]}
          />
          <Text style={{ fontSize: 56, fontVariant: ['tabular-nums'], fontWeight: '800', color: c.text }}>{mm}:{ss}</Text>
          <Row>
            <Button
              title={running ? 'Pause' : elapsed ? 'Resume' : 'Start'}
              kind={running ? 'secondary' : 'primary'}
              onPress={() => {
                setRunning(!running);
                startTask(task.id);
              }}
            />
          </Row>
        </Card>
      ) : null}

      <Card style={{ marginTop: space.lg }}>
        <T v="heading">📸 Show your work</T>
        <T v="caption" muted>Snap a photo of a worksheet, drawing, or project — it goes in your portfolio.</T>
        <Row wrap gap={space.sm}>
          {photos.map((p) => (
            <Image key={p.id} source={{ uri: p.uri }} style={{ width: 96, height: 96, borderRadius: 10 }} />
          ))}
        </Row>
        <Row wrap>
          <Button kind="secondary" icon="📷" title="Camera" onPress={() => addPhoto('camera')} />
          <Button kind="secondary" icon="🖼️" title="Photos" onPress={() => addPhoto('library')} />
        </Row>
      </Card>

      {done ? (
        <Card tint={c.successSoft} style={{ marginTop: space.lg, alignItems: 'center' }}>
          <T v="title">✅ Completed</T>
          {task.reflection ? <T>💭 “{task.reflection}”</T> : null}
        </Card>
      ) : finishing ? (
        <Card style={{ marginTop: space.lg }}>
          <T v="heading">How did it go?</T>
          <Row wrap gap={space.sm}>
            {ASSESS.map((a) => (
              <Chip key={a.v} label={`${a.e} ${a.l}`} selected={assess === a.v} onPress={() => setAssess(a.v)} />
            ))}
          </Row>
          {!nonReader ? <Field label="One thing I learned (+5 sparks)" value={reflection} onChangeText={setReflection} multiline placeholder="Today I learned…" /> : null}
          <Button size="lg" title="Mark complete ✓" onPress={finish} />
        </Card>
      ) : (
        <Button size="lg" title="I'm done! ✓" style={{ marginTop: space.lg }} onPress={() => setFinishing(true)} />
      )}
    </Screen>
  );
}
