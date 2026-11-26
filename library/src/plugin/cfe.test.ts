import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCollection } from '../core/fs.js';
import { COLLECTIONS_ROOT, PLUGINS_ROOT, bundledPluginFiles, loadBundledPlugins } from './bundled.js';
import { treeHash } from './hash.js';
import { buildPlugin } from './load.js';
import { routePlugin } from './routes.js';
import { createPluginStore } from './store.js';

const cfeDir = join(PLUGINS_ROOT, 'cfe');
const cfe = loadBundledPlugins().get('elm/cfe')!;
const store = createPluginStore([cfe]);
const post = (path: string, body: unknown = {}) => routePlugin(store, 'POST', path, body) as { status: number; body: Record<string, unknown> };

describe('the bundled Curriculum for Excellence plugin', () => {
  it('holds the structured curriculum and the E&O documents, with no settings', () => {
    expect(cfe.manifest).toMatchObject({ id: 'elm/cfe', version: '0.1.0', reuse: 'adapt_with_credit', settings: {}, skills: [] });
    expect(cfe.manifest.tools.map((t) => `${t.tool} ${t.collection}`)).toEqual([
      'structure cfe-curriculum',
      'outcomes cfe-curriculum',
      'benchmarks cfe-curriculum',
      'search education-scotland-eo',
      'read education-scotland-eo',
    ]);
    expect([...cfe.collections.keys()].sort()).toEqual(['cfe-curriculum', 'education-scotland-eo']);
  });

  it('keeps the collection versions the app records today', () => {
    for (const id of ['cfe-curriculum', 'education-scotland-eo']) {
      expect(cfe.collections.get(id)!.version).toBe(loadCollection(join(COLLECTIONS_ROOT, id)).version);
    }
  });

  it('carries the OGL v3 attribution in its README', () => {
    const readme = readFileSync(join(cfeDir, 'README.md'), 'utf8');
    expect(readme).toContain('Contains public sector information licensed under the Open Government Licence v3.0.');
    expect(readme).toContain('https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/');
  });
});

describe('its tree hash', () => {
  const files = bundledPluginFiles(cfeDir);

  it('is sha256 over the plugin files and both placed collections', () => {
    const paths = [...files.keys()];
    expect(paths).toEqual(expect.arrayContaining(['plugin.json', 'README.md', 'collections/cfe-curriculum/curriculum.json', 'collections/education-scotland-eo/collection.json']));
    expect(paths.some((p) => p.startsWith('collections/education-scotland-eo/docs/'))).toBe(true);
    expect(cfe.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(cfe.hash).toBe(treeHash(files));
  });

  it('is the same on every load', () => {
    expect(buildPlugin(bundledPluginFiles(cfeDir)).hash).toBe(cfe.hash);
  });

  it('changes when the README or a collection file changes', () => {
    expect(buildPlugin(new Map(files).set('README.md', `${files.get('README.md')} `)).hash).not.toBe(cfe.hash);
    const path = 'collections/cfe-curriculum/curriculum.json';
    const changed = buildPlugin(new Map(files).set(path, `${files.get(path)}\n`));
    expect(changed.hash).not.toBe(cfe.hash);
    expect(changed.collections.get('cfe-curriculum')!.version).not.toBe(cfe.collections.get('cfe-curriculum')!.version);
  });
});

describe('served at /p/elm/cfe', () => {
  const block = { id: 'elm/cfe', version: '0.1.0', hash: cfe.hash };

  it('answers the manifest', () => {
    const res = routePlugin(store, 'GET', '/p/elm/cfe', undefined) as { status: number; body: Record<string, unknown> };
    expect(res).toMatchObject({ status: 200, body: { plugin: block, versions: ['0.1.0'] } });
  });

  it('answers outcomes and benchmarks for a code, stamped with the plugin', () => {
    const outcomes = post('/p/elm/cfe@0.1.0/api/collections/cfe-curriculum/outcomes', { code: 'LIT 2-04a' });
    expect(outcomes).toMatchObject({ status: 200, body: { plugin: block, version: cfe.collections.get('cfe-curriculum')!.version } });
    expect(outcomes.body.total).toBeGreaterThan(0);
    const benchmarks = post('/p/elm/cfe/api/collections/cfe-curriculum/benchmarks', { codes: ['LIT 2-04a'] });
    expect(benchmarks.status).toBe(200);
    const found = benchmarks.body.benchmarks as { codes: string[] }[];
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((b) => b.codes.includes('LIT 2-04a'))).toBe(true);
    const structure = post('/p/elm/cfe/api/collections/cfe-curriculum/structure');
    expect(structure.status).toBe(200);
    expect((structure.body.areas as { name: string }[]).map((a) => a.name)).toContain('Literacy and English');
    expect(structure.body.benchmark_levels).toEqual(['second', 'third']);
  });

  it('searches the E&O documents, and leaves grep and list off', () => {
    const res = post('/p/elm/cfe/api/collections/education-scotland-eo/search', { query: 'fractions' });
    expect(res.status).toBe(200);
    expect((res.body.results as { path: string }[]).some((r) => r.path === 'numeracy-and-mathematics.md')).toBe(true);
    expect(post('/p/elm/cfe/api/collections/education-scotland-eo/grep', { pattern: 'x' }).status).toBe(404);
    expect(post('/p/elm/cfe/api/collections/cfe-curriculum/search', { query: 'x' }).status).toBe(404);
  });
});
