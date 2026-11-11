import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { Button, T, useColors } from '@/ui';

const RELOAD_KEY = 'kinship-reloaded-for-update';

/** A newer version was deployed while this page was open, so a screen's code file is gone. */
const isStaleBuild = (e: Error) => /Loading chunk|dynamically imported module|Importing a module script failed|Unexpected token '<'|Requiring unknown module|ChunkLoadError|AsyncRequireError|Loading module .* failed/i.test(`${e.name} ${e.message}`);

/**
 * Root error screen. On the web, a screen that fails to load because the app
 * was updated reloads once to pick up the new version; anything else shows a
 * friendly message with a way to try again.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const c = useColors();
  const stale = Platform.OS === 'web' && isStaleBuild(error);

  useEffect(() => {
    if (!stale) return;
    try {
      if (!sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
      }
    } catch {
      // Storage blocked: fall through to the manual button.
    }
  }, [stale]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: c.bg }}>
      <T style={{ fontSize: 48 }}>🧭</T>
      <T v="title" style={{ textAlign: 'center' }}>{stale ? 'Freerange was updated' : 'Something went wrong'}</T>
      <T muted style={{ textAlign: 'center', maxWidth: 420 }}>
        {stale ? 'Reload to get the latest version. Your data is saved.' : 'Your data is saved on this device. Try again, and if it keeps happening, reload the app.'}
      </T>
      <Button
        title={stale ? 'Reload' : 'Try again'}
        onPress={() => {
          if (stale && Platform.OS === 'web') window.location.reload();
          else retry();
        }}
      />
      {!stale && Platform.OS === 'web' ? <Button kind="ghost" title="Reload the app" onPress={() => window.location.reload()} /> : null}
    </View>
  );
}

/**
 * Clear the one-time reload flag once the app has run fine for a while, so a
 * later update can reload again — but a screen that fails right after loading
 * can't cause a reload loop.
 */
export function markLoaded() {
  if (Platform.OS !== 'web') return;
  setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      // ignore
    }
  }, 15000);
}
