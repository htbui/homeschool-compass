import { ScrollView, View } from 'react-native';

import { formatClock, toMinutes } from '@/lib/dates';
import type { Child, RhythmBlock } from '@/lib/types';
import { modeColors, Row, space, T, useColors } from '@/ui';

/** Compact per-child timeline of a weekly rhythm (Monday view). */
export function RhythmPreview({ blocks, kids }: { blocks: RhythmBlock[]; kids: Child[] }) {
  const c = useColors();
  const monday = blocks.filter((b) => b.days.includes(1));
  if (!monday.length) return <T muted>No blocks yet.</T>;
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
