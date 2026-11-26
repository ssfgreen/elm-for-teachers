import { FIXTURE_FILES } from '../core/test-fixture.js';
import { PEDAGOGY_YAML } from '../pedagogy/test-fixture.js';

/** A small valid manifest: one documents and one pedagogy collection, one setting. */
export const FIXTURE_MANIFEST = {
  format: 1,
  id: 'test/plugin',
  version: '1.0.0',
  name: 'Test plugin',
  description: 'A plugin for tests',
  reuse: 'adapt_with_credit',
  collections: [
    { id: 'test', kind: 'documents', path: 'collections/test' },
    { id: 'ped', kind: 'pedagogy', path: 'collections/ped' },
  ],
  tools: [{ tool: 'search' }, { tool: 'entries', collection: 'ped', settings: ['hide'] }],
  settings: { hide: { type: 'entries', label: 'Entries I hide', default: [], effect: 'hide_ids', collection: 'ped' } },
  browse: { view: 'pedagogy', collection: 'ped' },
};

const PED_META = { id: 'ped', kind: 'pedagogy', name: 'Ped', publisher: 'Us', description: 'A test', licence: 'Mixed', licence_url: null, homepage: 'https://example.org', sources: [] };

/** The fixture plugin's whole tree, keyed by path inside the plugin folder. */
export function fixturePluginFiles(manifest: object = FIXTURE_MANIFEST): Map<string, string> {
  const files = new Map<string, string>([
    ['plugin.json', JSON.stringify(manifest, null, 2)],
    ['README.md', '# Test plugin\n'],
    ['collections/ped/collection.json', JSON.stringify(PED_META)],
    ['collections/ped/pedagogy.yaml', PEDAGOGY_YAML],
  ]);
  for (const [path, text] of FIXTURE_FILES) files.set(`collections/test/${path}`, text);
  return files;
}
