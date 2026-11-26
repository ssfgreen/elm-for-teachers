import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/** Split a migration file into single statements (no triggers/strings containing ';' are used). */
function splitStatements(sql: string): string[] {
  const noComments = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  return noComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
}

/** Migrations not yet applied, read only: a database with no `schema_migrations` table has them all pending. */
export async function pendingMigrations(db: Db): Promise<string[]> {
  const table = await db.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'");
  const done = new Set(
    table.rows.length ? (await db.execute('SELECT name FROM schema_migrations')).rows.map((r) => String(r.name)) : [],
  );
  return (await migrationFiles()).filter((f) => !done.has(f));
}

export async function migrate(db: Db): Promise<{ applied: string[] }> {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)',
  );
  const done = new Set(
    (await db.execute('SELECT name FROM schema_migrations')).rows.map((r) => String(r.name)),
  );
  const files = await migrationFiles();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(MIGRATIONS_DIR + file, 'utf8');
    await db.transaction(async (tx) => {
      // Another server copy may have applied it since `done` was read (several start at once).
      const already = await tx.execute({ sql: 'SELECT 1 FROM schema_migrations WHERE name = ?', args: [file] });
      if (already.rows.length) return;
      for (const stmt of splitStatements(sql)) await tx.execute(stmt);
      await tx.execute({
        sql: 'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
        args: [file, new Date().toISOString()],
      });
    });
    applied.push(file);
  }
  return { applied };
}
