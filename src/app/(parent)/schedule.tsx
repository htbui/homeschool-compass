import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BlockForm } from '@/components/BlockForm';
import { OneOffTaskSheet } from '@/components/OneOffTaskSheet';
import { PlanSwitcher } from '@/components/PlanSwitcher';
import { formatClock, toMinutes, WEEKDAY_SHORT } from '@/lib/dates';
import { findRhythmConflicts } from '@/lib/schedule';
import type { RhythmBlock, Weekday } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, Empty, ModeBadge, modeColors, Row, Screen, Section, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

export default function RhythmBuilder() {
  const c = useColors();
  const params = useLocalSearchParams<{ addFor?: string }>();
  const blocks = useStore((s) => s.blocks);
  const kids = useStore((s) => s.children);
  const { upsertBlock, removeBlock } = useStore.getState();
  const [day, setDay] = useState<Weekday>(() => {
    const d = new Date().getDay() as Weekday;
    return d === 0 || d === 6 ? 1 : d;
  });
  const [editing, setEditing] = useState<RhythmBlock | 'new' | null>(null);
  const oneOffDate = params.addFor;
  const setOneOffDate = (d: string | undefined) => router.setParams({ addFor: d });
  const confirm = useConfirm();

  const dayBlocks = useMemo(() => blocks.filter((b) => b.days.includes(day)).sort((a, b) => toMinutes(a.start) - toMinutes(b.start)), [blocks, day]);
  const conflicts = useMemo(() => findRhythmConflicts(blocks), [blocks]);
  const dayConflicts = conflicts.filter((x) => x.day === day);
  const conflictIds = new Set(dayConflicts.flatMap((x) => [x.a.id, x.b.id]));
  const kid = (id: string) => kids.find((k) => k.id === id);

  const save = (b: RhythmBlock) => {
    // Non-group blocks for several kids become one block per kid.
    if (b.mode !== 'group' && b.childIds.length > 1 && editing === 'new') {
      b.childIds.forEach((id, i) => upsertBlock({ ...b, id: `${b.id}-${i}`, childIds: [id] }));
    } else upsertBlock(b);
    setEditing(null);
  };

  return (
    <Screen>
      <T v="display">Weekly Rhythm</T>
      <T muted>Your recurring week. Each day&apos;s plan is generated from this — edit a block once and every future day updates.</T>
      <View style={{ marginTop: space.lg }}>
        <PlanSwitcher value="week" />
      </View>

      <Row wrap gap={6} style={{ marginTop: space.lg }}>
        {WEEKDAY_SHORT.map((d, i) => {
          const n = conflicts.filter((x) => x.day === i).length;
          return <Chip key={d} label={`${d}${n ? ` ⚠️${n}` : ''}`} selected={day === i} onPress={() => setDay(i as Weekday)} />;
        })}
      </Row>

      {dayConflicts.length > 0 ? (
        <Card tint={c.dangerSoft} style={{ marginTop: space.md }}>
          <T v="label" color={c.danger}>Parent double-booked on {WEEKDAY_SHORT[day]}</T>
          {dayConflicts.map((x) => (
            <T key={`${x.a.id}-${x.b.id}`} v="caption">
              {x.a.title} ({formatClock(x.a.start)}) ↔ {x.b.title} ({formatClock(x.b.start)})
            </T>
          ))}
          <T v="caption" muted>Tip: move one block, or switch it to Independent. The Flight Deck can also auto-stagger a single day.</T>
        </Card>
      ) : null}

      <Section title={`${WEEKDAY_SHORT[day]} blocks`} action={<Button size="sm" icon="＋" title="Block" onPress={() => setEditing('new')} disabled={kids.length === 0} />}>
        {dayBlocks.length === 0 ? (
          <Empty icon="🗓️" title="Nothing on this day" body="Add blocks for skill subjects (1-on-1 or solo) and family time (together)." />
        ) : (
          <Stack gap={space.sm}>
            {dayBlocks.map((b) => {
              const m = modeColors(c, b.mode);
              return (
                <Card key={b.id} onPress={() => setEditing(b)} style={{ borderLeftWidth: 5, borderLeftColor: m.fg, ...(conflictIds.has(b.id) ? { borderColor: c.danger, borderWidth: 2 } : {}) }}>
                  <Row style={{ justifyContent: 'space-between' }} wrap>
                    <T v="heading" style={{ flex: 1 }}>{b.icon} {b.title}</T>
                    <T v="label" muted>{formatClock(b.start)} · {b.durationMin}m</T>
                  </Row>
                  <Row wrap gap={6}>
                    <ModeBadge mode={b.mode} compact />
                    {b.childIds.map((id) => (
                      <T key={id} v="caption">{kid(id)?.avatar} {kid(id)?.name}</T>
                    ))}
                    <T v="caption" muted>· {b.days.map((d) => WEEKDAY_SHORT[d]).join(' ')}</T>
                  </Row>
                </Card>
              );
            })}
          </Stack>
        )}
      </Section>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New rhythm block' : 'Edit block'}>
        {editing !== null ? (
          <BlockForm
            initial={editing === 'new' ? { days: [day] } : editing}
            onSave={save}
            onCancel={() => setEditing(null)}
            onDelete={
              editing === 'new'
                ? undefined
                : () =>
                    confirm.ask(`Delete “${editing.title}”?`, () => {
                      removeBlock(editing.id);
                      setEditing(null);
                    }, { body: 'Future unstarted tasks from this block are removed. Completed work and logged hours are kept.', confirm: 'Delete' })
            }
          />
        ) : null}
      </Sheet>

      {/* Old links (…/schedule?addFor=…) still open the one-off form; Today now opens it in place. */}
      <OneOffTaskSheet date={oneOffDate} onClose={() => setOneOffDate(undefined)} onSaved={() => router.navigate({ pathname: '/today', params: { date: oneOffDate } })} />
      {confirm.element}
    </Screen>
  );
}
