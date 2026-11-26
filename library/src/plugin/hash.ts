import { createHash } from 'node:crypto';

/**
 * A plugin's content hash: the full sha256 over every file, sorted by path, as path, NUL,
 * content, NUL, written `sha256:<64 hex>`. It is the same walk as a collection's version but over
 * the whole tree and not cut short, so the two never look alike.
 *
 * It covers the files it is given. From disk (`readTree`) that is every file except dot-files and
 * those inside dot-folders, each read as UTF-8, so a plugin holds text files only.
 */
export function treeHash(files: ReadonlyMap<string, string>): string {
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    hash.update(path);
    hash.update('\0');
    hash.update(files.get(path) ?? '');
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}
