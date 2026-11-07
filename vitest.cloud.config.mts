import { defineConfig } from 'vitest/config';

// Integration tests against the local Supabase stack (`npm run db:start` first).
export default defineConfig({
  test: { include: ['supabase/tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
});
