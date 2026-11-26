import { describe, expect, it } from 'vitest';
import { buildCollection } from '../core/collection.js';
import { fixture } from '../core/test-fixture.js';
import type { Collection } from '../core/types.js';
import { PEDAGOGY_YAML } from '../pedagogy/test-fixture.js';
import { runOperation, type Operation } from '../server/api.js';
import { TOOL_KINDS, type CollectionKind, type Tool } from './manifest.js';

// The fixed tool set is exactly the library's operations: this fails to compile if either gains one.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameNames: Same<Tool, Operation> = true;

const meta = (id: string, kind: string) => ({ id, kind, name: id, publisher: 'Us', description: 'A test', licence: 'Mixed', licence_url: null, homepage: 'https://example.org', sources: [] });
const curriculum = JSON.stringify({ framework: 'cfe-eo', areas: [], outcomes: [], benchmarks: [], benchmark_levels: [] });
const byKind: Record<CollectionKind, Collection> = {
  documents: fixture(),
  pedagogy: buildCollection(new Map([['collection.json', JSON.stringify(meta('ped', 'pedagogy'))], ['pedagogy.yaml', PEDAGOGY_YAML]])),
  curriculum: buildCollection(new Map([['collection.json', JSON.stringify(meta('cur', 'curriculum'))], ['curriculum.json', curriculum]])),
};

/** A body each operation accepts, so an answer is about the collection's kind and not the body. */
const BODIES: Partial<Record<Tool, object>> = { search: { query: 'x' }, grep: { pattern: 'x' }, read: { path: 'numeracy.md' }, entry: { id: 'fmt-bold' }, claims: { ids: ['clm-bold'] }, benchmarks: { codes: ['LIT 2-01a'] } };

/** True when api.ts answers the operation on the collection, false when it refuses its kind. */
function runsOn(tool: Tool, c: Collection): boolean {
  const r = runOperation(c, tool, BODIES[tool] ?? {});
  expect(r.status).not.toBe(400);
  return !(r.status === 404 && /is not a (pedagogy|curriculum) collection/.test(JSON.stringify(r.body)));
}

describe('the tool-to-kind rules agree with server/api.ts', () => {
  it('names the same operations', () => {
    expect(sameNames).toBe(true);
  });

  it.each(Object.entries(TOOL_KINDS) as [Tool, CollectionKind][])('%s runs on a %s collection', (tool, kind) => {
    expect(runsOn(tool, byKind[kind])).toBe(true);
  });

  it.each((Object.entries(TOOL_KINDS) as [Tool, CollectionKind][]).filter(([, k]) => k !== 'documents'))(
    '%s is refused by the api on every other kind',
    (tool, kind) => {
      for (const [other, c] of Object.entries(byKind)) if (other !== kind) expect(runsOn(tool, c)).toBe(false);
    },
  );
});
