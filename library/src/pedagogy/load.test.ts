import { describe, expect, it } from 'vitest';
import { loadPedagogy } from './load.js';
import { PEDAGOGY_YAML } from './test-fixture.js';

describe('loadPedagogy', () => {
  it('reads every record by id, and drops relations to entries that are not there', () => {
    const lib = loadPedagogy(PEDAGOGY_YAML);
    expect([lib.sources.size, lib.passages.size, lib.entries.size, lib.claims.size]).toEqual([2, 3, 4, 4]);
    expect(lib.entries.get('cau-hol')!.relations.aligns_to).toEqual(['cur-his']);
    expect(lib.entries.get('adp-spacing')!.facets).toMatchObject({ barrier: ['decoding'], changes_goal: false });
    expect(lib.sources.get('src-a')!.retrieved_at).toBe('2026-11-12');
  });

  it('refuses a quote over 15 words', () => {
    const long = PEDAGOGY_YAML.replace('Use bold for emphasis, never italics.', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen');
    expect(() => loadPedagogy(long)).toThrow(/over 15 words/);
  });

  it('refuses a second quote from one source, and a quote from a locator-only source', () => {
    expect(() => loadPedagogy(PEDAGOGY_YAML.replace(/excerpt_type: paraphrase/g, 'excerpt_type: quote'))).toThrow(/locator only[\s\S]*at most 1/);
  });

  it('refuses a claim whose passage is missing', () => {
    expect(() => loadPedagogy(PEDAGOGY_YAML.replace('supported_by: [psg-a]', 'supported_by: [psg-zz]'))).toThrow(/no passage psg-zz/);
  });
});
