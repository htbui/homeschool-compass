import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AttentionMode } from '@/lib/types';

import { fonts, MAX_WIDTH, MODE_META, modeColors, radius, space, useColors } from './theme';

export * from './theme';
export { DateField, MoneyField, ParsedField, TimeField } from './fields';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

const variantStyle: Record<Variant, object> = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '800', fontFamily: fonts.display },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', fontFamily: fonts.display },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16 },
};

export function T({ v = 'body', muted, color, style, ...rest }: TextProps & { v?: Variant; muted?: boolean; color?: string }) {
  const c = useColors();
  return <Text style={[{ color: color ?? (muted ? c.textMuted : c.text), fontFamily: fonts.body }, variantStyle[v], style]} {...rest} />;
}

/** Page wrapper: safe area, scroll, centered max-width column. */
export function Screen({ children, scroll = true, padded = true, edges = ['top'] }: { children: ReactNode; scroll?: boolean; padded?: boolean; edges?: ('top' | 'bottom')[] }) {
  const c = useColors();
  const inner = <View style={[styles.column, padded && { padding: space.lg, paddingBottom: space.xxl * 2 }]}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tint?: string }) {
  const c = useColors();
  const base = [styles.card, { backgroundColor: tint ?? c.surface, borderColor: c.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export function Button({
  title,
  kind = 'primary',
  icon,
  size = 'md',
  loading,
  style,
  reason,
  ...rest
}: PressableProps & {
  title: string;
  kind?: BtnKind;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Shown under the button while it's disabled, so people know what's missing. */
  reason?: string;
}) {
  const c = useColors();
  const palette: Record<BtnKind, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c.primaryText, border: c.primary },
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
    accent: { bg: c.accent, fg: '#2B1D05', border: c.accent },
  };
  const p = palette[kind];
  if (rest.disabled && reason) {
    return (
      <View style={[{ gap: 4 }, style]}>
        <Button title={title} kind={kind} icon={icon} size={size} loading={loading} {...rest} />
        <Text style={{ color: c.textMuted, fontSize: 12, fontFamily: fonts.body, textAlign: 'center' }}>{reason}</Text>
      </View>
    );
  }
  const pad = size === 'sm' ? { paddingVertical: 6, paddingHorizontal: 12 } : size === 'lg' ? { paddingVertical: 16, paddingHorizontal: 22 } : { paddingVertical: 11, paddingHorizontal: 16 };
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={({ pressed }) => [
        styles.btn,
        pad,
        { backgroundColor: p.bg, borderColor: p.border, opacity: rest.disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <Text style={{ color: p.fg, fontWeight: '700', fontSize: size === 'lg' ? 17 : size === 'sm' ? 13 : 15, fontFamily: fonts.body }}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const c = useColors();
  const active = color ?? c.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: selected ? active : c.border, backgroundColor: selected ? active : c.surface, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Text style={{ color: selected ? '#fff' : c.text, fontSize: 13, fontWeight: '600', fontFamily: fonts.body }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, style, ...rest }: TextInputProps & { label?: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="label">{label}</T> : null}
      <TextInput
        placeholderTextColor={c.textMuted}
        {...rest}
        style={[styles.input, { borderColor: c.border, backgroundColor: c.surface, color: c.text, fontFamily: fonts.body }, rest.multiline && { minHeight: 80, textAlignVertical: 'top' }, style]}
      />
      {hint ? <T v="caption" muted>{hint}</T> : null}
    </View>
  );
}

export function Row({ children, gap = space.sm, wrap, style, align = 'center' }: { children: ReactNode; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle>; align?: 'center' | 'flex-start' | 'flex-end' | 'stretch' }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Stack({ children, gap = space.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Section({ title, action, children, subtitle }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.md, marginTop: space.xl }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T v="heading">{title}</T>
          {subtitle ? <T v="caption" muted>{subtitle}</T> : null}
        </View>
        {action}
      </Row>
      {children}
    </View>
  );
}

export function ModeBadge({ mode, compact }: { mode: AttentionMode; compact?: boolean }) {
  const c = useColors();
  const m = modeColors(c, mode);
  return (
    <View style={[styles.badge, { backgroundColor: m.bg }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.fg }} />
      <Text style={{ color: m.fg, fontSize: 11, fontWeight: '700', fontFamily: fonts.body }}>{compact ? MODE_META[mode].short : MODE_META[mode].label}</Text>
    </View>
  );
}

export function Pill({ text, fg, bg }: { text: string; fg?: string; bg?: string }) {
  const c = useColors();
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? c.surfaceAlt }]}>
      <Text style={{ color: fg ?? c.textMuted, fontSize: 11, fontWeight: '700', fontFamily: fonts.body }}>{text}</Text>
    </View>
  );
}

export function Progress({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const c = useColors();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color ?? c.primary, borderRadius: height }} />
    </View>
  );
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.sm }}>
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <T v="heading" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T muted style={{ textAlign: 'center', maxWidth: 420 }}>{body}</T> : null}
      {action}
    </View>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const c = useColors();
  return (
    <View style={[styles.segment, { backgroundColor: c.surfaceAlt }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segmentItem, on && { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ color: on ? c.text : c.textMuted, fontWeight: '700', fontSize: 13, fontFamily: fonts.body }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bottom sheet on phones, centered dialog on wide screens. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const c = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Backdrop is a sibling layer, not a wrapper: a focusable Pressable around the
            content steals focus from text inputs on web. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close dialog" />
        <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <T v="title" style={{ flex: 1 }}>{title}</T>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12}>
              <Text style={{ fontSize: 22, color: c.textMuted }}>✕</Text>
            </Pressable>
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Cross-platform confirm (Alert.alert is a no-op on web). */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: string; confirm: string; onYes: () => void } | null>(null);
  const element = (
    <Sheet visible={!!state} onClose={() => setState(null)} title={state?.title ?? ''}>
      {state?.body ? <T muted>{state.body}</T> : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button title="Cancel" kind="secondary" onPress={() => setState(null)} />
        <Button
          title={state?.confirm ?? 'OK'}
          kind="danger"
          onPress={() => {
            state?.onYes();
            setState(null);
          }}
        />
      </Row>
    </Sheet>
  );
  const ask = (title: string, onYes: () => void, opts: { body?: string; confirm?: string } = {}) => setState({ title, onYes, body: opts.body, confirm: opts.confirm ?? 'Confirm' });
  return { ask, element };
}

export function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <T v="caption" muted>{label}</T>
      <T v="title" color={color}>{value}</T>
      {sub ? <T v="caption" muted>{sub}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flexGrow: 1 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  btn: { borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 8, alignSelf: 'flex-start' },
  segment: { flexDirection: 'row', borderRadius: radius.md, padding: 3, alignSelf: 'flex-start', flexWrap: 'wrap' },
  segmentItem: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', borderRadius: radius.lg, borderWidth: 1, padding: space.xl },
  stat: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: 2 },
});
