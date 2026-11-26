import { createClient } from '@libsql/client';
import type { Executor, InArgs, InStatement, ResultSet, Transaction } from './types.js';

export interface Db {
  /** The plain connection, for a read outside any queue or retry. */
  client: Executor;
  execute(sql: string, args?: InArgs): Promise<ResultSet>;
  batch(stmts: InStatement[]): Promise<ResultSet[]>;
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): void;
}

/**
 * Several server copies may write at once (serverless hosting starts as many as it needs).
 * A write transaction that finds the database locked, or loses the race for an event's
 * sequence number (or a dedupe on event_id), is rolled back and run again after a short
 * random pause: it then reads the other copy's committed writes and numbers after them.
 * Within one copy, serial-db.ts queues transactions so this rarely happens.
 */
const RETRIES = 10;
export function isLocked(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return /SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(`${String(e?.code ?? '')} ${String(e?.message ?? '')}`);
}
export function isWriteConflict(err: unknown): boolean {
  const e = err as { code?: unknown; rawCode?: unknown; message?: unknown } | null;
  const text = `${String(e?.code ?? '')} ${String(e?.message ?? '')}`;
  return /SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(text) || /UNIQUE constraint failed: events\./i.test(text);
}
/** Runs a single statement (or batch) again while the database is locked by another copy. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= RETRIES || !isLocked(err)) throw err;
      await backoff(attempt);
    }
  }
}
const backoff = (attempt: number) => new Promise((r) => setTimeout(r, Math.min(400, 10 * 2 ** attempt) + Math.random() * 40));

export interface OpenDbOptions {
  url: string;
  authToken?: string;
}

/**
 * Open a libsql database (local file or hosted Turso).
 * Note: `:memory:` databases do not survive `transaction()` in @libsql/client (the
 * connection is replaced), so use a temp file for tests.
 */
export function openDb(opts: OpenDbOptions): Db {
  const client = createClient({ url: opts.url, authToken: opts.authToken });
  const isLocal = opts.url.startsWith('file:') || opts.url.includes(':memory:');
  // Enabled lazily on first use, and re-applied if the connection is replaced.
  let pragma: Promise<unknown> | null = null;
  const ready = (): Promise<unknown> => {
    if (!isLocal) return Promise.resolve();
    // WAL: readers never block a writer's commit (matters when several copies share a file).
    pragma ??= client.execute('PRAGMA foreign_keys = ON').then(() => client.execute('PRAGMA journal_mode = WAL'));
    return pragma;
  };

  return {
    client,
    async execute(sql, args) {
      await ready();
      // A single statement is atomic, so it is safe to run again after a lock.
      return withRetry(() => (args === undefined ? client.execute(sql) : client.execute({ sql, args })));
    },
    async batch(stmts) {
      await ready();
      return withRetry(() => client.batch(stmts, 'write'));
    },
    async transaction(fn) {
      await ready();
      for (let attempt = 1; ; attempt++) {
        const tx = await client.transaction('write').catch((err: unknown) => {
          if (attempt < RETRIES && isWriteConflict(err)) return null;
          throw err;
        });
        if (!tx) {
          await backoff(attempt);
          continue;
        }
        try {
          const out = await fn(tx);
          await tx.commit();
          return out;
        } catch (err) {
          try {
            await tx.rollback();
          } catch {
            /* already closed */
          }
          if (attempt < RETRIES && isWriteConflict(err)) {
            await backoff(attempt);
            continue;
          }
          throw err;
        } finally {
          tx.close();
        }
      }
    },
    close() {
      client.close();
    },
  };
}
