import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';

import { Button } from '@/ui';

/**
 * Copy text to the clipboard on the web. Native builds don't ship a clipboard
 * module, so there the button opens the share sheet instead (which has "Copy").
 */
async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  await Share.share({ message: text }).catch(() => {});
  return false;
}

/** "Copy link" → "Copied ✓" for a couple of seconds. */
export function CopyButton({ text, title, size = 'sm', kind = 'secondary' }: { text: string; title: string; size?: 'sm' | 'md'; kind?: 'secondary' | 'ghost' | 'primary' }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  const label = copied === true ? 'Copied ✓' : copied === false && Platform.OS === 'web' ? 'Couldn’t copy: select it instead' : title;
  return <Button size={size} kind={kind} title={label} accessibilityLabel={copied ? `${title}: copied` : title} onPress={() => copyText(text).then(setCopied)} />;
}
