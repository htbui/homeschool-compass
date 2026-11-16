import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, type HostInstance, type ScrollViewInstance } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { KidHelp } from '@/components/KidHelp';
import { KidPrintButton } from '@/components/KidPrint';
import { LessonCard } from '@/components/LessonMaterials';
import { MediaImage } from '@/components/MediaImage';
import { reveal } from '@/components/reveal';
import { ageOn, formatDate, todayKey } from '@/lib/dates';
import { canStartEarly, startEarlyBlocked } from '@/lib/kidRules';
import { subjectLabel } from '@/lib/subjects';
import { clockText, elapsedMs, isRunning, pomodoroDone, type TimerMode } from '@/lib/timer';
import { useStore } from '@/store/useStore';
import { pickPhoto } from '@/services/media';
import { speak } from '@/services/speech';
import { Button, Card, Chip, Field, Row, Screen, Segmented, space, Stack, T, useColors } from '@/ui';

const ASSESS = [
  { v: 1 as const, e: '😕', l: 'Tricky' },
  { v: 2 as const, e: '🙂', l: 'Got it' },
  { v: 3 as const, e: '🤩', l: 'Easy!' },
];

/** The Active Task interface: prompt, steps, focus timer, photo, help, reflection. */
export default function ActivityCard() {
  const c = useColors();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  // In a kid's session, only their own missions open (another kid's is "not found").
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId && (s.mode.kind !== 'kid' || t.childId === s.mode.childId)));
  const kid = useStore((s) => s.children.find((k) => k.id === task?.childId));
  const family = useStore((s) => s.family);
  const photos = useStore(useShallow((s) => s.evidence.filter((e) => e.taskId === taskId)));
  const { toggleStep, startTask, completeTask, addEvidence, startEarly, startTaskTimer, pauseTaskTimer, setTimerMode } = useStore.getState();

  const [finishing, setFinishing] = useState(false);
  const [assess, setAssess] = useState<1 | 2 | 3 | undefined>();
  const [reflection, setReflection] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  // The timer lives on the task (when it started + time banked before), so leaving this screen doesn't lose it.
  const timer = task?.timer;
  const running = isRunning(timer);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<ScrollViewInstance>(null);
  const finishRef = useRef<HostInstance>(null);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);

  // A finished Pomodoro stops itself, even if it ran out while the kid was on another screen.
  const focusDone = pomodoroDone(timer, now);
  const id = task?.id;
  useEffect(() => {
    if (running && focusDone && id) {
      pauseTaskTimer(id);
      speak('Great focus! Time for a 5 minute break.');
    }
  }, [running, focusDone, id, pauseTaskTimer]);

  const nonReader = kid ? ageOn(kid.birthdate) <= 6 : false;
  useEffect(() => {
    if (!finishing) return;
    // Bring "How did it go?" into view: on a phone it would otherwise open below the fold.
    const t = setTimeout(() => reveal(finishRef.current, scrollRef.current), 80);
    if (nonReader) speak('How did it go?');
    return () => clearTimeout(t);
  }, [finishing, nonReader]);

  if (!task || !kid) {
    return (
      <Screen>
        <T>Mission not found.</T>
        <Button title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const parentWord = family?.parentName.split(' ')[0] ?? 'your grown-up';
  // Back to the kid's day, even when this mission was opened from a link or after a reload.
  const toDay = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/kid/[id]', params: { id: kid.id } }));
  const timerMode: TimerMode = timer?.mode ?? 'stopwatch';
  const spent = elapsedMs(timer, now);
  const done = task.status === 'done';
  // Upcoming missions can be read and printed ahead of time; only solo ones can be started early.
  const upcoming = task.date > todayKey();
  const early = upcoming && canStartEarly(task, todayKey(), family);
  const blocked = upcoming && !early ? startEarlyBlocked(task, family) : undefined;

  const addPhoto = async (source: 'camera' | 'library') => {
    const uri = await pickPhoto(source);
    if (!uri) return;
    addEvidence({ childId: kid.id, date: task.date < todayKey() ? task.date : todayKey(), subject: task.subject, uri, note: task.title, taskId: task.id });
    startTask(task.id);
  };

  const finish = () => {
    // The store logs the timer's real minutes (it falls back to the planned length only if it never ran).
    completeTask(task.id, { selfAssessment: assess, reflection: reflection.trim() || undefined });
    setCelebrate(true);
    speak(`Woohoo! You finished ${task.title}!`);
    setTimeout(toDay, 1800);
  };

  if (celebrate) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, gap: space.lg, paddingTop: space.xxl * 2 }}>
          <Text style={{ fontSize: 96 }}>🌟</Text>
          <T v="display" style={{ textAlign: 'center' }}>Mission complete!</T>
          <T v="title">+{reflection.trim() ? 15 : 10} Sparks</T>
        </View>
      </Screen>
    );
  }

  const finishPanel = (
    <View ref={finishRef} collapsable={false} style={{ marginTop: space.lg }}>
      <Card>
        <Pressable onPress={() => speak('How did it go?')} accessibilityRole="button" accessibilityLabel="How did it go? Read aloud">
          <T v="heading">How did it go? {nonReader ? '🔊' : ''}</T>
        </Pressable>
        <Row wrap gap={space.sm}>
          {ASSESS.map((a) => (
            <Chip key={a.v} role="radio" label={`${a.e} ${a.l}`} selected={assess === a.v} onPress={() => { setAssess(a.v); if (nonReader) speak(a.l); }} />
          ))}
        </Row>
        {!nonReader ? <Field label="One thing I learned (+5 sparks)" value={reflection} onChangeText={setReflection} multiline example="Today I learned…" /> : null}
        <Button size="lg" title="Mark complete ✓" onPress={finish} />
      </Card>
    </View>
  );

  return (
    <Screen scrollRef={scrollRef}>
      <Row wrap style={{ justifyContent: 'space-between' }}>
        <Button kind="ghost" title="‹ My day" onPress={toDay} />
        <KidPrintButton tasks={[task]} childId={kid.id} kind="secondary" label="🖨️ Print worksheet" nonReader={nonReader} />
      </Row>
      {upcoming ? (
        <Card tint={c.accentSoft} style={{ marginTop: space.md }}>
          <T v="heading" color={c.accentInk}>📅 Planned for {formatDate(task.date, { weekday: 'long', month: 'long', day: 'numeric' })}</T>
          {early ? (
            <>
              <T color={c.accentInk}>It&apos;s planned for {formatDate(task.date, { weekday: 'long' })}, but you can get a head start! Starting now moves it to today.</T>
              <Button size="lg" title="Start it now 🚀" onPress={() => { startEarly(task.id); speak(`Great! Let's start ${task.title} now.`); }} />
            </>
          ) : (
            <T color={c.accentInk}>{blocked}</T>
          )}
        </Card>
      ) : !done ? (
        <View style={{ marginTop: space.md }}>
          <KidHelp kid={kid} taskId={task.id} />
        </View>
      ) : null}

      <Card style={{ alignItems: 'center', marginTop: space.md }}>
        <Text style={{ fontSize: nonReader ? 96 : 64 }}>{task.icon}</Text>
        <Pressable onPress={() => speak(task.title)} accessibilityRole="button" accessibilityLabel={`${task.title}. Read aloud`}>
          <T v="display" style={{ textAlign: 'center' }}>{task.title} {nonReader ? '🔊' : ''}</T>
        </Pressable>
        <T muted>{subjectLabel(task.subject)} · {task.durationMin} min{task.mode === 'parent' ? ` · with ${parentWord}` : task.mode === 'group' ? ' · with the family' : ''}</T>
      </Card>
      <LessonCard task={task} kid />

      {task.steps.length > 0 ? (
        <Stack gap={space.sm} style={{ marginTop: space.lg }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">Steps</T>
            <Button kind="ghost" size="sm" title="🔊 Read steps" onPress={() => speak(task.steps.map((s, i) => `Step ${i + 1}: ${s.label}.`).join(' '))} />
          </Row>
          {task.steps.map((s, i) => (
            <Pressable
              key={s.id}
              disabled={done || upcoming}
              onPress={() => toggleStep(task.id, s.id)}
              role="checkbox"
              aria-checked={s.done}
              accessibilityLabel={`Step ${i + 1}: ${s.label}`}
              style={({ pressed }) => ({ flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, minHeight: nonReader ? 72 : 56, borderRadius: 14, backgroundColor: s.done ? c.successSoft : c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.8 : 1 })}>
              {/* A clear box: dark 2 px border when empty, a big ✓ when done. */}
              <View style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 2, borderColor: s.done ? c.success : c.text, backgroundColor: s.done ? c.success : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                {s.done ? <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900', lineHeight: 26 }}>✓</Text> : null}
              </View>
              <T v={nonReader ? 'title' : 'body'} style={{ flex: 1, textDecorationLine: s.done ? 'line-through' : 'none' }}>{s.label}</T>
            </Pressable>
          ))}
        </Stack>
      ) : null}

      {!done && !upcoming && !finishing ? (
        <Card style={{ marginTop: space.lg, alignItems: 'center' }}>
          <Segmented<TimerMode>
            value={timerMode}
            onChange={(m) => m !== timerMode && setTimerMode(task.id, m)}
            options={[
              { value: 'stopwatch', label: '⏱️ Timer' },
              { value: 'pomodoro', label: '🍅 Focus 25' },
            ]}
          />
          <Text accessibilityLabel={`Timer ${clockText(timer, now)}${running ? ', running' : ''}`} style={{ fontSize: 56, fontVariant: ['tabular-nums'], fontWeight: '800', color: c.text }}>{clockText(timer, now)}</Text>
          {focusDone ? <T color={c.successInk}>🍅 25 minutes of focus! Take a 5 minute break.</T> : null}
          <Row>
            <Button
              title={running ? 'Pause' : spent ? 'Resume' : 'Start'}
              kind={running ? 'secondary' : 'primary'}
              disabled={!running && focusDone}
              onPress={() => (running ? pauseTaskTimer(task.id) : startTaskTimer(task.id))}
            />
          </Row>
          <T v="caption" muted>The timer keeps going if you check your day.</T>
        </Card>
      ) : null}

      {finishing && !done && !upcoming ? finishPanel : null}

      {upcoming ? null : <Card style={{ marginTop: space.lg }}>
        <T v="heading">📸 Show your work</T>
        <T v="caption" muted>Snap a photo of a worksheet, drawing, or project — it goes in your portfolio.</T>
        <Row wrap gap={space.sm}>
          {photos.map((p) => (
            <MediaImage key={p.id} uri={p.uri} remotePath={p.remotePath} style={{ width: 96, height: 96, borderRadius: 10 }} />
          ))}
        </Row>
        <Row wrap>
          <Button kind="secondary" icon="📷" title="Camera" onPress={() => addPhoto('camera')} />
          <Button kind="secondary" icon="🖼️" title="Photos" onPress={() => addPhoto('library')} />
        </Row>
      </Card>}

      {upcoming ? null : done ? (
        <Card tint={c.successSoft} style={{ marginTop: space.lg, alignItems: 'center' }}>
          <T v="title">✅ Completed</T>
          {task.reflection ? <T>💭 “{task.reflection}”</T> : null}
        </Card>
      ) : finishing ? null : (
        <Button size="lg" title="I'm done! ✓" style={{ marginTop: space.lg }} onPress={() => { pauseTaskTimer(task.id); setFinishing(true); }} />
      )}
    </Screen>
  );
}
