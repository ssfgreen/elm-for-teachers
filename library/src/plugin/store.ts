/**
 * The plugins the runner serves, in memory: each id with its versions. For now these are the
 * bundled plugins (one version each); published versions from storage join later (section 10).
 */
import { COLLECTIONS_ROOT, loadBundledPlugins, PLUGINS_ROOT } from './bundled.js';
import type { Plugin } from './load.js';

export interface PluginStore {
  /** Every version of a plugin, highest first; empty when the id is unknown. */
  versions(id: string): string[];
  /** One version of a plugin, or the latest (highest semver) when `version` is left out. */
  get(id: string, version?: string): Plugin | undefined;
  /** Set when the plugins could not be loaded: the `/p/` addresses answer 503 with it, and the old routes carry on. */
  unavailable?: string;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

/** Compares two semver strings (no build metadata, as `manifest.ts` allows). Pre-releases come before their release. */
export function compareSemver(a: string, b: string): number {
  const ma = SEMVER.exec(a);
  const mb = SEMVER.exec(b);
  if (!ma || !mb) throw new Error(`not a version: ${ma ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i]);
    if (d !== 0) return Math.sign(d);
  }
  const pa = ma[4];
  const pb = mb[4];
  if (pa === undefined || pb === undefined) return pa === pb ? 0 : pa === undefined ? 1 : -1;
  const xs = pa.split('.');
  const ys = pb.split('.');
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Math.sign(Number(x) - Number(y));
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return Math.sign(xs.length - ys.length);
}

export function createPluginStore(plugins: Iterable<Plugin>): PluginStore {
  const byId = new Map<string, Map<string, Plugin>>();
  for (const p of plugins) {
    const { id, version } = p.manifest;
    const versions = byId.get(id) ?? new Map<string, Plugin>();
    if (versions.has(version)) throw new Error(`${id}@${version} is loaded twice`);
    versions.set(version, p);
    byId.set(id, versions);
  }
  const versions = (id: string) => [...(byId.get(id)?.keys() ?? [])].sort((a, b) => compareSemver(b, a));
  return {
    versions,
    get(id, version) {
      const v = version ?? versions(id)[0];
      return v === undefined ? undefined : byId.get(id)?.get(v);
    },
  };
}

/**
 * Runs `load`, and on failure logs it and returns an empty store that says why, so a broken
 * plugin cannot take down the old `/api` and `/mcp` routes.
 */
export function loadPluginStoreSafely(load: () => PluginStore = () => loadPluginStore()): PluginStore {
  try {
    return load();
  } catch (e) {
    const reason = `the plugins could not be loaded: ${(e as Error).message}`;
    console.error(reason);
    return { ...createPluginStore([]), unavailable: reason };
  }
}

/** Where bundled plugins are read from: `LIBRARY_PLUGINS`, or `library/plugins`. */
export const PLUGINS_DIR = process.env.LIBRARY_PLUGINS ?? PLUGINS_ROOT;

/** The bundled plugins as a store, their collections read as `bundled.ts` reads them. */
export function loadPluginStore(root = PLUGINS_DIR, collectionsRoot = COLLECTIONS_ROOT): PluginStore {
  return createPluginStore(loadBundledPlugins(root, collectionsRoot).values());
}
