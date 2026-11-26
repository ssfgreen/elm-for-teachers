/** Test-only: empty every variable loadEnv reads, so the shell and .env cannot reach them. */
import { afterEach, beforeEach, vi } from 'vitest';
import { ENV_KEYS } from '../env.js';

/** Call at the top of a test file. dotenv never overrides a set variable, and empty counts as unset. */
export function emptyEveryKey(): void {
  beforeEach(() => {
    for (const k of ENV_KEYS) vi.stubEnv(k, '');
  });
  afterEach(() => vi.unstubAllEnvs());
}
