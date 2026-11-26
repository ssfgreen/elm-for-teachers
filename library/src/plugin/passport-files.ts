/**
 * A plugin's passport files on disk (docs/plugin-platform.md section 8). `passport/` stays pure so
 * the studio can copy it; reading and writing the files is done here.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePassport, renderPassport, type Passport } from '../passport/index.js';
import { treeHash } from './hash.js';

export const PASSPORT_JSON = 'passport.json';
export const PASSPORT_MD = 'PASSPORT.md';

/**
 * The content hash a passport's `covers` names: the plugin's tree hash without its two passport
 * files, since a passport cannot hold a hash of itself.
 */
export function coveredHash(files: ReadonlyMap<string, string>): string {
  const rest = new Map(files);
  rest.delete(PASSPORT_JSON);
  rest.delete(PASSPORT_MD);
  return treeHash(rest);
}

/** The plugin folder's parsed `passport.json`, or null when it has none. */
export function readPassport(pluginDir: string): Passport | null {
  const path = join(pluginDir, PASSPORT_JSON);
  if (!existsSync(path)) return null;
  return parsePassport(JSON.parse(readFileSync(path, 'utf8')));
}

/** Writes `PASSPORT.md` from `passport.json`. Returns false when the folder has no passport. */
export function writePassportMd(pluginDir: string): boolean {
  const passport = readPassport(pluginDir);
  if (!passport) return false;
  writeFileSync(join(pluginDir, PASSPORT_MD), renderPassport(passport));
  return true;
}
