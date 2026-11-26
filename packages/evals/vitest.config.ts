// The harness's own tests (mock provider, no network): part of the normal `pnpm test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
