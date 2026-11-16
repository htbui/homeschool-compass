import { useState } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';

import { speak } from '@/services/speech';
import { Row, space, T, useColors } from '@/ui';

/**
 * Big-button PIN entry that works for small fingers and on web. A wrong code shakes the dots
 * and says "Try again" in space kept for it, so the keys never move under a finger.
 */
export function PinPad({ prompt, expected, onSuccess, readAloud }: { prompt: string; expected: string; onSuccess: () => void; readAloud?: boolean }) {
  const c = useColors();
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));

  const wobble = () => {
    shake.setValue(0);
    const step = (toValue: number) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: Platform.OS !== 'web' });
    Animated.sequence([step(10), step(-10), step(8), step(-8), step(0)]).start();
  };

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
        wobble();
        if (readAloud) speak('Try again');
        setTimeout(() => setEntry(''), 400);
      }
    }
  };

  return (
    <View style={{ alignItems: 'center', gap: space.lg }}>
      <T v="heading">{prompt}</T>
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <Row gap={space.md}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: i < entry.length ? (error ? c.danger : c.primary) : c.surfaceAlt, borderWidth: 1, borderColor: c.border }} />
          ))}
        </Row>
      </Animated.View>
      {/* Always there (empty until needed) so the keypad doesn't jump when it shows. */}
      <View style={{ height: 22, justifyContent: 'center' }} accessibilityLiveRegion="polite">
        <T color={c.danger}>{error ? 'Try again' : ' '}</T>
      </View>
      <View style={{ width: 260, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) =>
          d === '' ? (
            <View key={i} style={{ width: 72, height: 72 }} />
          ) : (
            <Pressable
              key={i}
              onPress={() => press(d)}
              accessibilityRole="button"
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
