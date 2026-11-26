/**
 * The database types the rest of the server uses. Only db/client.ts imports the libSQL
 * client; everything else imports from here, so a change of driver (PostgreSQL, say) is a
 * change to db/ alone. The shapes match what libSQL hands back, kept to the parts we use.
 */

/** A value as it comes back in a row. */
export type Value = null | string | number | bigint | ArrayBuffer;
/** A value that may be bound to a statement. */
export type InValue = Value | boolean | Uint8Array | Date;
export type InArgs = InValue[] | Record<string, InValue>;
export type InStatement = string | { sql: string; args: InArgs };

/** A row, read by column name or by position. */
export interface Row {
  length: number;
  [index: number]: Value;
  [name: string]: Value;
}

export interface ResultSet {
  columns: string[];
  rows: Row[];
  rowsAffected: number;
}

/** Anything that runs one statement: a transaction, or the plain connection. */
export interface Executor {
  execute(stmt: InStatement): Promise<ResultSet>;
}

/** An open write transaction. `Db.transaction()` commits or rolls it back. */
export interface Transaction extends Executor {
  batch(stmts: InStatement[]): Promise<ResultSet[]>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
