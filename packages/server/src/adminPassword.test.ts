import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { passwordAllowed } from './auth.js';
import type { Env } from './env.js';
import { ADMIN_PASSWORD, tempDb, testDeps, testEnv, type TempDb } from './test-helpers.js';
import { vercelEnv } from './vercel.js';

/**
 * Where the admin password works: off Vercel (local and e2e) and on a Vercel preview (the
 * development site), never in production or in the Vercel function without VERCEL_ENV, and
 * never when it is empty.
 */
describe('passwordAllowed', () => {
  it('takes the password off Vercel and on a preview', () => {
    expect(passwordAllowed(testEnv())).toBe(true);
    expect(passwordAllowed(testEnv({ VERCEL_ENV: 'preview' }))).toBe(true);
    expect(passwordAllowed(vercelEnv(testEnv({ VERCEL_ENV: 'preview' })))).toBe(true);
  });

  it('refuses it in production, and in the Vercel function with no VERCEL_ENV', () => {
    expect(passwordAllowed(testEnv({ VERCEL_ENV: 'production' }))).toBe(false);
    expect(passwordAllowed(vercelEnv(testEnv({ VERCEL_ENV: 'production' })))).toBe(false);
    expect(passwordAllowed(vercelEnv(testEnv()))).toBe(false);
    expect(passwordAllowed(testEnv({ VERCEL_ENV: 'development' }))).toBe(false);
  });

  it('off Vercel, follows DEPLOY_ENV: refused in production, taken in preview and local (the default)', () => {
    expect(passwordAllowed(testEnv({ DEPLOY_ENV: 'production' }))).toBe(false);
    expect(passwordAllowed(testEnv({ DEPLOY_ENV: 'preview' }))).toBe(true);
    expect(passwordAllowed(testEnv({ DEPLOY_ENV: 'local' }))).toBe(true);
  });

  it('on Vercel, goes by VERCEL_ENV whatever DEPLOY_ENV says', () => {
    expect(passwordAllowed(vercelEnv(testEnv({ VERCEL_ENV: 'production', DEPLOY_ENV: 'preview' })))).toBe(false);
    expect(passwordAllowed(testEnv({ VERCEL_ENV: 'production', DEPLOY_ENV: 'local' }))).toBe(false);
    expect(passwordAllowed(vercelEnv(testEnv({ DEPLOY_ENV: 'local' })))).toBe(false);
    expect(passwordAllowed(vercelEnv(testEnv({ VERCEL_ENV: 'preview', DEPLOY_ENV: 'production' })))).toBe(true);
  });

  it('refuses an empty password anywhere', () => {
    expect(passwordAllowed(testEnv({ ADMIN_PASSWORD: '' }))).toBe(false);
    expect(passwordAllowed(testEnv({ ADMIN_PASSWORD: '', VERCEL_ENV: 'preview' }))).toBe(false);
  });
});

describe('the password at /api/admin/me', () => {
  let t: TempDb | undefined;
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    t?.cleanup();
  });
  async function serve(env: Partial<Env>): Promise<FastifyInstance> {
    t = await tempDb();
    app = await buildApp({ ...testDeps(t.db), env: testEnv(env) });
    await app.ready();
    return app;
  }
  const me = (a: FastifyInstance, password?: string) =>
    a.inject({ url: '/api/admin/me', headers: password === undefined ? {} : { authorization: `Bearer ${password}` } });

  it('lets the password in on a preview, and tells /admin to offer the form', async () => {
    const a = await serve(vercelEnv(testEnv({ VERCEL_ENV: 'preview' })));
    expect((await me(a, ADMIN_PASSWORD)).json()).toEqual({ via: 'password' });
    const out = await me(a);
    expect(out.statusCode).toBe(401);
    expect(out.json()).toMatchObject({ password: true });
  });

  it('turns the password away in production, and offers no form', async () => {
    const a = await serve(vercelEnv(testEnv({ VERCEL_ENV: 'production' })));
    const res = await me(a, ADMIN_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'admin sign-in required', password: false });
  });

  it('turns the password away off Vercel with DEPLOY_ENV=production, and offers no form', async () => {
    const a = await serve(testEnv({ DEPLOY_ENV: 'production' }));
    const res = await me(a, ADMIN_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'admin sign-in required', password: false });
  });

  it('turns away an empty password on a preview, and offers no form', async () => {
    const a = await serve(vercelEnv(testEnv({ VERCEL_ENV: 'preview', ADMIN_PASSWORD: '' })));
    const res = await a.inject({ url: '/api/admin/me', headers: { authorization: 'Bearer  ' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ password: false });
  });
});
