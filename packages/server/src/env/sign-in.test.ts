import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

describe('loadEnv: sign-in', () => {
  const SECRET = 'x'.repeat(32);

  it('builds redirect addresses on PUBLIC_BASE_URL, else the Vercel address, else localhost', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    expect(loadEnv().AUTH_BASE_URL).toBe('http://localhost:3000');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'edw.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'edw-git-development-sam.vercel.app');
    expect(loadEnv().AUTH_BASE_URL).toBe('https://edw-git-development-sam.vercel.app');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(loadEnv().AUTH_BASE_URL).toBe('https://edw.vercel.app');
    vi.stubEnv('PUBLIC_BASE_URL', 'https://study.example.org/');
    expect(loadEnv().AUTH_BASE_URL).toBe('https://study.example.org');
  });

  it('needs a client id and secret together, and AUTH_SECRET with any provider', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid');
    expect(() => loadEnv()).toThrow(/set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither/);
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret');
    expect(() => loadEnv()).toThrow(/set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither/);
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid');
    expect(() => loadEnv()).toThrow(/AUTH_SECRET: required/);
    vi.stubEnv('AUTH_SECRET', 'short');
    expect(() => loadEnv()).toThrow(/at least 32/);
    vi.stubEnv('AUTH_SECRET', SECRET);
    expect(loadEnv()).toMatchObject({ GOOGLE_CLIENT_ID: 'gid', AUTH_SECRET: SECRET });
  });

  it('reads Microsoft from MICROSOFT_CLIENT_*, and needs AUTH_SECRET with it', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'mid');
    expect(() => loadEnv()).toThrow(/set both MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET, or neither/);
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'msecret');
    expect(() => loadEnv()).toThrow(/AUTH_SECRET: required/);
    vi.stubEnv('AUTH_SECRET', SECRET);
    expect(loadEnv()).toMatchObject({ MICROSOFT_CLIENT_ID: 'mid', MICROSOFT_CLIENT_SECRET: 'msecret' });
  });

  it('still reads the deprecated AUTH_MICROSOFT_CLIENT_* when neither new name is set', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('AUTH_MICROSOFT_CLIENT_SECRET', 'old-secret');
    expect(() => loadEnv()).toThrow(/set both AUTH_MICROSOFT_CLIENT_ID and AUTH_MICROSOFT_CLIENT_SECRET, or neither/);
    vi.stubEnv('AUTH_MICROSOFT_CLIENT_ID', 'old-id');
    expect(() => loadEnv()).toThrow(/AUTH_SECRET: required/);
    vi.stubEnv('AUTH_SECRET', SECRET);
    const env = loadEnv();
    expect(env).toMatchObject({ MICROSOFT_CLIENT_ID: 'old-id', MICROSOFT_CLIENT_SECRET: 'old-secret' });
    expect(env).not.toHaveProperty('AUTH_MICROSOFT_CLIENT_ID');
  });

  it('uses the new Microsoft names when both pairs are set, and never mixes a half from each', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('AUTH_SECRET', SECRET);
    vi.stubEnv('AUTH_MICROSOFT_CLIENT_ID', 'old-id');
    vi.stubEnv('AUTH_MICROSOFT_CLIENT_SECRET', 'old-secret');
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'mid');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'msecret');
    expect(loadEnv()).toMatchObject({ MICROSOFT_CLIENT_ID: 'mid', MICROSOFT_CLIENT_SECRET: 'msecret' });
    // A new id with only the old secret is a half pair under the new names.
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', '');
    vi.stubEnv('AUTH_MICROSOFT_CLIENT_ID', '');
    expect(() => loadEnv()).toThrow(/set both MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET, or neither/);
    vi.stubEnv('MICROSOFT_CLIENT_ID', '');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'msecret');
    vi.stubEnv('AUTH_MICROSOFT_CLIENT_ID', 'old-id');
    expect(() => loadEnv()).toThrow(/set both MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET, or neither/);
  });

  it('reads the open tenants and domains as lists', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('AUTH_OPEN_MICROSOFT_TENANTS', ' T-1 , t-2,');
    vi.stubEnv('AUTH_OPEN_GOOGLE_DOMAINS', 'School.example');
    expect(loadEnv()).toMatchObject({ AUTH_OPEN_MICROSOFT_TENANTS: ['t-1', 't-2'], AUTH_OPEN_GOOGLE_DOMAINS: ['school.example'] });
  });

  it('refuses the test provider in production', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('AUTH_SECRET', SECRET);
    vi.stubEnv('AUTH_TEST_ISSUER', 'http://127.0.0.1:9999');
    vi.stubEnv('NODE_ENV', 'test');
    expect(loadEnv()).toMatchObject({ AUTH_TEST_ISSUER: 'http://127.0.0.1:9999', NODE_ENV: 'test' });
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(() => loadEnv()).toThrow(/cannot run in production/);
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => loadEnv()).toThrow(/cannot run in production/);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEPLOY_ENV', 'production');
    expect(() => loadEnv()).toThrow(/cannot run in production/);
  });
});
