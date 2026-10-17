import { defineConfig } from 'vitest/config';

// Domain logic in src/lib is pure TypeScript; test it without the Expo/RN toolchain.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
