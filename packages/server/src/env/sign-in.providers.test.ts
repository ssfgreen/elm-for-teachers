import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';
import { tempDb, testDeps } from '../test-helpers.js';
import { emptyEveryKey } from './test-helpers.js';

emptyEveryKey();

describe('loadEnv: sign-in providers offered', () => {
  const SECRET = 'x'.repeat(32);

  it('offers Google at /api/auth/providers with GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret');
    vi.stubEnv('AUTH_SECRET', SECRET);
    const t = await tempDb();
    const app = await buildApp({ ...testDeps(t.db), env: loadEnv() });
    try {
      const res = await app.inject({ url: '/api/auth/providers' });
      expect(res.json()).toEqual({ providers: [{ id: 'google', label: 'Google', kind: 'oidc' }] });
    } finally {
      await app.close();
      t.cleanup();
    }
  });

  it('offers Microsoft at /api/auth/providers with MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and AUTH_SECRET', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'mid');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'msecret');
    vi.stubEnv('AUTH_SECRET', SECRET);
    const t = await tempDb();
    const app = await buildApp({ ...testDeps(t.db), env: loadEnv() });
    try {
      const res = await app.inject({ url: '/api/auth/providers' });
      expect(res.json()).toEqual({ providers: [{ id: 'microsoft', label: 'Microsoft', kind: 'oidc' }] });
    } finally {
      await app.close();
      t.cleanup();
    }
  });
});
