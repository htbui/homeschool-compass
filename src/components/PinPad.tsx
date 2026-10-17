import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Row, space, T, useColors } from '@/ui';

/** Big-button PIN entry that works for small fingers and on web. */
export function PinPad({ prompt, expected, onSuccess }: { prompt: string; expected: string; onSuccess: () => void }) {
  const c = useColors();
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  const press = (d: string) => {
    if (d === '⌫') return setEntry(entry.slice(0, -1));
    const next = (entry + d).slice(0, 4);
    setEntry(next);
    setError(false);
    if (next.length === 4) {
      if (next === expected) {
        setEntry('');
        onSuccess();
      } else {
        setError(true);
        setTimeout(() => setEntry(''), 400);
      }
    }
  };

  return (
    <View style={{ alignItems: 'center', gap: space.lg }}>
      <T v="heading">{prompt}</T>
      <Row gap={space.md}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: i < entry.length ? (error ? c.danger : c.primary) : c.surfaceAlt, borderWidth: 1, borderColor: c.border }} />
        ))}
      </Row>
      {error ? <T color={c.danger}>Try again</T> : null}
      <View style={{ width: 260, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) =>
          d === '' ? (
            <View key={i} style={{ width: 72, height: 72 }} />
          ) : (
            <Pressable
              key={i}
              onPress={() => press(d)}
              accessibilityLabel={d === '⌫' ? 'Delete' : d}
              style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, backgroundColor: pressed ? c.primarySoft : c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' })}>
              <Text style={{ fontSize: 26, fontWeight: '700', color: c.text }}>{d}</Text>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}
