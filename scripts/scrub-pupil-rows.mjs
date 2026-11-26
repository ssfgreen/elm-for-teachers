#!/usr/bin/env node
/**
 * OFF until Sam decides what removal should do (13 Nov 2026): the server does not serve the
 * route, and this script stops at once. The code is kept for when it is switched on.
 *
 * Removes the pupil table from stored model calls (issue #16, docs/classes.md), through the
 * admin route of a running server. A dry run unless --apply: it prints how many calls, tables
 * and rows would change, and changes nothing.
 *
 *   node scripts/scrub-pupil-rows.mjs --session <id>            # one workspace, dry run
 *   node scripts/scrub-pupil-rows.mjs --all                     # every workspace, dry run
 *   node scripts/scrub-pupil-rows.mjs --session <id> --apply    # really remove them
 *   node scripts/scrub-pupil-rows.mjs --all --base https://...  # another server (default http://localhost:3000)
 *
 * A real run is refused unless the workspace was exported since its last model call, and if any
 * pupil row line would be left in a class message (`leftover`; the refusal names the workspaces).
 * `unsure`: calls whose table end was in doubt, so everything through to the class message's
 * closing line goes, or with a class message that has no closing line, left alone. Reads
 * ADMIN_PASSWORD from the environment or .env, and never prints it. Prints counts only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Off until Sam decides: stop before anything is sent.
console.error('The pupil row scrub is switched off until Sam decides what removal should do (issue #16).');
process.exit(2);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const session = opt('--session');
const all = args.includes('--all');
const apply = args.includes('--apply');
const base = (opt('--base') ?? process.env.SCRUB_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

if (!!session === all) {
  console.error('Give --session <id> or --all (and --apply to change anything).');
  process.exit(2);
}

function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const file = join(root, '.env');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8').split('\n').find((l) => /^\s*ADMIN_PASSWORD\s*=/.test(l));
  return line?.replace(/^\s*ADMIN_PASSWORD\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
}
const password = adminPassword();
if (!password) {
  console.error('Set ADMIN_PASSWORD (in the environment or .env).');
  process.exit(2);
}

const url = session ? `${base}/api/admin/sessions/${encodeURIComponent(session)}/scrub-pupil-rows` : `${base}/api/admin/scrub-pupil-rows`;
const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${password}`, 'content-type': 'application/json' }, body: JSON.stringify({ apply }) });
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Refused (HTTP ${res.status}${body.code ? `, ${body.code}` : ''}): ${body.error ?? res.statusText}`);
  process.exit(1);
}

console.log(body.dry_run ? 'Dry run: nothing was changed. Add --apply to remove them.' : 'Removed, and logged as pupil_rows_scrub in each workspace.');
let calls = 0;
let rows = 0;
for (const w of body.workspaces) {
  const doubt = [w.unsure ? `${w.unsure} unsure (see the script's header)` : '', w.leftover ? `${w.leftover} row lines LEFT: a real run is refused` : ''].filter(Boolean).join(', ');
  console.log(`${w.session_id}  ${w.calls} call${w.calls === 1 ? '' : 's'}, ${w.tables} table${w.tables === 1 ? '' : 's'}, ${w.rows} row${w.rows === 1 ? '' : 's'}${doubt ? `; ${doubt}` : ''}`);
  calls += w.calls;
  rows += w.rows;
}
console.log(`${body.workspaces.length} workspace${body.workspaces.length === 1 ? '' : 's'}: ${calls} calls, ${rows} rows ${body.dry_run ? 'would change' : 'changed'}.`);
