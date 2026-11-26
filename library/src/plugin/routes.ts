/**
 * One plugin's addresses (docs/plugin-platform.md section 10):
 *
 * - `GET  /p/<owner>/<name>[@<ver>]`: the manifest and the versions
 * - `POST /p/<owner>/<name>[@<ver>]/api/collections/<c>/<tool>`: the JSON API, on the plugin's
 *   own collections and only the tools its manifest switches on
 * - `/p/<owner>/<name>[@<ver>]/mcp`: MCP with that plugin's tools only
 *
 * Without `@<ver>` the address means the latest version. Every answer keeps `version` as the
 * collection's version (the app records it as `source_version`) and adds a `plugin` block.
 * A `Plugin-Settings` header is not read yet (R3).
 */
import type { Collection } from '../core/types.js';
import { runOperation, type ApiResponse, type Operation } from '../server/api.js';
import type { McpScope } from '../server/mcp.js';
import type { Plugin } from './load.js';
import { TOOL_KINDS, type Tool } from './manifest.js';
import type { PluginStore } from './store.js';

export type PluginRoute = ({ kind: 'json' } & ApiResponse) | { kind: 'mcp'; collections: ReadonlyMap<string, Collection>; scope: McpScope };

/** Which plugin and version an answer came from. */
export function pluginBlock(p: Plugin) {
  return { id: p.manifest.id, version: p.manifest.version, hash: p.hash };
}

const isTool = (s: string): s is Tool => Object.hasOwn(TOOL_KINDS, s);

/** True when the manifest switches `tool` on: for `collection`, or for any collection when it is left out. */
export function toolIsOn(p: Plugin, tool: Tool, collection?: string): boolean {
  return p.manifest.tools.some((t) => {
    if (t.tool !== tool) return false;
    if (collection === undefined || t.collection === collection) return true;
    return t.collection === undefined && p.manifest.collections.some((c) => c.id === collection && c.kind === TOOL_KINDS[tool]);
  });
}

/** The MCP scope for one plugin: its tools only, each answer stamped with the plugin block. */
export function mcpScope(p: Plugin): McpScope {
  return { allows: (op: Operation, collection?: string) => toolIsOn(p, op, collection), stamp: { plugin: pluginBlock(p) } };
}

function decodeSegments(path: string): string[] | null {
  try {
    return path.split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
}

const json = (status: number, body: unknown): PluginRoute => ({ kind: 'json', status, body });

/**
 * Routes a request under `/p/`. `path` is the URL's pathname, so an `@` may come as `%40`.
 * Returns null for paths outside `/p/`.
 */
export function routePlugin(store: PluginStore, method: string, path: string, body: unknown): PluginRoute | null {
  if (!path.startsWith('/p/')) return null;
  if (store.unavailable) return json(503, { error: store.unavailable });
  const parts = decodeSegments(path);
  if (!parts) return json(400, { error: 'the address is not valid' });
  const [, , owner, nameAt, ...rest] = parts;
  if (!owner || !nameAt) return json(404, { error: 'a plugin address is /p/<owner>/<name>' });
  const at = nameAt.indexOf('@');
  const id = `${owner}/${at < 0 ? nameAt : nameAt.slice(0, at)}`;
  const version = at < 0 ? undefined : nameAt.slice(at + 1);

  const versions = store.versions(id);
  if (versions.length === 0) return json(404, { error: `no plugin called ${id}` });
  const plugin = store.get(id, version);
  if (!plugin) return json(404, { error: `${id} has no version ${version}; it has ${versions.join(', ')}` });
  const stamp = { plugin: pluginBlock(plugin) };
  const tail = rest.filter((s, i) => s !== '' || i < rest.length - 1);

  if (tail.length === 0) {
    if (method !== 'GET') return json(405, { error: 'use GET', ...stamp });
    return json(200, { ...stamp, versions, manifest: plugin.manifest });
  }
  if (tail.length === 1 && tail[0] === 'mcp') return { kind: 'mcp', collections: plugin.collections, scope: mcpScope(plugin) };
  if (tail.length === 4 && tail[0] === 'api' && tail[1] === 'collections') {
    const [, , c, tool] = tail as [string, string, string, string];
    const collection = plugin.collections.get(c);
    if (!collection) return json(404, { error: `${id}@${plugin.manifest.version} has no collection called ${c}`, ...stamp });
    if (!isTool(tool)) return json(404, { error: `no operation called ${tool}`, version: collection.version, ...stamp });
    if (!toolIsOn(plugin, tool, c)) return json(404, { error: `${tool} is not switched on for ${c}`, version: collection.version, ...stamp });
    if (method !== 'POST') return json(405, { error: 'use POST', version: collection.version, ...stamp });
    const out = runOperation(collection, tool, body);
    return json(out.status, { ...(out.body as object), ...stamp });
  }
  return json(404, { error: `no route for ${path}`, ...stamp });
}
