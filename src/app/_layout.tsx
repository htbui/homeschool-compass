import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { markLoaded } from '@/components/AppErrorBoundary';
import { PrintSetupSheet } from '@/components/PrintSetupSheet';
import { startSync } from '@/services/sync';
import { useStore } from '@/store/useStore';
import { useStudio } from '@/store/useStudio';
import { useColors } from '@/ui';

export { AppErrorBoundary as ErrorBoundary } from '@/components/AppErrorBoundary';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const familyHydrated = useStore((s) => s.hydrated);
  const studioHydrated = useStudio((s) => s.hydrated);
  const hydrated = familyHydrated && studioHydrated;

  useEffect(() => {
    if (hydrated) {
      SplashScreen.hideAsync();
      markLoaded();
      // Start cloud sync only after local data has loaded, so it merges against the real state.
      startSync();
    }
  }, [hydrated]);

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.surface, text: c.text, border: c.border, primary: c.primary } };

  if (!hydrated) return null;

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(parent)" />
        <Stack.Screen name="kid" />
        <Stack.Screen name="records" />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="account" options={{ headerShown: true, title: 'Account & sync' }} />
        <Stack.Screen name="moderation" options={{ headerShown: true, title: 'Moderation' }} />
        <Stack.Screen name="listing/[id]" options={{ headerShown: true, title: 'Curriculum', headerBackTitle: 'Marketplace' }} />
        <Stack.Screen name="studio" />
      </Stack>
      <PrintSetupSheet />
    </ThemeProvider>
  );
}
