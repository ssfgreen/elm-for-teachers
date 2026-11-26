/**
 * Apply pending migrations, for the migrate command (migrate.ts, built as `dist/migrate.js`). On
 * Kubernetes a Job runs it before each rollout and the server starts with MIGRATE_ON_START=false.
 * Returns the exit code: 0 when the schema is current, 1 on any failure.
 */
import { openDb, type Db } from './db/client.js';
import { migrate as applyMigrations } from './db/migrate.js';
import type { Env } from './env.js';
import { serialiseTransactions } from './serial-db.js';

interface Log {
  info(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export async function runMigrations(
  env: Pick<Env, 'DATABASE_URL' | 'DATABASE_AUTH_TOKEN'>,
  log: Log = { info: (m) => console.log(m), error: (m, e) => console.error(m, e) },
  migrate: (db: Db) => Promise<{ applied: string[] }> = applyMigrations,
): Promise<number> {
  let db: Db | undefined;
  try {
    db = serialiseTransactions(openDb({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN }));
    const { applied } = await migrate(db);
    log.info(applied.length ? `applied ${applied.length} migrations: ${applied.join(', ')}` : 'no pending migrations');
    return 0;
  } catch (err) {
    log.error('migration failed', err);
    return 1;
  } finally {
    db?.close();
  }
}

