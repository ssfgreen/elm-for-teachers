import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollection } from '../core/fs.js';
import { COLLECTIONS_ROOT, PLUGINS_ROOT, bundledPluginFiles, loadBundledPlugins } from './bundled.js';
import { buildPlugin } from './load.js';
import { parseManifest } from './manifest.js';

const pedagogyDir = join(PLUGINS_ROOT, 'pedagogy');

describe('the bundled pedagogy plugin', () => {
  it('reads the pedagogy plugin, with its three settings', () => {
    const m = parseManifest(JSON.parse(readFileSync(join(pedagogyDir, 'plugin.json'), 'utf8')));
    expect(m).toMatchObject({ id: 'elm/pedagogy', version: '0.1.0', reuse: 'use_only', use_in: ['class', 'year_group'], skills: [] });
    expect(m.tools.map((t) => t.tool)).toEqual(['entries', 'entry', 'claims', 'facets']);
    expect(Object.keys(m.settings)).toEqual(['hide', 'favour', 'min_rating']);
  });

  const plugins = loadBundledPlugins();
  const pedagogy = plugins.get('elm/pedagogy')!;

  it('loads, holding pedagogy-scotland', () => {
    expect([...plugins.keys()]).toEqual(['elm/cfe', 'elm/pedagogy']);
    expect(pedagogy.manifest.browse).toEqual({ view: 'pedagogy', collection: 'pedagogy-scotland' });
    expect(pedagogy.collections.get('pedagogy-scotland')!.pedagogy!.entries.size).toBe(116);
    expect(pedagogy.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('keeps the collection version the app records today', () => {
    const today = loadCollection(join(COLLECTIONS_ROOT, 'pedagogy-scotland')).version;
    expect(pedagogy.collections.get('pedagogy-scotland')!.version).toBe(today);
  });

  it('places the collection at its manifest path, beside the plugin files', () => {
    const files = bundledPluginFiles(pedagogyDir);
    expect([...files.keys()].sort()).toEqual([
      'PASSPORT.md',
      'README.md',
      'collections/pedagogy-scotland/collection.json',
      'collections/pedagogy-scotland/pedagogy.yaml',
      'passport.json',
      'plugin.json',
    ]);
  });

  it('changes its hash, and not the collection version, when plugin.json changes', () => {
    const files = bundledPluginFiles(pedagogyDir);
    const manifest = JSON.parse(readFileSync(join(pedagogyDir, 'plugin.json'), 'utf8')) as Record<string, unknown>;
    const changed = buildPlugin(new Map(files).set('plugin.json', JSON.stringify({ ...manifest, version: '0.1.1' })));
    expect(changed.hash).not.toBe(pedagogy.hash);
    expect(changed.collections.get('pedagogy-scotland')!.version).toBe(pedagogy.collections.get('pedagogy-scotland')!.version);
  });
});
