import { useState } from 'react';
import { Pressable, Text, View, type TextInputProps } from 'react-native';

import { Field, useColors } from '@/ui';

/** A password input with a show/hide toggle (typing a password on a phone is error-prone). */
export function PasswordField({ label, hint, ...rest }: Omit<TextInputProps, 'secureTextEntry'> & { label: string; hint?: string }) {
  const c = useColors();
  const [shown, setShown] = useState(false);
  return (
    <View>
      <Field label={label} hint={hint} secureTextEntry={!shown} autoCapitalize="none" autoCorrect={false} {...rest} style={{ paddingRight: 64 }} />
      <Pressable
        onPress={() => setShown(!shown)}
        accessibilityRole="button"
        accessibilityLabel={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        style={{ position: 'absolute', right: 0, top: 24, height: 44, minWidth: 60, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>{shown ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
}
