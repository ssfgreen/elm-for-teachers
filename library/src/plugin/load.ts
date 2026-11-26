/**
 * Builds a plugin from its files, keyed by path inside the plugin folder (`plugin.json`,
 * `README.md`, `collections/<id>/collection.json`, ...). Pure, so tests need no disk.
 */
import { buildCollection } from '../core/collection.js';
import { readTree } from '../core/fs.js';
import type { Collection } from '../core/types.js';
import { treeHash } from './hash.js';
import { parseManifest, type Manifest } from './manifest.js';

export interface Plugin {
  manifest: Manifest;
  /** Each collection by its id, with its own version computed over its own folder. */
  collections: Map<string, Collection>;
  /** `treeHash` of every file in the plugin. */
  hash: string;
  /** The settings the plugin declares (the manifest's own); a teacher's values are never kept here. */
  settings: Manifest['settings'];
}

/** The files under `prefix/`, keyed by their path inside it. */
export function subtree(files: ReadonlyMap<string, string>, prefix: string): Map<string, string> {
  const start = `${prefix.replace(/\/+$/, '')}/`;
  const out = new Map<string, string>();
  for (const [path, text] of files) if (path.startsWith(start)) out.set(path.slice(start.length), text);
  return out;
}

export function buildPlugin(files: ReadonlyMap<string, string>): Plugin {
  const text = files.get('plugin.json');
  if (text === undefined) throw new Error('plugin.json is missing');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`plugin.json is not JSON: ${(e as Error).message}`);
  }
  const manifest = parseManifest(raw);

  const collections = new Map<string, Collection>();
  for (const c of manifest.collections) {
    const own = subtree(files, c.path);
    if (own.size === 0) throw new Error(`${manifest.id}: collection ${c.id} has no files at ${c.path}`);
    const collection = buildCollection(own);
    if (collection.meta.id !== c.id) throw new Error(`${manifest.id}: ${c.path}/collection.json says id ${collection.meta.id}, and plugin.json says ${c.id}`);
    const kind = collection.meta.kind ?? 'documents';
    if (kind !== c.kind) throw new Error(`${manifest.id}: ${c.id} is ${kind} in collection.json, and ${c.kind} in plugin.json`);
    collections.set(c.id, collection);
  }
  return { manifest, collections, hash: treeHash(files), settings: manifest.settings };
}

/** Loads one plugin folder from disk, holding all its collections. */
export function loadPlugin(dir: string): Plugin {
  return buildPlugin(readTree(dir));
}
