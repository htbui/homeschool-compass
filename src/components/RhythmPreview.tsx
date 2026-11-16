import { ScrollView, useWindowDimensions, View } from 'react-native';

import { formatClock, toMinutes } from '@/lib/dates';
import type { Child, RhythmBlock } from '@/lib/types';
import { MODE_META, modeColors, Row, space, T, useColors } from '@/ui';

/**
 * A weekly rhythm's Monday, per child: a list on phones (nothing clipped), a compact
 * timeline on wider screens.
 */
export function RhythmPreview({ blocks, kids }: { blocks: RhythmBlock[]; kids: Child[] }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const monday = blocks.filter((b) => b.days.includes(1)).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  if (!monday.length) return <T muted>No blocks yet.</T>;

  if (width < 700) {
    return (
      <View style={{ gap: space.md }} accessibilityLabel="Monday, per child">
        {kids.map((k) => {
          const mine = monday.filter((b) => b.childIds.includes(k.id));
          return (
            <View key={k.id} style={{ gap: 6 }}>
              <T v="label">{k.avatar} {k.name}</T>
              {mine.length === 0 ? <T v="caption" muted>Nothing on Monday</T> : null}
              {mine.map((b) => {
                const m = modeColors(c, b.mode);
                return (
                  <Row key={b.id} gap={space.sm} align="flex-start" style={{ backgroundColor: m.bg, borderLeftWidth: 4, borderLeftColor: m.fg, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8 }}>
                    <T v="caption" style={{ width: 64, fontWeight: '700' }}>{formatClock(b.start)}</T>
                    <View style={{ flex: 1 }}>
                      <T v="caption" style={{ fontWeight: '700' }}>{b.icon} {b.title}</T>
                      <T v="caption" color={m.ink}>{MODE_META[b.mode].short} · {b.durationMin} min</T>
                    </View>
                  </Row>
                );
              })}
            </View>
          );
        })}
      </View>
    );
  }

  const start = Math.min(...monday.map((b) => toMinutes(b.start)));
  const end = Math.max(...monday.map((b) => toMinutes(b.start) + b.durationMin));
  const PX = 2.4; // px per minute

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={{ gap: space.sm, paddingBottom: space.sm }}>
        {kids.map((k) => (
          <Row key={k.id} gap={space.sm}>
            <View style={{ width: 70 }}>
              <T v="label">{k.avatar} {k.name}</T>
            </View>
            <View style={{ width: (end - start) * PX, height: 54 }}>
              {monday
                .filter((b) => b.childIds.includes(k.id))
                .map((b) => {
                  const m = modeColors(c, b.mode);
                  return (
                    <View
                      key={b.id}
                      style={{
                        position: 'absolute',
                        left: (toMinutes(b.start) - start) * PX,
                        width: b.durationMin * PX - 3,
                        height: 54,
                        backgroundColor: m.bg,
                        borderLeftWidth: 4,
                        borderLeftColor: m.fg,
                        borderRadius: 8,
                        padding: 5,
                        overflow: 'hidden',
                      }}>
                      <T v="caption" numberOfLines={2} style={{ fontWeight: '700' }}>{b.icon} {b.title}</T>
                      <T v="caption" muted numberOfLines={1}>{formatClock(b.start)}</T>
                    </View>
                  );
                })}
            </View>
          </Row>
        ))}
      </View>
    </ScrollView>
  );
}
