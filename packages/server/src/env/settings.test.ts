import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import { FUNCTION_LIMIT_MS } from '../gateway/turn-checks.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

/** What Vercel sets in a production function. */
function onVercel() {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'edw.vercel.app');
  vi.stubEnv('VERCEL_URL', 'edw-abc123.vercel.app');
}

describe('deployment settings', () => {
  it('on Vercel, default to what the code did before they were settings', () => {
    onVercel();
    vi.stubEnv('LIBRARY_TOKEN', 'tok');
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass');
    expect(loadEnv()).toMatchObject({
      TRUST_PROXY: true,
      FUNCTION_LIMIT_MS: 300_000,
      AUTH_BASE_URL: 'https://edw.vercel.app',
      LIBRARY_URL: 'https://edw.vercel.app/library',
      LIBRARY_BYPASS_SECRET: 'bypass',
    });
    // vercel.json's maxDuration, which the checks kept to before the setting.
    expect(FUNCTION_LIMIT_MS).toBe(300_000);
  });

  it('off Vercel, trust no forwarded address and keep the same function limit', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    expect(loadEnv()).toMatchObject({ TRUST_PROXY: false, FUNCTION_LIMIT_MS: 300_000, AUTH_BASE_URL: 'http://localhost:3000' });
    expect(loadEnv().LIBRARY_BYPASS_SECRET).toBeUndefined();
  });

  it('reads TRUST_PROXY and FUNCTION_LIMIT_MS when set, on Vercel or not', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('TRUST_PROXY', 'true');
    vi.stubEnv('FUNCTION_LIMIT_MS', '120000');
    expect(loadEnv()).toMatchObject({ TRUST_PROXY: true, FUNCTION_LIMIT_MS: 120_000 });
    onVercel();
    vi.stubEnv('TRUST_PROXY', 'false');
    expect(loadEnv().TRUST_PROXY).toBe(false);
  });

  it('refuses a TRUST_PROXY or FUNCTION_LIMIT_MS it cannot read', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('TRUST_PROXY', 'yes please');
    expect(() => loadEnv()).toThrow(/TRUST_PROXY/);
    vi.stubEnv('TRUST_PROXY', '');
    vi.stubEnv('FUNCTION_LIMIT_MS', '-1');
    expect(() => loadEnv()).toThrow(/FUNCTION_LIMIT_MS/);
  });

  it('sends the protection bypass only to the library Vercel worked out, never one set by hand', () => {
    onVercel();
    vi.stubEnv('LIBRARY_TOKEN', 'tok');
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass');
    vi.stubEnv('LIBRARY_URL', 'https://lib.example.org');
    expect(loadEnv().LIBRARY_BYPASS_SECRET).toBeUndefined();
  });

  it('keeps VERCEL_ENV as a key when it is not set, as before env/ was split', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    // Deleted, not empty: zod keeps a key that is in process.env even when empty.
    vi.stubEnv('VERCEL_ENV', undefined);
    const e = loadEnv();
    expect(Object.keys(e)).toContain('VERCEL_ENV');
    expect(e.VERCEL_ENV).toBeUndefined();
  });
});
