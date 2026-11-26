// The evals themselves: real model calls, run only on demand (`pnpm --filter @edw/evals eval`).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['evals/**/*.eval.ts'],
    globalSetup: ['src/run.ts'],
    // One case at a time: the report times each call, and ELM is shared.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 10 * 60_000,
    hookTimeout: 60_000,
  },
});
