/**
 * Serialise write transactions within this process.
 *
 * libsql's local driver is synchronous and opens a fresh connection per write
 * transaction (`BEGIN IMMEDIATE`). A second transaction started while the first is
 * awaiting I/O fails at once with SQLITE_BUSY: a busy timeout cannot help, because the
 * lock holder is waiting on the same event loop. So `transaction()` and `batch()` are
 * queued behind one another. Plain `execute()` is not queued (reads must stay usable
 * inside a transaction body), so writes should go through `transaction()`.
 *
 * Never call `db.transaction()` from inside a transaction body: it would wait on itself.
 */
import type { Db } from './db/client.js';

export function serialiseTransactions(db: Db): Db {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
    const next = tail.then(run, run);
    tail = next.catch(() => undefined);
    return next;
  };
  return {
    client: db.client,
    execute: (sql, args) => db.execute(sql, args),
    batch: (stmts) => enqueue(() => db.batch(stmts)),
    transaction: (fn) => enqueue(() => db.transaction(fn)),
    close: () => db.close(),
  };
}
