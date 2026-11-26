import { describe, expect, it } from 'vitest';
import { buildPlugin } from './load.js';
import { compareSemver, createPluginStore, loadPluginStore } from './store.js';
import { FIXTURE_MANIFEST, fixturePluginFiles } from './test-fixture.js';

const at = (version: string) => buildPlugin(fixturePluginFiles({ ...FIXTURE_MANIFEST, version }));

describe('compareSemver', () => {
  it('orders by number, not text, with pre-releases before their release', () => {
    const sorted = ['1.10.0', '1.2.0', '1.0.0', '1.0.0-beta.2', '1.0.0-alpha', '1.0.0-beta.11', '1.0.0-alpha.1', '0.9.9', '2.0.0'].sort(compareSemver);
    expect(sorted).toEqual(['0.9.9', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0', '1.2.0', '1.10.0', '2.0.0']);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });
});

describe('the plugin store', () => {
  const store = createPluginStore([at('1.2.0'), at('1.10.0'), at('1.10.0-rc.1')]);

  it('lists versions highest first and takes the highest as the latest', () => {
    expect(store.versions('test/plugin')).toEqual(['1.10.0', '1.10.0-rc.1', '1.2.0']);
    expect(store.get('test/plugin')!.manifest.version).toBe('1.10.0');
    expect(store.get('test/plugin', '1.2.0')!.manifest.version).toBe('1.2.0');
  });

  it('knows nothing of an unknown id or version', () => {
    expect(store.versions('test/nope')).toEqual([]);
    expect(store.get('test/nope')).toBeUndefined();
    expect(store.get('test/plugin', '9.9.9')).toBeUndefined();
  });

  it('refuses the same version twice', () => {
    expect(() => createPluginStore([at('1.0.0'), at('1.0.0')])).toThrow(/test\/plugin@1.0.0 is loaded twice/);
  });

  it('loads the bundled plugins, one version each', () => {
    const bundled = loadPluginStore();
    expect(bundled.versions('elm/pedagogy')).toEqual(['0.1.0']);
  });
});
