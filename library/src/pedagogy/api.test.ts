import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCollection } from '../core/collection.js';
import { loadCollection } from '../core/fs.js';
import { fixture } from '../core/test-fixture.js';
import { describeCollection, runOperation } from '../server/api.js';
import { PEDAGOGY_YAML } from './test-fixture.js';

const meta = { id: 'ped', kind: 'pedagogy', name: 'Ped', publisher: 'Us', description: 'A test', licence: 'Mixed', licence_url: null, homepage: 'https://example.org', sources: [] };
const ped = buildCollection(new Map([['collection.json', JSON.stringify(meta)], ['pedagogy.yaml', PEDAGOGY_YAML]]));

describe('pedagogy operations', () => {
  it('runs on a pedagogy collection, with the version on every answer', () => {
    const r = runOperation(ped, 'entries', { types: ['caution'] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: ped.version, total: 1 });
    expect(describeCollection(ped)).toMatchObject({ kind: 'pedagogy', entry_count: 4, claim_count: 4 });
  });

  it('refuses unknown keys, and runs on no other kind of collection', () => {
    expect(runOperation(ped, 'entries', { colour: 'red' }).status).toBe(400);
    expect(runOperation(ped, 'claims', { ids: [] }).status).toBe(400);
    expect(runOperation(fixture(), 'entries', {})).toMatchObject({ status: 404 });
  });

  it('loads the sample library as delivered, with every entry a draft', () => {
    const real = loadCollection(fileURLToPath(new URL('../../collections/pedagogy-scotland', import.meta.url)));
    expect(describeCollection(real)).toMatchObject({ entry_count: 116, claim_count: 437 });
    expect(runOperation(real, 'facets', {}).body).toMatchObject({ statuses: { draft: 116 } });
  });
});
