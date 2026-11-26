#!/usr/bin/env node
/**
 * Finds the system prompt or app config behind a hash in git history, for sessions created
 * before the server kept them (an export's MANIFEST.json lists such hashes as config_missing).
 *
 *   pnpm --filter @edw/shared build && node scripts/find-config-version.mjs <hash> [--out <file>]
 *
 * It hashes every committed version of config/system_prompt.md and config/app.config.json
 * (and the working copies) the way the server does, prints the commits that match, and
 * writes the text to --out or prints it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shared = join(root, 'packages/shared/dist');
if (!existsSync(join(shared, 'node/index.js'))) {
  console.error('Build the shared package first: pnpm --filter @edw/shared build');
  process.exit(2);
}
const { sha256Hex, hashJson } = await import(join(shared, 'node/index.js'));
const { AppConfig } = await import(join(shared, 'config.js'));

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args[outAt + 1] : null;
const want = args.find((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1))?.toLowerCase();
if (!want || !/^[0-9a-f]{6,64}$/.test(want)) {
  console.error('Usage: node scripts/find-config-version.mjs <hash, or its first 6+ characters> [--out <file>]');
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Every hash a text could have been recorded under: the prompt's text hash, or the config's (parsed, with defaults, as now; or raw, as older code may have hashed). */
function hashesOf(path, text) {
  if (path.endsWith('.md')) return [{ hash: sha256Hex(text), text }];
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const found = [{ hash: hashJson(raw), text }];
  const parsed = AppConfig.safeParse(raw);
  if (parsed.success) found.push({ hash: hashJson(parsed.data), text: `${JSON.stringify(parsed.data, null, 2)}\n` });
  return found;
}

const files = ['config/system_prompt.md', 'config/app.config.json'];
const matches = [];
for (const path of files) {
  const versions = git('log', '--format=%H %cI', '--', path).trim().split('\n').filter(Boolean);
  const candidates = versions.map((line) => {
    const [commit, date] = line.split(' ');
    let text = null;
    try {
      text = git('show', `${commit}:${path}`);
    } catch {
      /* the file was deleted in this commit */
    }
    return { where: `${commit.slice(0, 10)} (${date})`, text };
  });
  if (existsSync(join(root, path))) candidates.unshift({ where: 'working copy', text: readFileSync(join(root, path), 'utf8') });
  for (const { where, text } of candidates) {
    if (text === null) continue;
    for (const h of hashesOf(path, text)) if (h.hash.startsWith(want)) matches.push({ path, where, ...h });
  }
}

if (matches.length === 0) {
  console.error(`No committed version of ${files.join(' or ')} has a hash starting ${want}.`);
  process.exit(1);
}
for (const m of matches) console.error(`${m.path} at ${m.where}: ${m.hash}`);
const { text } = matches[matches.length - 1];
if (out) {
  writeFileSync(out, text);
  console.error(`Wrote ${out}`);
} else {
  process.stdout.write(text);
}
