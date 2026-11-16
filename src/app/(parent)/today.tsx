import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { View, useWindowDimensions, type HostInstance, type ScrollViewInstance } from 'react-native';

import { RadarTopItem } from '@/components/ComplianceRadar';
import { AgendaList, DayTimeline, NowNext } from '@/components/DayAgenda';
import { NotificationBell } from '@/components/NotificationBell';
import { OneOffTaskSheet } from '@/components/OneOffTaskSheet';
import { reveal } from '@/components/reveal';
import { TaskSheet } from '@/components/TaskSheet';
import { useCompliance } from '@/hooks/useCompliance';
import { usePrint } from '@/hooks/usePrint';
import { nextPlannedDay } from '@/lib/agenda';
import { readableOn } from '@/lib/contrast';
import { addDays, diffDays, formatClock, formatDate, fromMinutes, isDateKey, relativeDayLabel, todayKey } from '@/lib/dates';
import { bumpTargets, findParentConflicts, suggestWhileWaiting } from '@/lib/schedule';
import { TIER_INFO } from '@/lib/states';
import { hasAnswerKey } from '@/lib/worksheet';
import type { ID, Task } from '@/lib/types';
import { selectOpenHelp, useStore } from '@/store/useStore';
import { Button, Card, Empty, Pill, Row, Screen, Section, Segmented, Sheet, space, Stack, Stat, T, useColors } from '@/ui';

type View_ = 'agenda' | 'timeline';
/** Below this width the day is a list; the chart needs room to be readable. */
const AGENDA_ONLY = 700;

export default function FlightDeck() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: string }>();
  // Opened on a given day (e.g. the demo family's next school day), or today.
  const [date, setDate] = useState(() => (isDateKey(params.date) ? params.date : todayKey()));
  const [openTask, setOpenTask] = useState<Task | undefined>();
  const [bumpOpen, setBumpOpen] = useState(false);
  const [addFor, setAddFor] = useState<string | undefined>();
  const [toast, setToast] = useState('');
  const [view, setView] = useState<View_>('agenda');
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<ScrollViewInstance>(null);
  const queueRef = useRef<HostInstance>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const family = useStore((s) => s.family)!;
  const children = useStore((s) => s.children);
  const allTasks = useStore((s) => s.tasks);
  const blocks = useStore((s) => s.blocks);
  const curricula = useStore((s) => s.curricula);
  const noiSigned = useStore((s) => !!s.noi.signedAt);
  const help = useStore(useShallow(selectOpenHelp));
  const { ensureTasks, staggerDay, bumpDay, resolveHelp, updateFamily } = useStore.getState();
  const compliance = useCompliance();
  const { print, printAnswers, busy: printing } = usePrint();

  const tasks = useMemo(() => allTasks.filter((t) => t.date === date), [allTasks, date]);
  // An empty day points at the next one with work on it, so the plan is never invisible.
  const upcoming = useMemo(() => (tasks.length ? undefined : nextPlannedDay(date, blocks, allTasks)), [tasks.length, date, blocks, allTasks]);
  const upcomingTasks = useMemo(() => (upcoming ? allTasks.filter((t) => t.date === upcoming) : []), [allTasks, upcoming]);

  useEffect(() => {
    ensureTasks(date);
    if (upcoming) ensureTasks(upcoming);
  }, [date, upcoming, blocks.length, ensureTasks]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const conflicts = useMemo(() => findParentConflicts(tasks), [tasks]);
  const done = tasks.filter((t) => t.status === 'done').length;
  const law = compliance.law;
  const wide = width >= 1000;
  const roomy = width >= AGENDA_ONLY;
  const isToday = date === todayKey();
  const clock = new Date(now);
  const nowMin = clock.getHours() * 60 + clock.getMinutes();

  const conflictIds = new Set(conflicts.flatMap((x) => [x.a.groupKey ?? x.a.id, x.b.groupKey ?? x.b.id]));
  const childName = (id: ID) => children.find((k) => k.id === id);
  const dayWord = (d: string) => (relativeDayLabel(d) === 'Tomorrow' ? 'tomorrow' : formatDate(d, { weekday: 'long' }));

  const helpQueue = (
    <View ref={queueRef} collapsable={false}>
      <Card tint={help.length ? c.accentSoft : undefined}>
        <T v="heading" color={help.length ? c.accentInk : undefined}>✋ Help queue {help.length ? `(${help.length} waiting)` : ''}</T>
        {help.length === 0 ? <T muted>No one needs you right now.</T> : null}
        {help.map((h) => {
          const k = childName(h.childId);
          const t = allTasks.find((x) => x.id === h.taskId);
          const filler = suggestWhileWaiting(allTasks.filter((x) => x.date === todayKey()), h.childId, h.taskId);
          const mins = Math.max(0, Math.round((now - Date.parse(h.createdAt)) / 60000));
          return (
            <View key={h.id} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderColor: c.border }}>
              <T v="label">{k?.avatar} {k?.name} · {t ? t.title : 'General help'}</T>
              <T v="caption" muted>Waiting {mins} min{filler ? ` · doing “${filler.title}” meanwhile` : ''}</T>
              {h.note ? <T v="caption">“{h.note}”</T> : null}
              <Row>
                <Button size="sm" title="On my way ✓" onPress={() => resolveHelp(h.id)} />
              </Row>
            </View>
          );
        })}
      </Card>
    </View>
  );

  const sidePanel = (
    <Stack style={wide ? { width: 320 } : undefined}>
      {helpQueue}
      <Card>
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <T v="heading">🧭 Compliance radar</T>
          {law ? <Pill text={TIER_INFO[law.tier].label} fg={readableOn(TIER_INFO[law.tier].color)} bg={TIER_INFO[law.tier].color} /> : null}
        </Row>
        {compliance.items.length ? <RadarTopItem items={compliance.items} /> : <T muted>Choose your state in Settings to see requirements.</T>}
      </Card>
    </Stack>
  );

  const targets = bumpTargets(date, family.schoolDays, family.flexDay);
  const daySpan = formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' });
  const printable = tasks.filter((t) => t.status !== 'skipped');

  // A brand-new family's first two weeks: the next few things worth doing.
  const newFamily = !family.firstWeekDismissed && diffDays(family.createdAt.slice(0, 10), todayKey()) <= 14 && children.length > 0;
  const firstSchoolDay = isToday && tasks.length ? date : nextPlannedDay(addDays(todayKey(), -1), blocks, allTasks);

  // The oldest open help request, pinned above everything.
  const first = help[0];
  const firstKid = first ? childName(first.childId) : undefined;
  const firstTask = first ? allTasks.find((x) => x.id === first.taskId) : undefined;
  const banner = first ? (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: 14, backgroundColor: c.accent, marginBottom: space.xs }}>
      <T style={{ flex: 1, minWidth: 200, fontWeight: '700' }} color="#2B1D05">
        ✋ {firstKid?.name ?? 'A student'} needs help · {firstTask?.title ?? 'General help'} · {Math.max(0, Math.round((now - Date.parse(first.createdAt)) / 60000))} min
        {help.length > 1 ? ` (+${help.length - 1} more)` : ''}
      </T>
      <Button size="sm" kind="secondary" title="On my way ✓" onPress={() => resolveHelp(first.id)} />
    </View>
  ) : null;

  const dayView = (list: Task[]) =>
    roomy && view === 'timeline' ? (
      <DayTimeline tasks={list} kids={children} onOpen={setOpenTask} conflictIds={conflictIds} nowMin={isToday ? nowMin : undefined} />
    ) : (
      <AgendaList tasks={list} kids={children} onOpen={setOpenTask} conflictIds={conflictIds} />
    );

  return (
    <Screen scrollRef={scrollRef} top={banner}>
      <Row wrap style={{ justifyContent: 'space-between' }} gap={space.md}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <T v="caption" muted>{family.familyName}{law ? ` · ${law.name}` : ''}</T>
          <T v="display">Family Flight Deck</T>
        </View>
        <Row gap={space.sm}>
          <NotificationBell />
          <Button kind="secondary" icon="⚙️" title="Settings" onPress={() => router.push('/settings')} />
          <Button kind="accent" icon="🧒" title="Kid mode" onPress={() => router.push('/kid')} />
        </Row>
      </Row>

      <Row style={{ marginTop: space.lg, justifyContent: 'space-between' }} wrap gap={space.sm}>
        <Row gap={space.xs}>
          <Button kind="secondary" title="‹" onPress={() => setDate(addDays(date, -1))} accessibilityLabel="Previous day" />
          <Button kind={isToday ? 'primary' : 'secondary'} title={isToday ? `Today · ${formatDate(date)}` : formatDate(date)} onPress={() => setDate(todayKey())} accessibilityLabel={isToday ? `Today, ${daySpan}` : `${daySpan}. Go to today`} />
          <Button kind="secondary" title="›" onPress={() => setDate(addDays(date, 1))} accessibilityLabel="Next day" />
        </Row>
        <Row gap={space.xs} wrap style={{ flexShrink: 1, maxWidth: '100%' }}>
          <Button kind="secondary" icon="🖨️" title="Print day" loading={printing} disabled={!printable.length} onPress={() => print(printable, `Lesson packet · ${daySpan}`)} />
          {printable.some((t) => hasAnswerKey(t, { curricula, tasks: allTasks })) ? (
            <Button kind="secondary" icon="🔑" title="Answer key" loading={printing} onPress={() => printAnswers(printable, `Answer key · ${daySpan}`)} />
          ) : null}
          <Button kind="secondary" icon="＋" title="Task" onPress={() => setAddFor(date)} disabled={children.length === 0} />
          <Button kind="secondary" icon="↪︎" title="Bump remaining" disabled={!tasks.some((t) => t.status === 'todo' || t.status === 'in_progress')} onPress={() => setBumpOpen(true)} />
        </Row>
      </Row>

      <Row wrap gap={space.md} style={{ marginTop: space.lg }} align="stretch">
        <Stat label="Done today" value={`${done}/${tasks.length}`} />
        <Stat label="Days this year" value={`${compliance.family.daysAttended}${law?.requiredDays ? `/${law.requiredDays}` : ''}`} onPress={() => router.push('/records/hours')} hint="Opens Hours & Attendance" />
        <Stat label="Help waiting" value={String(help.length)} color={help.length ? c.danger : undefined} onPress={() => reveal(queueRef.current, scrollRef.current)} hint="Shows the help queue" />
      </Row>

      {newFamily && firstSchoolDay ? (
        <Card tint={c.primarySoft} style={{ marginTop: space.md }} label="Your first week">
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="heading">🌱 Your first week</T>
            <Button size="sm" kind="ghost" title="Hide" onPress={() => updateFamily({ firstWeekDismissed: true })} accessibilityLabel="Hide your first week" />
          </Row>
          <Row wrap>
            <Button size="sm" kind="secondary" title={`📅 See ${firstSchoolDay === todayKey() ? 'today' : dayWord(firstSchoolDay)}’s plan`} onPress={() => setDate(firstSchoolDay)} />
            {law?.noticeRequired && !noiSigned ? <Button size="sm" kind="secondary" title="📬 File your NOI" onPress={() => router.push('/records/noi')} /> : null}
            <Button size="sm" kind="secondary" title="🧒 Try kid mode" onPress={() => router.push('/kid')} />
            <Button size="sm" kind="secondary" title="🖨️ Print the first packet" onPress={() => {
              const list = allTasks.filter((t) => t.date === firstSchoolDay && t.status !== 'skipped');
              if (list.length) print(list, `Lesson packet · ${formatDate(firstSchoolDay, { weekday: 'long', month: 'long', day: 'numeric' })}`);
              else setDate(firstSchoolDay);
            }} />
          </Row>
        </Card>
      ) : null}

      {toast ? (
        <Card tint={c.successSoft} style={{ marginTop: space.md }}>
          <T color={c.successInk}>{toast}</T>
        </Card>
      ) : null}

      {conflicts.length > 0 ? (
        <Card tint={c.dangerSoft} style={{ marginTop: space.md }}>
          <T v="heading" color={c.dangerInk}>⚠️ {conflicts.length} parent conflict{conflicts.length > 1 ? 's' : ''}</T>
          {conflicts.map((x) => (
            <T key={`${x.a.id}-${x.b.id}`} v="caption" color={c.dangerInk}>
              {childName(x.a.childId)?.name}: {x.a.title} ({formatClock(x.a.start)}) overlaps {childName(x.b.childId)?.name}: {x.b.title} ({formatClock(x.b.start)}) by {x.overlapMin} min
            </T>
          ))}
          <Row>
            <Button
              size="sm"
              title="Auto-stagger 1-on-1s"
              onPress={() => {
                const n = staggerDay(date);
                setToast(n ? `Rescheduled ${n} task${n > 1 ? 's' : ''} so only one child needs you at a time.` : 'Could not fit everything before the end of the day — adjust manually.');
              }}
            />
          </Row>
        </Card>
      ) : null}

      <Section
        title="The day"
        subtitle={daySpan}
        action={roomy && tasks.length ? <Segmented<View_> value={view} onChange={setView} options={[{ value: 'agenda', label: 'Agenda' }, { value: 'timeline', label: 'Timeline' }]} /> : undefined}>
        {(() => {
          const main =
            children.length === 0 ? (
              <Card><Empty icon="🧒" title="Add your kids in Settings" /></Card>
            ) : tasks.length === 0 ? (
              <Card>
                <Empty
                  icon="🌤️"
                  title={blocks.length ? `Nothing scheduled ${isToday ? 'today' : `on ${formatDate(date, { weekday: 'long' })}`}` : 'No rhythm yet'}
                  body={blocks.length ? (upcoming ? `Your next school day is ${formatDate(upcoming, { weekday: 'long', month: 'short', day: 'numeric' })}.` : 'Enjoy the day off!') : 'Build a weekly rhythm and each day fills in automatically.'}
                  action={
                    <Row wrap style={{ justifyContent: 'center' }}>
                      {upcoming ? <Button title={`Go to ${dayWord(upcoming)}`} onPress={() => setDate(upcoming)} /> : null}
                      <Button kind={upcoming ? 'secondary' : 'primary'} title={blocks.length ? 'Add a task' : 'Build my rhythm'} onPress={() => (blocks.length ? setAddFor(date) : router.push('/schedule'))} />
                    </Row>
                  }
                />
                {upcoming && upcomingTasks.length ? (
                  <View style={{ gap: space.sm }}>
                    <T v="label">Next school day: {formatDate(upcoming, { weekday: 'short', month: 'short', day: 'numeric' })}</T>
                    <AgendaList tasks={upcomingTasks} kids={children} onOpen={setOpenTask} />
                  </View>
                ) : null}
              </Card>
            ) : (
              <Stack gap={space.md}>
                {isToday ? <NowNext tasks={tasks} kids={children} nowMin={nowMin} onOpen={setOpenTask} /> : null}
                <Card style={{ padding: space.md }}>
                  {dayView(tasks)}
                  {roomy && view === 'timeline' ? (
                    <Row wrap gap={space.md} style={{ marginTop: space.sm }}>
                      <Legend color={c.parent} label="1-on-1 with you" />
                      <Legend color={c.solo} label="Independent" />
                      <Legend color={c.group} label="Family together" />
                    </Row>
                  ) : null}
                </Card>
              </Stack>
            );
          // The help queue and compliance radar stay visible even on empty days.
          return wide ? (
            <Row align="flex-start" gap={space.lg}>
              <View style={{ flex: 1 }}>{main}</View>
              {sidePanel}
            </Row>
          ) : (
            <Stack>
              {main}
              {sidePanel}
            </Stack>
          );
        })()}
      </Section>

      <TaskSheet task={openTask} onClose={() => setOpenTask(undefined)} />
      <OneOffTaskSheet date={addFor} onClose={() => setAddFor(undefined)} onSaved={(n) => { setDate(addFor!); setToast(`Added ${n === 1 ? 'a task' : `${n} tasks`} to ${formatDate(addFor!)}.`); }} />

      <Sheet visible={bumpOpen} onClose={() => setBumpOpen(false)} title="Gentle bump">
        <T muted>Move everything not yet finished on {formatDate(date)} to another day. Nothing on that day gets displaced — bumped work is added after it.</T>
        {targets.map((t) => (
          <Button
            key={t.date}
            kind="secondary"
            title={`${t.label} · ${formatDate(t.date)}`}
            onPress={() => {
              const n = bumpDay(date, t.date);
              setBumpOpen(false);
              setToast(`Bumped ${n} task${n === 1 ? '' : 's'} to ${formatDate(t.date)}. No guilt — it'll be there.`);
            }}
          />
        ))}
        {targets.length === 0 ? <T>No school days are set, so there is no day to move work to. Pick school days or a flex day in Settings.</T> : null}
        {isToday && targets[0] ? (
          <Button
            kind="ghost"
            title="Only tasks from now on"
            onPress={() => {
              const n = bumpDay(date, targets[0].date, { fromTime: fromMinutes(nowMin) });
              setBumpOpen(false);
              setToast(`Bumped ${n} upcoming task${n === 1 ? '' : 's'} to ${formatDate(targets[0].date)}.`);
            }}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Row gap={6}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <T v="caption" muted>{label}</T>
    </Row>
  );
}
