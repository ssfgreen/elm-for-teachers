/** One statement on a database handle or an open transaction, for stores that take either. */
import type { InStatement, Transaction } from './types.js';
import type { Db } from './client.js';

/** A database handle or an open transaction. */
export type DbOrTx = Db | Transaction;

/** Runs one statement on a database handle or a transaction, which take their arguments differently. */
export function run(x: DbOrTx, stmt: { sql: string; args: (string | number | null)[] }) {
  return 'commit' in x ? x.execute(stmt as InStatement) : x.execute(stmt.sql, stmt.args);
}
