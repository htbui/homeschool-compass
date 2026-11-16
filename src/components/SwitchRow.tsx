import { Pressable, Switch, View } from 'react-native';

import { space, T, useColors } from '@/ui';

/** An on/off setting with its label: the whole row is one switch for screen readers and taps. */
export function SwitchRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      role="switch"
      aria-checked={value}
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label">{label}</T>
        {hint ? <T v="caption" muted>{hint}</T> : null}
      </View>
      {/* Decorative: the row is the control (a focusable switch inside a switch would be announced twice). */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" aria-hidden>
        <Switch value={value} disabled={disabled} trackColor={{ true: c.primary, false: c.border }} thumbColor={c.surface} />
      </View>
    </Pressable>
  );
}
