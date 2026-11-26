import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

describe('loadEnv: library', () => {
  it("on Vercel with LIBRARY_TOKEN, finds the library at the project's own domain unless LIBRARY_URL says otherwise", () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'edw.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'edw-git-main-sam.vercel.app');
    vi.stubEnv('VERCEL_URL', 'edw-abc123-sam.vercel.app');
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass');
    // No token: the library function would refuse every call, so there is no library.
    expect(loadEnv().LIBRARY_URL).toBeUndefined();
    vi.stubEnv('LIBRARY_TOKEN', 'tok');
    expect(loadEnv()).toMatchObject({ LIBRARY_URL: 'https://edw.vercel.app/library', LIBRARY_BYPASS_SECRET: 'bypass' });
    // Set by hand, it is not the deployment's own library, even at the same address.
    vi.stubEnv('LIBRARY_URL', 'https://lib.example.org');
    expect(loadEnv()).toMatchObject({ LIBRARY_URL: 'https://lib.example.org', LIBRARY_BYPASS_SECRET: undefined });
    vi.stubEnv('LIBRARY_URL', 'https://edw.vercel.app/library');
    expect(loadEnv()).toMatchObject({ LIBRARY_URL: 'https://edw.vercel.app/library', LIBRARY_BYPASS_SECRET: undefined });
    // Off Vercel (a laptop, Docker), only LIBRARY_URL names a library.
    vi.stubEnv('LIBRARY_URL', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('VERCEL_BRANCH_URL', '');
    vi.stubEnv('VERCEL_URL', '');
    expect(loadEnv().LIBRARY_URL).toBeUndefined();
  });

  it("a preview (the development site) uses its own deployment's library, at its branch address", () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('LIBRARY_TOKEN', 'tok');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'edw.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'edw-git-development-sam.vercel.app');
    vi.stubEnv('VERCEL_URL', 'edw-abc123-sam.vercel.app');
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass');
    const env = loadEnv();
    expect(env.LIBRARY_URL).toBe('https://edw-git-development-sam.vercel.app/library');
    expect(env.LIBRARY_BYPASS_SECRET).toBe('bypass');
    vi.stubEnv('VERCEL_BRANCH_URL', '');
    expect(loadEnv().LIBRARY_URL).toBe('https://edw-abc123-sam.vercel.app/library');
  });
});
