import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { agendaSlots, fitScale, nowAndNext, timelineSpan, timelineTicks } from '@/lib/agenda';
import { formatClock, toMinutes } from '@/lib/dates';
import type { Child, Task } from '@/lib/types';
import { MODE_META, modeColors, Row, space, T, useColors } from '@/ui';

const STATUS_WORD: Record<Task['status'], string> = { todo: '', in_progress: '▶ In progress', done: '✓ Done', skipped: 'Skipped' };

/**
 * A day as a list grouped by start time: "9:00 · 🦖 Leo 1-on-1 Phonics (with you) ·
 * 🦉 Maya Silent Reading". Parent time comes first in each slot and is coloured.
 */
export function AgendaList({ tasks, kids, onOpen, conflictIds = new Set() }: { tasks: Task[]; kids: Child[]; onOpen: (t: Task) => void; conflictIds?: Set<string> }) {
  const c = useColors();
  const slots = agendaSlots(tasks, kids.map((k) => k.id));
  const kid = (id: string) => kids.find((k) => k.id === id);
  return (
    <View style={{ gap: space.md }}>
      {slots.map((slot) => (
        <View key={slot.start} style={{ gap: 6 }}>
          <Row gap={space.sm}>
            <T v="label">{formatClock(slot.start)}</T>
            {slot.parentTime ? <T v="caption" color={c.parentInk}>· needs you</T> : null}
          </Row>
          {slot.tasks.map((t) => {
            const m = modeColors(c, t.mode);
            const k = kid(t.childId);
            const conflict = conflictIds.has(t.groupKey ?? t.id);
            return (
              <Pressable
                key={t.id}
                onPress={() => onOpen(t)}
                accessibilityRole="button"
                // Title first and time last, the same shape as the timeline's labels.
                accessibilityLabel={`${t.title}, ${k?.name ?? 'student'}${t.mode === 'parent' ? ', with you' : t.mode === 'group' ? ', family together' : ''}${STATUS_WORD[t.status] ? `, ${STATUS_WORD[t.status].replace(/^\W+/, '').toLowerCase()}` : ''}, ${formatClock(t.start)}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  minHeight: 48,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: t.status === 'done' ? c.surface : m.bg,
                  borderLeftWidth: 4,
                  borderLeftColor: m.fg,
                  borderWidth: conflict ? 2 : 0,
                  borderColor: c.danger,
                  opacity: pressed ? 0.8 : t.status === 'skipped' ? 0.5 : 1,
                })}>
                <T style={{ fontSize: 20 }}>{k?.avatar ?? '🧒'}</T>
                <View style={{ flex: 1, gap: 1 }}>
                  <T style={{ fontWeight: '700', textDecorationLine: t.status === 'done' ? 'line-through' : 'none' }}>
                    {t.icon} {t.title}
                  </T>
                  <T v="caption" color={m.ink}>
                    {k?.name} · {t.mode === 'parent' ? 'with you' : MODE_META[t.mode].short.toLowerCase()} · {t.durationMin} min
                  </T>
                </View>
                {STATUS_WORD[t.status] ? <T v="caption" color={t.status === 'done' ? c.successInk : c.textMuted}>{STATUS_WORD[t.status]}</T> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** The day as a chart, one lane per child, fitted to the width available, with a "now" line. */
export function DayTimeline({ tasks, kids, onOpen, conflictIds = new Set(), nowMin }: { tasks: Task[]; kids: Child[]; onOpen: (t: Task) => void; conflictIds?: Set<string>; nowMin?: number }) {
  const c = useColors();
  const [room, setRoom] = useState(0);
  const span = timelineSpan(tasks);
  const LANE = 92;
  const px = fitScale(span, Math.max(0, room - LANE - 8));
  const width = (span.end - span.start) * px;
  const showNow = nowMin !== undefined && nowMin >= span.start && nowMin <= span.end;
  return (
    <View onLayout={(e) => setRoom(e.nativeEvent.layout.width)} style={{ gap: space.sm }}>
      {room ? (
        <>
          <View style={{ marginLeft: LANE, width, height: 16 }}>
            {timelineTicks(span).map((tick, i, all) =>
              // Skip labels that would collide when the scale is tight.
              px * 30 < 46 && i % 2 === 1 && i !== all.length - 1 ? null : (
                <T key={tick.min} v="caption" muted style={{ position: 'absolute', left: (tick.min - span.start) * px, width: 60 }}>{tick.label}</T>
              ),
            )}
          </View>
          {kids.map((k) => {
            const lane = tasks.filter((t) => t.childId === k.id);
            return (
              <Row key={k.id} gap={space.sm} align="flex-start">
                <View style={{ width: LANE - space.sm, paddingTop: 6 }}>
                  <T v="label" numberOfLines={1}>{k.avatar} {k.name}</T>
                  <T v="caption" muted>{lane.filter((t) => t.status === 'done').length}/{lane.length} done</T>
                </View>
                <View style={{ width, height: 64, backgroundColor: c.surfaceAlt, borderRadius: 10 }}>
                  {lane.map((t) => {
                    const m = modeColors(c, t.mode);
                    const conflict = conflictIds.has(t.groupKey ?? t.id);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => onOpen(t)}
                        accessibilityRole="button"
                        accessibilityLabel={`${t.title}, ${formatClock(t.start)}`}
                        style={({ pressed }) => ({
                          position: 'absolute',
                          left: (toMinutes(t.start) - span.start) * px,
                          width: Math.max(28, t.durationMin * px - 3),
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
                  {showNow ? <View accessibilityLabel="Now" style={{ position: 'absolute', left: (nowMin! - span.start) * px - 1, top: -4, bottom: -4, width: 2, backgroundColor: c.danger }} /> : null}
                </View>
              </Row>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

/** What's happening now and what's next (today only), parent time called out. */
export function NowNext({ tasks, kids, nowMin, onOpen }: { tasks: Task[]; kids: Child[]; nowMin: number; onOpen: (t: Task) => void }) {
  const c = useColors();
  const { now, next, nextStart } = nowAndNext(tasks, nowMin);
  if (!now.length && !next.length) return null;
  const kid = (id: string) => kids.find((k) => k.id === id);
  const line = (t: Task) => (
    <Pressable key={t.id} onPress={() => onOpen(t)} accessibilityRole="button" accessibilityLabel={`${kid(t.childId)?.name}: ${t.title}${t.mode === 'parent' ? ', with you' : ''}`} style={{ minHeight: 32, justifyContent: 'center' }}>
      <T>
        {kid(t.childId)?.avatar} <T style={{ fontWeight: '700' }}>{kid(t.childId)?.name}</T> · {t.icon} {t.title}
        {t.mode === 'parent' ? <T color={c.parentInk} style={{ fontWeight: '700' }}> · with you</T> : null}
      </T>
    </Pressable>
  );
  return (
    <View accessibilityLabel="Now and next" style={{ gap: space.sm, padding: space.md, borderRadius: 14, backgroundColor: c.primarySoft }}>
      {now.length ? (
        <View style={{ gap: 2 }}>
          <T v="label">Now</T>
          {now.map(line)}
        </View>
      ) : null}
      {next.length ? (
        <View style={{ gap: 2 }}>
          <T v="label">Next · {formatClock(nextStart!)}</T>
          {next.map(line)}
        </View>
      ) : null}
    </View>
  );
}
