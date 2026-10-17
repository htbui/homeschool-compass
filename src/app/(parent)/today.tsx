import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { TaskSheet } from '@/components/TaskSheet';
import { useCompliance } from '@/hooks/useCompliance';
import { addDays, formatClock, formatDate, fromMinutes, toMinutes, todayKey } from '@/lib/dates';
import { bumpTargets, findParentConflicts, suggestWhileWaiting } from '@/lib/schedule';
import { TIER_INFO } from '@/lib/states';
import type { ID, Task } from '@/lib/types';
import { selectOpenHelp, useStore } from '@/store/useStore';
import { Button, Card, Empty, modeColors, Pill, Row, Screen, Section, Sheet, space, Stack, Stat, T, useColors } from '@/ui';

const PX = 2.6; // px per minute on the timeline

export default function FlightDeck() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [date, setDate] = useState(todayKey());
  const [openTask, setOpenTask] = useState<Task | undefined>();
  const [bumpOpen, setBumpOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const family = useStore((s) => s.family)!;
  const children = useStore((s) => s.children);
  const allTasks = useStore((s) => s.tasks);
  const help = useStore(useShallow(selectOpenHelp));
  const blocksCount = useStore((s) => s.blocks.length);
  const { ensureTasks, staggerDay, bumpDay, resolveHelp } = useStore.getState();
  const compliance = useCompliance();

  useEffect(() => {
    ensureTasks(date);
  }, [date, blocksCount, ensureTasks]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const tasks = useMemo(() => allTasks.filter((t) => t.date === date), [allTasks, date]);
  const conflicts = useMemo(() => findParentConflicts(tasks), [tasks]);
  const done = tasks.filter((t) => t.status === 'done').length;
  const law = compliance.law;
  const wide = width >= 1000;

  const span = useMemo(() => {
    if (!tasks.length) return { start: 8 * 60, end: 15 * 60 };
    return {
      start: Math.floor(Math.min(...tasks.map((t) => toMinutes(t.start))) / 30) * 30,
      end: Math.ceil(Math.max(...tasks.map((t) => toMinutes(t.start) + t.durationMin)) / 30) * 30,
    };
  }, [tasks]);

  const conflictIds = new Set(conflicts.flatMap((x) => [x.a.groupKey ?? x.a.id, x.b.groupKey ?? x.b.id]));
  const childName = (id: ID) => children.find((k) => k.id === id);

  const timeline = (
    <Card style={{ padding: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ gap: space.sm }}>
          <Row gap={0} style={{ marginLeft: 92 }}>
            {Array.from({ length: (span.end - span.start) / 30 + 1 }, (_, i) => (
              <View key={i} style={{ width: 30 * PX }}>
                <T v="caption" muted>{formatClock(fromMinutes(span.start + i * 30)).replace(':00', '')}</T>
              </View>
            ))}
          </Row>
          {children.map((k) => {
            const lane = tasks.filter((t) => t.childId === k.id);
            return (
              <Row key={k.id} gap={space.sm} align="flex-start">
                <View style={{ width: 84, paddingTop: 6 }}>
                  <T v="label">{k.avatar} {k.name}</T>
                  <T v="caption" muted>{lane.filter((t) => t.status === 'done').length}/{lane.length} done</T>
                </View>
                <View style={{ width: (span.end - span.start) * PX, height: 64, backgroundColor: c.surfaceAlt, borderRadius: 10 }}>
                  {lane.map((t) => {
                    const m = modeColors(c, t.mode);
                    const conflict = conflictIds.has(t.groupKey ?? t.id);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => setOpenTask(t)}
                        accessibilityLabel={`${t.title}, ${formatClock(t.start)}`}
                        style={({ pressed }) => ({
                          position: 'absolute',
                          left: (toMinutes(t.start) - span.start) * PX,
                          width: Math.max(28, t.durationMin * PX - 3),
                          top: 2,
                          bottom: 2,
                          backgroundColor: t.status === 'done' ? c.surface : m.bg,
                          borderLeftWidth: 4,
                          borderLeftColor: m.fg,
                          borderWidth: conflict ? 2 : 0,
                          borderColor: c.danger,
                          borderRadius: 8,
                          padding: 5,
                          opacity: pressed ? 0.8 : t.status === 'skipped' ? 0.4 : 1,
                          overflow: 'hidden',
                        })}>
                        <T v="caption" numberOfLines={2} style={{ fontWeight: '700', textDecorationLine: t.status === 'done' ? 'line-through' : 'none' }}>
                          {t.status === 'done' ? '✓ ' : ''}{t.icon} {t.title}
                        </T>
                        <T v="caption" muted numberOfLines={1}>{formatClock(t.start)}</T>
                      </Pressable>
                    );
                  })}
                </View>
              </Row>
            );
          })}
        </View>
      </ScrollView>
      <Row wrap gap={space.md} style={{ marginTop: space.sm }}>
        <Legend color={c.parent} label="1-on-1 with you" />
        <Legend color={c.solo} label="Independent" />
        <Legend color={c.group} label="Family together" />
      </Row>
    </Card>
  );

  const sidePanel = (
    <Stack style={wide ? { width: 320 } : undefined}>
      <Card tint={help.length ? c.accentSoft : undefined}>
        <T v="heading">✋ Help queue {help.length ? `(${help.length} waiting)` : ''}</T>
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
              <Button size="sm" title="On my way ✓" onPress={() => resolveHelp(h.id)} />
            </View>
          );
        })}
      </Card>
      <Card onPress={() => router.push('/compliance')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="heading">🧭 Compliance radar</T>
          {law ? <Pill text={TIER_INFO[law.tier].label} fg="#fff" bg={TIER_INFO[law.tier].color} /> : null}
        </Row>
        {compliance.items.map((i) => (
          <T key={i.label} v="caption">{i.ok ? '✅' : '⚠️'} {i.label}</T>
        ))}
      </Card>
    </Stack>
  );

  const targets = bumpTargets(date, family.schoolDays, family.flexDay);

  return (
    <Screen>
      <Row wrap style={{ justifyContent: 'space-between' }} gap={space.md}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <T v="caption" muted>{family.familyName}{law ? ` · ${law.name}` : ''}</T>
          <T v="display">Family Flight Deck</T>
        </View>
        <Row gap={space.sm}>
          <Button kind="secondary" size="sm" icon="⚙️" title="Settings" onPress={() => router.push('/settings')} />
          <Button kind="accent" size="sm" icon="🧒" title="Kid mode" onPress={() => router.push('/kid')} />
        </Row>
      </Row>

      <Row style={{ marginTop: space.lg, justifyContent: 'space-between' }} wrap gap={space.sm}>
        <Row gap={space.xs}>
          <Button kind="secondary" size="sm" title="‹" onPress={() => setDate(addDays(date, -1))} accessibilityLabel="Previous day" />
          <Button kind={date === todayKey() ? 'primary' : 'secondary'} size="sm" title={date === todayKey() ? `Today · ${formatDate(date)}` : formatDate(date)} onPress={() => setDate(todayKey())} />
          <Button kind="secondary" size="sm" title="›" onPress={() => setDate(addDays(date, 1))} accessibilityLabel="Next day" />
        </Row>
        <Row gap={space.xs}>
          <Button kind="secondary" size="sm" icon="➕" title="Task" onPress={() => router.push({ pathname: '/schedule', params: { addFor: date } })} />
          <Button kind="secondary" size="sm" icon="↪︎" title="Bump remaining" disabled={!tasks.some((t) => t.status === 'todo' || t.status === 'in_progress')} onPress={() => setBumpOpen(true)} />
        </Row>
      </Row>

      <Row wrap gap={space.md} style={{ marginTop: space.lg }} align="stretch">
        <Stat label="Done today" value={`${done}/${tasks.length}`} />
        <Stat label="Days this year" value={`${compliance.family.daysAttended}${law?.requiredDays ? `/${law.requiredDays}` : ''}`} />
        <Stat label="Help waiting" value={String(help.length)} color={help.length ? c.danger : undefined} />
      </Row>

      {toast ? (
        <Card tint={c.successSoft} style={{ marginTop: space.md }}>
          <T>{toast}</T>
        </Card>
      ) : null}

      {conflicts.length > 0 ? (
        <Card tint={c.dangerSoft} style={{ marginTop: space.md }}>
          <T v="heading" color={c.danger}>⚠️ {conflicts.length} parent conflict{conflicts.length > 1 ? 's' : ''}</T>
          {conflicts.map((x) => (
            <T key={`${x.a.id}-${x.b.id}`} v="caption">
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

      <Section title="Daily orchestration timeline" subtitle={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}>
        {children.length === 0 ? (
          <Empty icon="🧒" title="Add your kids in Settings" />
        ) : tasks.length === 0 ? (
          <Empty
            icon="🌤️"
            title={blocksCount ? 'Nothing scheduled this day' : 'No rhythm yet'}
            body={blocksCount ? 'It may be a weekend or a day off. Enjoy it!' : 'Build a weekly rhythm and each day fills in automatically.'}
            action={<Button title={blocksCount ? 'Add a task' : 'Build my rhythm'} onPress={() => router.push('/schedule')} />}
          />
        ) : wide ? (
          <Row align="flex-start" gap={space.lg}>
            <View style={{ flex: 1 }}>{timeline}</View>
            {sidePanel}
          </Row>
        ) : (
          <Stack>
            {timeline}
            {sidePanel}
          </Stack>
        )}
      </Section>

      <TaskSheet task={openTask} onClose={() => setOpenTask(undefined)} />

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
        {date === todayKey() ? (
          <Button
            kind="ghost"
            title="Only tasks from now on"
            onPress={() => {
              const now = new Date();
              const n = bumpDay(date, targets[0].date, { fromTime: fromMinutes(now.getHours() * 60 + now.getMinutes()) });
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
