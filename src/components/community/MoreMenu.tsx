import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { blockFamily } from '@/services/messagesApi';
import { ReportSheet } from '@/components/market/ReportSheet';
import { Button, fonts, Sheet, Stack, T, useColors, useConfirm } from '@/ui';

export interface MenuItem {
  label: string;
  onPress: () => void;
  danger?: boolean;
  hint?: string;
}

/** A "⋯" button (a 44 pt target) that opens a short list of actions in a sheet. */
export function MoreMenu({ label, title, items }: { label: string; title: string; items: MenuItem[] }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ fontSize: 22, lineHeight: 24, color: c.textMuted, fontFamily: fonts.body }}>⋯</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <Stack gap={6}>
          {items.map((it) => (
            <Stack key={it.label} gap={2}>
              <Button
                kind={it.danger ? 'quietDanger' : 'secondary'}
                title={it.label}
                style={{ alignSelf: 'stretch' }}
                onPress={() => {
                  setOpen(false);
                  it.onPress();
                }}
              />
              {it.hint ? <T v="caption" muted>{it.hint}</T> : null}
            </Stack>
          ))}
        </Stack>
      </Sheet>
    </>
  );
}

/**
 * Report or block a family from wherever you meet them (the finder, a connection request).
 * `note` is what they wrote to you, passed on to the moderators with the report.
 */
export function FamilyMenu({ familyId, name, note, label, onBlocked }: { familyId: string; name: string; note?: string; label?: string; onBlocked: () => void }) {
  const confirm = useConfirm();
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState('');
  const c = useColors();
  const block = () =>
    confirm.ask(`Block ${name}?`, () => blockFamily(familyId).then(onBlocked, (e: Error) => setError(e.message)), {
      confirm: 'Block',
      body: 'You won’t see each other in the finder, and neither of you can send connection requests or messages. Any connection ends. They aren’t told. You can unblock from Messages.',
    });
  return (
    <>
      <MoreMenu
        label={label ?? `More for ${name}`}
        title={name}
        items={[
          { label: `🚩 Report ${name}`, onPress: () => setReporting(true), hint: 'A Freerange moderator looks at their profile and what you tell us.' },
          { label: `⛔ Block ${name}`, onPress: block, danger: true },
        ]}
      />
      {error ? <T v="caption" color={c.danger}>{error}</T> : null}
      <ReportSheet target={reporting ? { kind: 'family', id: familyId } : undefined} name={name} details={note ? `Their note to us: “${note}”` : undefined} onClose={() => setReporting(false)} />
      {confirm.element}
    </>
  );
}
