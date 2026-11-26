// Scripts run by hand (`pnpm sessions`, `pnpm judge-models`): vitest runs the TypeScript.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.script.ts'],
    testTimeout: 60 * 60_000,
  },
});
