import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

import { Button, Card, Row, T, useColors } from '@/ui';

import { CopyButton } from './CopyButton';

/** A code (and the link that opens it) to pass on by text, email, or in person. */
export function ShareCode({ code, display, path, message, label }: { code: string; display?: string; path: string; message: string; label: string }) {
  const c = useColors();
  const link = Linking.createURL(path);
  return (
    <Card tint={c.primarySoft}>
      <T v="label">{label}</T>
      <T v="display" style={{ letterSpacing: 3 }} selectable accessibilityLabel={`Code ${code.split('').join(' ')}`}>
        {display ?? code}
      </T>
      <T v="caption" selectable>{link}</T>
      <Row wrap gap={6}>
        {Platform.OS === 'web' ? (
          <>
            <CopyButton title="Copy link" text={link} />
            <CopyButton title="Copy code" text={display ?? code} />
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
              <Button size="sm" kind="secondary" title="Share…" onPress={() => navigator.share({ text: `${message}\n\n${link}\nCode: ${display ?? code}` }).catch(() => {})} />
            ) : null}
          </>
        ) : (
          <Button size="sm" kind="secondary" title="Share…" onPress={() => Share.share({ message: `${message}\n\n${link}\nCode: ${display ?? code}` }).catch(() => {})} />
        )}
      </Row>
    </Card>
  );
}
