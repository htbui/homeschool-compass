import { Pressable, View } from 'react-native';

import { space, T, useColors } from '@/ui';

/**
 * A labelled on/off setting. The whole row is the switch (one big target, announced as a
 * switch with its state), with the explanation under the label.
 */
export function SwitchRow({ label, body, value, onChange }: { label: string; body?: string; value: boolean; onChange: (on: boolean) => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      accessibilityLabel={label}
      accessibilityHint={body}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: 6, minHeight: 44, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label">{label}</T>
        {body ? <T v="caption" muted>{body}</T> : null}
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? c.primary : c.surfaceAlt, borderWidth: 1, borderColor: value ? c.primary : c.border, justifyContent: 'center' }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: value ? c.primaryText : c.textMuted, alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </View>
    </Pressable>
  );
}
