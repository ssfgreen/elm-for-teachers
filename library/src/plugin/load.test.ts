import { describe, expect, it } from 'vitest';
import { buildCollection } from '../core/collection.js';
import { buildPlugin, subtree } from './load.js';
import { treeHash } from './hash.js';
import { FIXTURE_MANIFEST, fixturePluginFiles } from './test-fixture.js';

describe('buildPlugin', () => {
  it('builds each collection from its own folder, with its own version', () => {
    const files = fixturePluginFiles();
    const p = buildPlugin(files);
    expect([...p.collections.keys()]).toEqual(['test', 'ped']);
    expect(p.collections.get('ped')!.pedagogy!.entries.size).toBe(4);
    expect(p.collections.get('test')!.docs).toHaveLength(2);
    expect(p.collections.get('test')!.version).toBe(buildCollection(subtree(files, 'collections/test')).version);
  });

  it('hashes the whole tree and keeps the declared settings', () => {
    const files = fixturePluginFiles();
    const p = buildPlugin(files);
    expect(p.hash).toBe(treeHash(files));
    expect(p.settings).toEqual(FIXTURE_MANIFEST.settings);
    expect(p.manifest.id).toBe('test/plugin');
  });

  it('changes the hash, and no collection version, when plugin.json changes', () => {
    const before = buildPlugin(fixturePluginFiles());
    const after = buildPlugin(fixturePluginFiles({ ...FIXTURE_MANIFEST, description: 'Changed' }));
    expect(after.hash).not.toBe(before.hash);
    for (const [id, c] of before.collections) expect(after.collections.get(id)!.version).toBe(c.version);
  });

  it('refuses a plugin with no plugin.json, or one that is not JSON', () => {
    const files = fixturePluginFiles();
    files.delete('plugin.json');
    expect(() => buildPlugin(files)).toThrow('plugin.json is missing');
    expect(() => buildPlugin(new Map([['plugin.json', '{']]))).toThrow('plugin.json is not JSON');
  });

  it('refuses a bad manifest with its message', () => {
    expect(() => buildPlugin(fixturePluginFiles({ ...FIXTURE_MANIFEST, id: 'nobody' }))).toThrow('id must be owner/name');
  });

  it('refuses a collection with no files, or whose collection.json disagrees with plugin.json', () => {
    const missing = fixturePluginFiles();
    for (const path of [...missing.keys()]) if (path.startsWith('collections/ped/')) missing.delete(path);
    expect(() => buildPlugin(missing)).toThrow('collection ped has no files at collections/ped');

    const swapped = { ...FIXTURE_MANIFEST, collections: [{ id: 'other', kind: 'documents', path: 'collections/test' }], tools: [], settings: {}, browse: undefined };
    expect(() => buildPlugin(fixturePluginFiles(swapped))).toThrow('says id test, and plugin.json says other');

    const kind = { ...FIXTURE_MANIFEST, collections: [{ id: 'test', kind: 'pedagogy', path: 'collections/test' }], tools: [], settings: {}, browse: undefined };
    expect(() => buildPlugin(fixturePluginFiles(kind))).toThrow('test is documents in collection.json, and pedagogy in plugin.json');
  });
});

describe('subtree', () => {
  it('takes the files under a folder only, not a folder whose name starts the same', () => {
    const files = new Map([
      ['c/a/x', '1'],
      ['c/ab/y', '2'],
    ]);
    expect([...subtree(files, 'c/a').keys()]).toEqual(['x']);
  });
});
