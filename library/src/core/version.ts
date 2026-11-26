import { createHash } from 'node:crypto';

/** A collection's version: the first 12 hex characters of sha256 over its files, sorted by path. */
export function collectionVersion(files: ReadonlyMap<string, string>): string {
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    hash.update(path);
    hash.update('\0');
    hash.update(files.get(path) ?? '');
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
