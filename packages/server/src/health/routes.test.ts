import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { Db } from '../db/client.js';
import { tempDb, testDeps, type TempDb } from '../test-helpers.js';

let t: TempDb;
let app: FastifyInstance;
beforeEach(async () => {
  t = await tempDb();
  app = await buildApp(testDeps(t.db));
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

describe('GET /api/health/ready', () => {
  it('is 200 when the schema is current', async () => {
    const res = await app.inject('/api/health/ready');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('is 503 when a migration is not applied', async () => {
    await t.db.execute("DELETE FROM schema_migrations WHERE name = (SELECT MAX(name) FROM schema_migrations)");
    const res = await app.inject('/api/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, reason: 'schema', pending: 1 });
  });

  it('is 503 when the database does not answer', async () => {
    const broken = { ...t.db, execute: () => Promise.reject(new Error('unreachable')) } as unknown as Db;
    const other = await buildApp({ ...testDeps(t.db), db: broken });
    const res = await other.inject('/api/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, reason: 'database' });
    await other.close();
  });

  it('is 503 with its own reason when the schema cannot be compared', async () => {
    // The database answers SELECT 1, but reading schema_migrations fails.
    const half = { ...t.db, execute: (sql: string) => (sql === 'SELECT 1' ? t.db.execute(sql) : Promise.reject(new Error('disk I/O error'))) } as unknown as Db;
    const other = await buildApp({ ...testDeps(t.db), db: half });
    const res = await other.inject('/api/health/ready');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, reason: 'migrations' });
    await other.close();
  });
});
