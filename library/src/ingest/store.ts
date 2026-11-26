import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import type { Store } from './run.js';

/** A collection folder on disk. Paths may not climb out of it. */
export function folderStore(root: string): Store {
  const resolve = (path: string) => {
    const full = normalize(join(root, path));
    if (!full.startsWith(normalize(root) + sep)) throw new Error(`path outside the collection: ${path}`);
    return full;
  };
  return {
    read: (path) => (existsSync(resolve(path)) ? readFileSync(resolve(path), 'utf8') : null),
    write: (path, content) => {
      const full = resolve(path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    },
    remove: (path) => rmSync(resolve(path), { force: true }),
    exists: (path) => existsSync(resolve(path)),
  };
}

/** A store in memory, for tests. */
export function memoryStore(files = new Map<string, string>()): Store & { files: Map<string, string> } {
  return {
    files,
    read: (path) => files.get(path) ?? null,
    write: (path, content) => void files.set(path, content),
    remove: (path) => void files.delete(path),
    exists: (path) => files.has(path),
  };
}
