import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PinPad } from '@/components/PinPad';
import type { Child } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Button, Row, Screen, Sheet, space, T, useColors } from '@/ui';

/** "Who's learning?" — avatar select, with an optional kid PIN. */
export default function KidPicker() {
  const c = useColors();
  const kids = useStore((s) => s.children);
  const family = useStore((s) => s.family);
  const setMode = useStore((s) => s.setMode);
  const [pinFor, setPinFor] = useState<Child | null>(null);
  const [parentGate, setParentGate] = useState(false);

  const enter = (k: Child) => {
    setMode({ kind: 'kid', childId: k.id });
    router.replace({ pathname: '/kid/[id]', params: { id: k.id } });
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxl }}>
        <T v="display">Who&apos;s learning today?</T>
        <T muted>Tap your picture</T>
      </View>
      <Row wrap gap={space.lg} style={{ justifyContent: 'center', marginTop: space.xxl }}>
        {kids.map((k) => (
          <Pressable
            key={k.id}
            onPress={() => (k.pin ? setPinFor(k) : enter(k))}
            accessibilityLabel={k.name}
            style={({ pressed }) => ({ alignItems: 'center', gap: 8, padding: space.lg, borderRadius: 28, backgroundColor: pressed ? c.primarySoft : c.surface, borderWidth: 3, borderColor: k.color, width: 160 })}>
            <Text style={{ fontSize: 72 }}>{k.avatar}</Text>
            <T v="title">{k.name}</T>
            <T v="caption" muted>⭐ {k.sparks} sparks</T>
          </Pressable>
        ))}
      </Row>
      <View style={{ alignItems: 'center', marginTop: space.xxl }}>
        <Button kind="ghost" title="Back to parent view" onPress={() => setParentGate(true)} />
      </View>

      <Sheet visible={!!pinFor} onClose={() => setPinFor(null)} title={`Hi ${pinFor?.name ?? ''}!`}>
        {pinFor ? <PinPad prompt="Enter your secret code" expected={pinFor.pin!} onSuccess={() => { const k = pinFor; setPinFor(null); enter(k); }} /> : null}
      </Sheet>
      <Sheet visible={parentGate} onClose={() => setParentGate(false)} title="Grown-ups only">
        <PinPad
          prompt="Parent PIN"
          expected={family?.parentPin ?? ''}
          onSuccess={() => {
            setParentGate(false);
            setMode({ kind: 'parent' });
            router.replace('/today');
          }}
        />
      </Sheet>
    </Screen>
  );
}
