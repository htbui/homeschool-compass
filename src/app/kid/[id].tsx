import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { KidHelp } from '@/components/KidHelp';
import { KidPrintButton } from '@/components/KidPrint';
import { PinPad } from '@/components/PinPad';
import { helpSentText, MISSION_STATUS_TEXT, missionLabel, missionStatus } from '@/lib/kidRules';
import { timerBadge } from '@/lib/timer';
import { addDays, ageOn, formatClock, formatDate, isDateKey, relativeDayLabel, stepDay, toMinutes, todayKey, weekdayOf } from '@/lib/dates';
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
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const id = params.id;
  const today = todayKey();
  // The day being viewed: today by default; kids can step to past and upcoming days.
  const date = isDateKey(params.date) ? params.date : today;
  const isToday = date === today;
  const isFuture = date > today;
  const kid = useStore((s) => s.children.find((k) => k.id === id));
  const kids = useStore((s) => s.children);
  const family = useStore((s) => s.family);
  const allTasks = useStore((s) => s.tasks);
  const mood = useStore((s) => s.moods.find((m) => m.childId === id && m.date === today));
  const openHelp = useStore((s) => s.help.find((h) => h.childId === id && !h.resolvedAt));
  // A kid's session only opens their own day: another kid's (PIN-protected) day goes through the picker.
  const otherKid = useStore((s) => (s.mode.kind === 'kid' && s.mode.childId !== id ? s.mode.childId : undefined));
  const { ensureTasks, setMood, setMode, withdrawHelp } = useStore.getState();
  const [helpOpen, setHelpOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  useEffect(() => {
    // Plan today and upcoming days from the rhythm. Past days show what actually happened.
    if (date >= today) ensureTasks(date);
  }, [date, today, ensureTasks]);

  const tasks = allTasks.filter((t) => t.childId === id && t.date === date && t.status !== 'skipped').sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  // Running mission timers show on their cards ("⏱ 12 min"), so keep the minutes fresh.
  const [now, setNow] = useState(() => Date.now());
  const timing = tasks.some((t) => t.timer?.startedAt);
  useEffect(() => {
    if (!timing) return;
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(tick);
  }, [timing]);

  // Navigable days: school days (or any day this child has work) from when the
  // family started, up to three weeks ahead within the school year.
  const kidDates = allTasks.filter((t) => t.childId === id && t.status !== 'skipped').map((t) => t.date);
  const earliest = [family?.createdAt.slice(0, 10) ?? today, ...kidDates].sort()[0];
  const horizon = addDays(today, 21);
  const latest = family && family.schoolYearEnd >= today && family.schoolYearEnd < horizon ? family.schoolYearEnd : horizon;
  const kidDateSet = new Set(kidDates);
  const isOpen = (d: string) => d >= earliest && d <= latest && (kidDateSet.has(d) || (family?.schoolDays ?? [1, 2, 3, 4, 5]).includes(weekdayOf(d)));
  const prevDay = stepDay(date, -1, isOpen);
  const nextDay = stepDay(date, 1, isOpen);
  const goDay = (d: string) => router.setParams({ date: d === today ? undefined : d });

  if (otherKid) return <Redirect href={{ pathname: '/kid/[id]', params: { id: otherKid } }} />;

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
  const dayWord = relativeDayLabel(date, today);
  const dayName = formatDate(date, { weekday: 'long' });

  const companions = (groupKey?: string) =>
    groupKey
      ? allTasks
          .filter((t) => t.groupKey === groupKey && t.childId !== kid.id)
          .map((t) => kids.find((k) => k.id === t.childId)?.name)
          .filter(Boolean)
          .join(' & ')
      : '';

  if (!mood && isToday) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xxl }}>
          <Text style={{ fontSize: 80 }}>{kid.avatar}</Text>
          <T v="display" style={{ textAlign: 'center' }}>{greet}, {kid.name}!</T>
          <Pressable onPress={() => speak(`${greet}, ${kid.name}! How are you feeling today?`)} accessibilityRole="button" accessibilityLabel="How are you feeling today? Read aloud">
            <T v="title" style={{ textAlign: 'center' }}>How are you feeling today? {nonReader ? '🔊' : ''}</T>
          </Pressable>
          <Row wrap gap={space.md} style={{ justifyContent: 'center' }}>
            {MOODS.map((m) => (
              <Pressable
                key={m.v}
                onPress={() => setMood({ childId: kid.id, date: today, mood: m.v })}
                accessibilityRole="button"
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
        </Row>
      </Card>
      {isToday ? (
        <View style={{ marginTop: space.md }}>
          <KidHelp kid={kid} taskId={current?.id} onAsked={() => setHelpOpen(true)} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg }}>
        <Button kind="secondary" size="lg" title="‹" accessibilityLabel="Previous day" disabled={!prevDay} onPress={() => prevDay && goDay(prevDay)} />
        <Pressable onPress={() => speak(isToday ? `Today is ${dayName}` : `${dayWord}`)} style={{ flex: 1, alignItems: 'center' }}>
          <T v="title" style={{ textAlign: 'center' }}>{isToday ? `Today · ${dayName}` : dayWord}</T>
          <T v="caption" muted>{formatDate(date, { month: 'long', day: 'numeric' })}{isFuture ? ' · coming up' : !isToday ? ' · looking back' : ''}</T>
        </Pressable>
        <Button kind="secondary" size="lg" title="›" accessibilityLabel="Next day" disabled={!nextDay} onPress={() => nextDay && goDay(nextDay)} />
      </View>
      {!isToday ? (
        <Row style={{ justifyContent: 'center', marginTop: space.sm }}>
          <Button kind="ghost" size="sm" title="↩ Back to today" onPress={() => goDay(today)} />
        </Row>
      ) : null}

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="heading" style={{ flexShrink: 1 }}>
            {nonReader
              ? isFuture ? `🗺️ ${dayName}` : '🗺️ My day'
              : isFuture
                ? `Coming up ${isToday ? 'today' : dayWord === 'Tomorrow' ? 'tomorrow' : `on ${dayName}`} (${tasks.length} mission${tasks.length === 1 ? '' : 's'})`
                : `${isToday ? 'Your missions today' : `${dayWord}'s missions`} (${done} of ${tasks.length} done)`}
          </T>
          <Row gap={4}>
            {nonReader ? <Button kind="ghost" size="sm" title="🔊 Read to me" onPress={() => speak(isFuture ? `On ${dayName} you will do ${tasks.length} things. ${tasks.map((t) => t.title).join(', ')}.` : `You have ${tasks.length - done} things to do. ${current ? `Next is ${current.title}.` : ''}`)} /> : null}
            <KidPrintButton tasks={tasks} childId={kid.id} label="🖨️ Print my day" title={`${kid.name}'s day · ${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}`} nonReader={nonReader} />
          </Row>
        </Row>
        <Progress value={tasks.length ? done / tasks.length : 0} color={c.accent} height={12} />
      </View>

      {allDone && !isFuture ? (
        <Card tint={c.successSoft} style={{ marginTop: space.lg, alignItems: 'center' }}>
          <Text style={{ fontSize: 64 }}>🎉🏆🎉</Text>
          <T v="display" style={{ textAlign: 'center' }}>{isToday ? 'Day complete!' : `${dayWord}: all done!`}</T>
          <T style={{ textAlign: 'center' }}>
            You finished {tasks.length} mission{tasks.length === 1 ? '' : 's'} and spent about {Math.round(tasks.reduce((a, t) => a + (t.minutesSpent || t.durationMin), 0))} minutes learning. Amazing work, {kid.name}!
          </T>
        </Card>
      ) : null}

      <Stack gap={space.md} style={{ marginTop: space.lg }}>
        {tasks.length === 0 ? (
          <Card>
            <T>{isToday ? 'No missions today — enjoy a free day! 🌈' : isFuture ? `Nothing planned for ${dayName} yet. 🌈` : `No missions were recorded for ${dayName}.`}</T>
            {isToday && nextDay && nextDay > today ? (
              <Button kind="secondary" title={`See ${relativeDayLabel(nextDay, today) === 'Tomorrow' ? 'tomorrow' : formatDate(nextDay, { weekday: 'long' })}’s missions ›`} onPress={() => goDay(nextDay)} />
            ) : null}
          </Card>
        ) : null}
        {tasks.map((t, i) => {
          const isCurrent = isToday && current?.id === t.id;
          const isDone = t.status === 'done';
          const withWho = companions(t.groupKey);
          const status = missionStatus(t, { current: isCurrent, isToday, isFuture, today, family });
          const badge = isDone ? undefined : timerBadge(t.timer, now);
          const who = t.mode === 'parent' ? `with ${parentWord}` : withWho ? `with ${withWho}` : '';
          return (
            // The read-aloud button sits beside the card, not inside it (a button can't hold a button).
            <View key={t.id} style={{ justifyContent: 'center' }}>
            <Pressable
              onPress={() => router.push({ pathname: '/kid/task/[taskId]', params: { taskId: t.id } })}
              accessibilityRole="button"
              accessibilityLabel={missionLabel(i + 1, t.title, formatClock(t.start), status, [who, badge?.replace(/^\S+ /, 'timer ')].filter(Boolean).join(', '))}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: nonReader ? space.lg : space.md,
                paddingRight: nonReader ? 76 : space.md,
                minHeight: nonReader ? 88 : 64,
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
                  {who ? ` · ${who}` : ''}
                </T>
                {badge ? <T v="label" color={c.accentInk}>{badge}</T> : null}
              </View>
              {!nonReader && MISSION_STATUS_TEXT[status] ? (
                <View style={{ borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: isDone ? c.successSoft : isCurrent ? c.accentSoft : c.surfaceAlt, borderWidth: 1, borderColor: isDone ? c.success : isCurrent ? c.accent : c.border }}>
                  <T v="label" color={isDone ? c.successInk : isCurrent ? c.accentInk : c.text}>{MISSION_STATUS_TEXT[status]}</T>
                </View>
              ) : null}
            </Pressable>
            {nonReader ? (
              <Pressable onPress={() => speak(t.title)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Read ${t.title} aloud`} style={{ position: 'absolute', right: space.md, minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 28 }}>🔊</Text>
              </Pressable>
            ) : null}
            </View>
          );
        })}
      </Stack>

      <Row style={{ justifyContent: 'center', marginTop: space.xxl }} gap={space.md}>
        <Button kind="ghost" title="Switch kid" onPress={() => router.replace('/kid')} />
        <Button kind="ghost" title="Grown-up exit 🔒" onPress={() => setExitOpen(true)} />
      </Row>

      <Sheet visible={helpOpen} onClose={() => setHelpOpen(false)} title={helpSentText(parentWord)}>
        <T>{parentWord} knows you need help{current ? ` with “${current.title}”` : ''} and will come as soon as they can.</T>
        {filler ? (
          <Card tint={c.accentSoft}>
            <T v="label" color={c.accentInk}>While you wait, try:</T>
            <T v="heading" color={c.accentInk}>{filler.icon} {filler.title}</T>
            <Button title="Start it" onPress={() => { setHelpOpen(false); router.push({ pathname: '/kid/task/[taskId]', params: { taskId: filler.id } }); }} />
          </Card>
        ) : (
          <T muted>While you wait, read a book quietly or tidy your space. 📚</T>
        )}
        <Row wrap style={{ justifyContent: 'flex-end' }}>
          {openHelp ? <Button kind="secondary" title="I figured it out ✓" onPress={() => { withdrawHelp(kid.id); setHelpOpen(false); }} /> : null}
          <Button title="OK" onPress={() => setHelpOpen(false)} />
        </Row>
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
