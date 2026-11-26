/**
 * `pnpm --filter @edw/library passport`: writes `PASSPORT.md` for each bundled plugin that has a
 * `passport.json`, and says whether the passport covers the plugin as it is now.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { covers } from '../passport/index.js';
import { bundledPluginFiles, PLUGINS_ROOT } from './bundled.js';
import { parseManifest } from './manifest.js';
import { coveredHash, readPassport, writePassportMd } from './passport-files.js';

for (const name of readdirSync(PLUGINS_ROOT).sort()) {
  const dir = join(PLUGINS_ROOT, name);
  if (!existsSync(join(dir, 'plugin.json')) || !writePassportMd(dir)) continue;
  const files = bundledPluginFiles(dir);
  const { version } = parseManifest(JSON.parse(files.get('plugin.json') ?? '{}'));
  const hash = coveredHash(files);
  const passport = readPassport(dir);
  const ok = passport !== null && covers(passport, version, hash);
  console.log(`${name}: wrote PASSPORT.md. ${version} ${hash} is ${ok ? 'covered' : 'not covered by passport.json'}.`);
}
