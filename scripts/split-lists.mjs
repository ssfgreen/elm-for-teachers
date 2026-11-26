#!/usr/bin/env node
/**
 * Moves old list blocks (one block per list) to a block per item, with their history, waiting
 * suggestions and comments (PLAN.md section 6, L.4; packages/server/src/lists/).
 *
 *   pnpm --filter @edw/shared build && pnpm --filter @edw/server build
 *   node scripts/split-lists.mjs                       # dry run: reports what it would change
 *   node scripts/split-lists.mjs --session <id>        # one workspace only
 *   node scripts/split-lists.mjs --apply               # writes, to a local database
 *   node scripts/download-workspaces.mjs               # first, for Turso: every workspace to ../edw-data
 *   node scripts/split-lists.mjs --apply --backup ../edw-data/backups/<when> --turso-confirmed
 *
 * It uses DATABASE_URL from .env, as the server does. A dry run on a database without migration
 * 0019 reports from a copy of the table in the rolled-back transaction, so it writes nothing.
 * On the hosted database --apply needs --turso-confirmed and --backup: a whole download
 * (download-workspaces.mjs) with a folder for every workspace now in the database. Each
 * workspace is one transaction; running it again skips lists already split.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'packages/server/dist');
if (!existsSync(join(server, 'lists/migrate.js'))) {
  console.error('Build first: pnpm --filter @edw/shared build && pnpm --filter @edw/server build');
  process.exit(2);
}
const { loadEnv } = await import(join(server, 'env.js'));
const { openDb } = await import(join(server, 'db/client.js'));
const { migrate } = await import(join(server, 'db/migrate.js'));
const { splitLists } = await import(join(server, 'lists/migrate.js'));

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const at = args.indexOf('--session');
const sessionId = at >= 0 ? args[at + 1] : undefined;

const env = loadEnv();
const remote = !env.DATABASE_URL.startsWith('file:');
const backupAt = args.indexOf('--backup');
const backup = backupAt >= 0 ? args[backupAt + 1] : undefined;
if (apply && remote && (!args.includes('--turso-confirmed') || !backup)) {
  console.error('This would write to the hosted database. Download every workspace first (scripts/download-workspaces.mjs), then run again with --backup <that folder> --turso-confirmed.');
  process.exit(1);
}
const db = openDb({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
try {
  if (apply && remote) {
    // The download must hold every workspace in the database now.
    const index = JSON.parse(readFileSync(join(backup, 'index.json'), 'utf8'));
    const have = new Set(index.sessions.filter((s) => existsSync(join(backup, s.folder, 'MANIFEST.json'))).map((s) => s.session_id));
    const ids = (await db.execute('SELECT session_id FROM sessions')).rows.map((r) => String(r.session_id));
    const missing = ids.filter((id) => !have.has(id));
    if (index.database !== 'hosted' || missing.length) {
      console.error(`The download in ${backup} is not a whole one of the hosted database${missing.length ? ` (missing ${missing.join(', ')})` : ''}. Download again.`);
      process.exit(1);
    }
  }
  const table = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'block_splits'");
  const noTable = !table.rows.length;
  if (noTable && apply) {
    await migrate(db);
    if (!(await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'block_splits'")).rows.length) {
      console.error('Migration 0019 is marked as applied but block_splits is missing: look at schema_migrations before going on.');
      process.exit(1);
    }
  }
  console.log(`${apply ? 'Applying' : 'Dry run'} on the ${remote ? 'hosted' : 'local'} database${sessionId ? `, workspace ${sessionId}` : ''}.`);
  const report = await splitLists(db, { dryRun: !apply, sessionId, createTable: noTable && !apply });
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
