import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';

import { Button, Card, Row, T, useColors } from '@/ui';

/** Copy on the web (navigator.clipboard); false when the browser refuses. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A code (and the link that opens it) to pass on by text, email, or in person. */
export function ShareCode({ code, display, path, message, label }: { code: string; display?: string; path: string; message: string; label: string }) {
  const c = useColors();
  const link = Linking.createURL(path);
  const text = `${message}\n\n${link}\nCode: ${display ?? code}`;
  const [copied, setCopied] = useState<'link' | 'code' | 'failed' | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  const web = Platform.OS === 'web';
  const canShare = web && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async (what: 'link' | 'code') => setCopied((await copyText(what === 'link' ? link : (display ?? code))) ? what : 'failed');
  return (
    <Card tint={c.primarySoft}>
      <T v="label" color={c.primaryInk}>{label}</T>
      <T v="display" style={{ letterSpacing: 3 }} selectable accessibilityLabel={`Code ${code.split('').join(' ')}`}>
        {display ?? code}
      </T>
      <T v="caption" selectable>{link}</T>
      {web ? (
        <Row wrap>
          <Button size="sm" kind="secondary" title={copied === 'link' ? 'Copied ✓' : '🔗 Copy link'} onPress={() => copy('link')} />
          <Button size="sm" kind="secondary" title={copied === 'code' ? 'Copied ✓' : '📋 Copy code'} onPress={() => copy('code')} />
          {canShare ? <Button size="sm" kind="secondary" title="Share…" onPress={() => navigator.share({ text }).catch(() => {})} /> : null}
        </Row>
      ) : (
        <Button size="sm" kind="secondary" title="Share…" onPress={() => Share.share({ message: text }).catch(() => {})} />
      )}
      {copied ? (
        <T v="caption" color={copied === 'failed' ? c.dangerInk : c.primaryInk} accessibilityLiveRegion="polite">
          {copied === 'failed' ? 'Couldn’t copy here. Select the text above and copy it.' : copied === 'link' ? 'Link copied. Paste it into a text or email.' : 'Code copied.'}
        </T>
      ) : null}
    </Card>
  );
}
