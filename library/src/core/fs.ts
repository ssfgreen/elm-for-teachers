import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildCollection } from './collection.js';
import type { Collection } from './types.js';

/** Every file under a folder, keyed by its path relative to it with forward slashes. */
export function readTree(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith('.')) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(dir, full).split(sep).join('/'), readFileSync(full, 'utf8'));
    }
  };
  walk(dir);
  return files;
}

/** Loads one collection folder. */
export function loadCollection(dir: string): Collection {
  return buildCollection(readTree(dir));
}

/** Loads every collection folder under a root (each folder with a collection.json), keyed by id. */
export function loadCollections(root: string): Map<string, Collection> {
  const out = new Map<string, Collection>();
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;
    try {
      statSync(join(dir, 'collection.json'));
    } catch {
      continue;
    }
    const c = loadCollection(dir);
    out.set(c.meta.id, c);
  }
  return out;
}
