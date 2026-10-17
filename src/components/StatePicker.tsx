import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { STATE_LAWS } from '@/lib/states';
import { Chip, Field, Row, Sheet, T, useColors } from '@/ui';

export function StatePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = STATE_LAWS.find((s) => s.code === value);
  const list = STATE_LAWS.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.code.toLowerCase() === q.toLowerCase());

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 }}>
        <T muted={!current}>{current ? `${current.name} (${current.code})` : 'Choose a state…'}</T>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Choose your state">
        <Field placeholder="Search…" value={q} onChangeText={setQ} autoFocus />
        <Row wrap>
          {list.map((s) => (
            <Chip
              key={s.code}
              label={s.name}
              selected={s.code === value}
              onPress={() => {
                onChange(s.code);
                setOpen(false);
                setQ('');
              }}
            />
          ))}
        </Row>
      </Sheet>
    </View>
  );
}
