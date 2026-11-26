/** MIGRATE_ON_START: on by default, and off means createDeps runs no migration. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeps } from './bootstrap.js';
import { openDb } from './db/client.js';
import { migrate, pendingMigrations } from './db/migrate.js';
import { ENV_KEYS, loadEnv } from './env.js';
import { testEnv } from './test-helpers.js';

let dir: string | undefined;
// dotenv never overrides existing vars, so stub every key (empty counts as unset).
beforeEach(() => {
  for (const k of ENV_KEYS) vi.stubEnv(k, '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function dbUrl(): string {
  dir = mkdtempSync(path.join(tmpdir(), 'edw-boot-'));
  return `file:${path.join(dir, 'boot.db')}`;
}

describe('MIGRATE_ON_START', () => {
  it('is on unless set to false, 0, no or off', () => {
    vi.stubEnv('ADMIN_PASSWORD', 'pw');
    for (const [v, on] of [['', true], ['true', true], ['1', true], ['false', false], ['FALSE', false], ['0', false], ['no', false], ['off', false]] as const) {
      vi.stubEnv('MIGRATE_ON_START', v);
      expect(loadEnv().MIGRATE_ON_START, v).toBe(on);
    }
  });

  it('on, createDeps applies pending migrations', async () => {
    const deps = await createDeps(testEnv({ DATABASE_URL: dbUrl() }));
    expect(deps.migrationsApplied.length).toBeGreaterThan(0);
    expect(await pendingMigrations(deps.db)).toEqual([]);
    deps.db.close();
  });

  it('off, createDeps runs no migration', async () => {
    const url = dbUrl();
    const db = openDb({ url });
    await migrate(db);
    // Pretend the newest migration is still to run.
    const last = (await db.execute('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0]!.name as string;
    await db.execute('DELETE FROM schema_migrations WHERE name = ?', [last]);
    db.close();

    const deps = await createDeps(testEnv({ DATABASE_URL: url, MIGRATE_ON_START: false }));
    expect(deps.migrationsApplied).toEqual([]);
    expect(await pendingMigrations(deps.db)).toEqual([last]);
    deps.db.close();
  });
});
