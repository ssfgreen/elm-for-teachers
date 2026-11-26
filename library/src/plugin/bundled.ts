/**
 * The first-party plugins that ship inside `library/` (`library/plugins/<name>/`). Until their
 * collection folders move (a later item), a bundled plugin's collections are read from
 * `library/collections/<id>` and placed at the path its manifest names, so the plugin's tree is
 * as if they were inside it. A collection already inside the plugin folder is read from there.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTree } from '../core/fs.js';
import { buildPlugin, subtree, type Plugin } from './load.js';
import { parseManifest } from './manifest.js';

export const PLUGINS_ROOT = fileURLToPath(new URL('../../plugins', import.meta.url));
/** Where collections not yet inside their plugin are read from: `LIBRARY_COLLECTIONS`, as for the server, or `library/collections`. */
export const COLLECTIONS_ROOT = process.env.LIBRARY_COLLECTIONS ?? fileURLToPath(new URL('../../collections', import.meta.url));

/** A bundled plugin's whole file tree, with its collections placed at their paths. */
export function bundledPluginFiles(pluginDir: string, collectionsRoot = COLLECTIONS_ROOT): Map<string, string> {
  const files = readTree(pluginDir);
  const text = files.get('plugin.json');
  if (text === undefined) throw new Error(`${pluginDir}: plugin.json is missing`);
  const manifest = parseManifest(JSON.parse(text));
  for (const c of manifest.collections) {
    if (subtree(files, c.path).size > 0) continue;
    const dir = join(collectionsRoot, c.id);
    if (!existsSync(dir)) throw new Error(`${manifest.id}: no files for collection ${c.id} at ${c.path} or in ${collectionsRoot}`);
    for (const [path, content] of readTree(dir)) files.set(`${c.path}/${path}`, content);
  }
  return files;
}

export function loadBundledPlugin(pluginDir: string, collectionsRoot = COLLECTIONS_ROOT): Plugin {
  return buildPlugin(bundledPluginFiles(pluginDir, collectionsRoot));
}

/** Every bundled plugin (each folder under the root with a plugin.json), keyed by its id. */
export function loadBundledPlugins(root = PLUGINS_ROOT, collectionsRoot = COLLECTIONS_ROOT): Map<string, Plugin> {
  const out = new Map<string, Plugin>();
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory() || !existsSync(join(dir, 'plugin.json'))) continue;
    const plugin = loadBundledPlugin(dir, collectionsRoot);
    if (out.has(plugin.manifest.id)) throw new Error(`two bundled plugins are called ${plugin.manifest.id}`);
    out.set(plugin.manifest.id, plugin);
  }
  return out;
}
