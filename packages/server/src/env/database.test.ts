import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

describe('loadEnv: database', () => {
  it('passes remote database URLs through', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('DATABASE_URL', 'libsql://x.turso.io');
    vi.stubEnv('DATABASE_AUTH_TOKEN', 'tok');
    const env = loadEnv();
    expect(env.DATABASE_URL).toBe('libsql://x.turso.io');
    expect(env.DATABASE_AUTH_TOKEN).toBe('tok');
  });
});
