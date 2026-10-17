import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PinPad } from '@/components/PinPad';
import { ageOn, formatClock, toMinutes, todayKey } from '@/lib/dates';
import { suggestWhileWaiting } from '@/lib/schedule';
import { useStore } from '@/store/useStore';
import { speak } from '@/services/speech';
import { Button, Card, Progress, Row, Screen, Sheet, space, Stack, T, useColors } from '@/ui';

const MOODS = [
  { v: 1, e: '😢', l: 'Sad' },
  { v: 2, e: '😕', l: 'Meh' },
  { v: 3, e: '🙂', l: 'Okay' },
  { v: 4, e: '😄', l: 'Happy' },
  { v: 5, e: '🤩', l: 'Super!' },
] as const;

export default function DailyAdventure() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = todayKey();
  const kid = useStore((s) => s.children.find((k) => k.id === id));
  const kids = useStore((s) => s.children);
  const family = useStore((s) => s.family);
  const allTasks = useStore((s) => s.tasks);
  const mood = useStore((s) => s.moods.find((m) => m.childId === id && m.date === today));
  const openHelp = useStore((s) => s.help.find((h) => h.childId === id && !h.resolvedAt));
  const { ensureTasks, setMood, requestHelp, setMode } = useStore.getState();
  const [helpOpen, setHelpOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  useEffect(() => {
    ensureTasks(today);
  }, [today, ensureTasks]);

  const tasks = allTasks.filter((t) => t.childId === id && t.date === today && t.status !== 'skipped').sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  if (!kid) {
    return (
      <Screen>
        <T>That learner was not found.</T>
        <Button title="Back" onPress={() => router.replace('/kid')} />
      </Screen>
    );
  }

  const age = ageOn(kid.birthdate);
  const nonReader = age <= 6;
  const done = tasks.filter((t) => t.status === 'done').length;
  const allDone = tasks.length > 0 && done === tasks.length;
  const current = tasks.find((t) => t.status === 'in_progress') ?? tasks.find((t) => t.status === 'todo');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetEmoji = hour < 17 ? '☀️' : '🌙';
  const parentWord = family?.parentName.split(' ')[0] ?? 'your grown-up';
  const filler = suggestWhileWaiting(allTasks.filter((t) => t.date === today), kid.id, current?.id);

  const companions = (groupKey?: string) =>
    groupKey
      ? allTasks
          .filter((t) => t.groupKey === groupKey && t.childId !== kid.id)
          .map((t) => kids.find((k) => k.id === t.childId)?.name)
          .filter(Boolean)
          .join(' & ')
      : '';

  if (!mood) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xxl }}>
          <Text style={{ fontSize: 80 }}>{kid.avatar}</Text>
          <T v="display" style={{ textAlign: 'center' }}>{greet}, {kid.name}!</T>
          <Pressable onPress={() => speak(`${greet}, ${kid.name}! How are you feeling today?`)}>
            <T v="title" style={{ textAlign: 'center' }}>How are you feeling today? {nonReader ? '🔊' : ''}</T>
          </Pressable>
          <Row wrap gap={space.md} style={{ justifyContent: 'center' }}>
            {MOODS.map((m) => (
              <Pressable
                key={m.v}
                onPress={() => setMood({ childId: kid.id, date: today, mood: m.v })}
                accessibilityLabel={m.l}
                style={({ pressed }) => ({ alignItems: 'center', padding: space.md, borderRadius: 20, backgroundColor: pressed ? c.primarySoft : c.surface, borderWidth: 1, borderColor: c.border, width: 96 })}>
                <Text style={{ fontSize: 48 }}>{m.e}</Text>
                <T v="label">{m.l}</T>
              </Pressable>
            ))}
          </Row>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card tint={c.primarySoft}>
        <Row wrap style={{ justifyContent: 'space-between' }} gap={space.md}>
          <Row>
            <Text style={{ fontSize: 44 }}>{kid.avatar}</Text>
            <View>
              <T v="title">{greetEmoji} {greet}, {kid.name}!</T>
              <T v="label">⭐ {kid.sparks} Sparks earned</T>
            </View>
          </Row>
          <Button
            kind={openHelp ? 'secondary' : 'accent'}
            size="lg"
            title={openHelp ? `${parentWord} is coming ✋` : `Ask ${parentWord} for help ✋`}
            onPress={() => {
              if (!openHelp) requestHelp(kid.id, current?.id);
              setHelpOpen(true);
            }}
          />
        </Row>
      </Card>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="heading">{nonReader ? '🗺️ My day' : `Your missions today (${done} of ${tasks.length} done)`}</T>
          {nonReader ? <Button kind="ghost" size="sm" title="🔊 Read to me" onPress={() => speak(`You have ${tasks.length - done} things to do today. ${current ? `Next is ${current.title}.` : ''}`)} /> : null}
        </Row>
        <Progress value={tasks.length ? done / tasks.length : 0} color={c.accent} height={12} />
      </View>

      {allDone ? (
        <Card tint={c.successSoft} style={{ marginTop: space.lg, alignItems: 'center' }}>
          <Text style={{ fontSize: 64 }}>🎉🏆🎉</Text>
          <T v="display" style={{ textAlign: 'center' }}>Day complete!</T>
          <T style={{ textAlign: 'center' }}>
            You finished {tasks.length} mission{tasks.length === 1 ? '' : 's'} and spent about {Math.round(tasks.reduce((a, t) => a + (t.minutesSpent || t.durationMin), 0))} minutes learning. Amazing work, {kid.name}!
          </T>
        </Card>
      ) : null}

      <Stack gap={space.md} style={{ marginTop: space.lg }}>
        {tasks.length === 0 ? <Card><T>No missions today — enjoy a free day! 🌈</T></Card> : null}
        {tasks.map((t, i) => {
          const isCurrent = current?.id === t.id;
          const isDone = t.status === 'done';
          const withWho = companions(t.groupKey);
          return (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: '/kid/task/[taskId]', params: { taskId: t.id } })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: nonReader ? space.lg : space.md,
                borderRadius: 18,
                borderWidth: isCurrent ? 3 : 1,
                borderColor: isCurrent ? c.accent : c.border,
                backgroundColor: isDone ? c.successSoft : c.surface,
                opacity: pressed ? 0.85 : 1,
              })}>
              <Text style={{ fontSize: nonReader ? 48 : 30 }}>{isDone ? '✅' : t.icon}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <T v={nonReader ? 'title' : 'heading'} style={isDone ? { textDecorationLine: 'line-through' } : undefined}>
                  {nonReader ? '' : `${i + 1}. `}{t.title}
                </T>
                <T v="caption" muted>
                  {formatClock(t.start)} · {t.durationMin} min
                  {t.mode === 'parent' ? ` · with ${parentWord}` : ''}
                  {withWho ? ` · with ${withWho}` : ''}
                </T>
              </View>
              {nonReader ? (
                <Pressable onPress={() => speak(t.title)} hitSlop={10} accessibilityLabel={`Read ${t.title} aloud`}>
                  <Text style={{ fontSize: 28 }}>🔊</Text>
                </Pressable>
              ) : (
                <T v="label" color={isDone ? c.success : isCurrent ? c.accent : c.textMuted}>{isDone ? 'COMPLETED' : t.status === 'in_progress' ? 'IN PROGRESS' : isCurrent ? 'UP NEXT' : ''}</T>
              )}
            </Pressable>
          );
        })}
      </Stack>

      <Row style={{ justifyContent: 'center', marginTop: space.xxl }} gap={space.md}>
        <Button kind="ghost" title="Switch kid" onPress={() => router.replace('/kid')} />
        <Button kind="ghost" title="Grown-up exit 🔒" onPress={() => setExitOpen(true)} />
      </Row>

      <Sheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="Help is on the way ✋">
        <T>
          {parentWord} knows you need help{current ? ` with “${current.title}”` : ''}. They&apos;re helping someone else right now and will come as soon as they can.
        </T>
        {filler ? (
          <Card tint={c.accentSoft}>
            <T v="label">While you wait, try:</T>
            <T v="heading">{filler.icon} {filler.title}</T>
            <Button title="Start it" onPress={() => { setHelpOpen(false); router.push({ pathname: '/kid/task/[taskId]', params: { taskId: filler.id } }); }} />
          </Card>
        ) : (
          <T muted>While you wait, read a book quietly or tidy your space. 📚</T>
        )}
        <Button kind="secondary" title="OK" onPress={() => setHelpOpen(false)} />
      </Sheet>

      <Sheet visible={exitOpen} onClose={() => setExitOpen(false)} title="Grown-ups only">
        <PinPad
          prompt="Parent PIN"
          expected={family?.parentPin ?? ''}
          onSuccess={() => {
            setExitOpen(false);
            setMode({ kind: 'parent' });
            router.replace('/today');
          }}
        />
      </Sheet>
    </Screen>
  );
}
