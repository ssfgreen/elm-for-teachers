#!/usr/bin/env node
/**
 * Downloads every workspace's full export (the /admin bundle, unzipped) from the database in
 * .env, read only: no migrations are run and nothing is written to the database.
 *
 *   pnpm --filter @edw/shared build && pnpm --filter @edw/server build
 *   node scripts/download-workspaces.mjs                  # to ../edw-data/backups/<date and time>/
 *   node scripts/download-workspaces.mjs --out <dir>      # somewhere else (an empty or new folder)
 *   node scripts/download-workspaces.mjs --session <id>   # one workspace only
 *
 * Each workspace goes in `<name>-<session id>/`, as the export zip would unpack. `index.json`
 * lists them, with the database's session count, so split-lists.mjs can check the download is
 * whole before it writes. Reference file originals stay in the bucket, as in the export.
 * Participant data: the default folder is in ../edw-data, never this repo.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'packages/server/dist');
if (!existsSync(join(server, 'export/bundle.js'))) {
  console.error('Build first: pnpm --filter @edw/shared build && pnpm --filter @edw/server build');
  process.exit(2);
}
const load = (p) => import(join(server, p));
const { loadEnv } = await load('env.js');
const { openDb } = await load('db/client.js');
const { createEventStore } = await load('events/store.js');
const { createCanvasService } = await load('blocks/index.js');
const { createThreadService } = await load('threads/service.js');
const { createSessionService } = await load('sessions/service.js');
const { buildBundle, slug } = await load('export/bundle.js');
const { loadAppConfig } = await import(join(root, 'packages/shared/dist/node/index.js'));

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const out = resolve(opt('--out') ?? join(root, '..', 'edw-data', 'backups', stamp));
const only = opt('--session');

if (out.startsWith(root + '/') || out === root) {
  console.error('Participant data never goes in the app repo: pick a folder outside it.');
  process.exit(1);
}
if (existsSync(out) && readdirSync(out).length) {
  console.error(`${out} is not empty: pick a new folder.`);
  process.exit(1);
}

const env = loadEnv();
const remote = !env.DATABASE_URL.startsWith('file:');
const db = openDb({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
try {
  const events = createEventStore(db);
  const canvas = createCanvasService(db, events);
  const threads = createThreadService(db, canvas, events);
  const sessions = createSessionService(db, loadAppConfig(env.CONFIG_DIR), events, threads);
  const deps = { db, env, events, canvas, threads, sessions };

  const rows = (await db.execute('SELECT session_id, label FROM sessions ORDER BY created_at, session_id')).rows;
  const wanted = only ? rows.filter((r) => String(r.session_id) === only) : rows;
  if (only && !wanted.length) {
    console.error(`No workspace ${only}.`);
    process.exit(1);
  }
  console.log(`Downloading ${wanted.length} workspace(s) from the ${remote ? 'hosted' : 'local'} database to ${out}`);
  mkdirSync(out, { recursive: true });

  const index = { downloaded_at: new Date().toISOString(), database: remote ? 'hosted' : 'local', sessions_in_database: rows.length, whole: !only, sessions: [] };
  for (const r of wanted) {
    const id = String(r.session_id);
    const folder = `${slug(String(r.label))}-${id}`;
    const { files } = await buildBundle(deps, id);
    for (const [name, content] of Object.entries(files)) {
      const path = join(out, folder, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    const blocks = JSON.parse(files['blocks.json']).length;
    const eventCount = files['events.jsonl'].split('\n').filter(Boolean).length;
    index.sessions.push({ session_id: id, label: String(r.label), folder, files: Object.keys(files).length, blocks, events: eventCount });
    console.log(`  ${folder}: ${blocks} blocks, ${eventCount} events`);
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`Done: ${join(out, 'index.json')}`);
} finally {
  db.close();
}
