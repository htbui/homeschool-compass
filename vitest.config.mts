import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Domain logic in src/lib is pure TypeScript; test it without the Expo/RN toolchain.
// Store tests import through the app's `@/` alias (with AsyncStorage mocked).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/store/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/lib/library/**'],
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
