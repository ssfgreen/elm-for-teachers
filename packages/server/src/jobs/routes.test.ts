import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { ENV_KEYS, loadEnv } from '../env.js';
import { tempDb, testDeps, type TempDb } from '../test-helpers.js';
import { enqueue, getJob } from './store.js';

const SECRET = 'a-cron-secret-of-some-length';
let t: TempDb;
let app: FastifyInstance | undefined;

async function start(secret: string | undefined) {
  const deps = testDeps(t.db);
  app = await buildApp({ ...deps, env: { ...deps.env, CRON_SECRET: secret } });
}

beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  t.cleanup();
});

describe('GET /api/jobs/run', () => {
  it('refuses without the secret, with the wrong one, and when none is set, and runs nothing', async () => {
    const id = await enqueue(t.db, 'noop', null);
    await start(SECRET);
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: SECRET }]) {
      const res = await app!.inject({ method: 'GET', url: '/api/jobs/run', headers });
      expect(res.statusCode).toBe(401);
    }
    await app!.close();
    await start(undefined);
    expect((await app!.inject({ method: 'GET', url: '/api/jobs/run', headers: { authorization: 'Bearer ' } })).statusCode).toBe(401);
    expect((await getJob(t.db, id))?.status).toBe('queued');
  });

  it('runs the due jobs with the secret', async () => {
    const id = await enqueue(t.db, 'noop', null);
    await start(SECRET);
    const res = await app!.inject({ method: 'GET', url: '/api/jobs/run', headers: { authorization: `Bearer ${SECRET}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, done: 1, retry: 0, failed: 0, lost: 0 });
    expect((await getJob(t.db, id))?.status).toBe('done');
  });
});

describe('CRON_SECRET', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is read from the environment, and refused when shorter than 16 characters', () => {
    for (const k of ENV_KEYS) vi.stubEnv(k, '');
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    expect(loadEnv().CRON_SECRET).toBeUndefined();
    vi.stubEnv('CRON_SECRET', SECRET);
    expect(loadEnv().CRON_SECRET).toBe(SECRET);
    vi.stubEnv('CRON_SECRET', 'short');
    expect(() => loadEnv()).toThrow(/CRON_SECRET must be at least 16 characters/);
  });
});
