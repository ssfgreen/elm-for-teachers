import { describe, expect, it } from 'vitest';
import { loadPedagogy } from './load.js';
import { claims, entries, entry, facets } from './query.js';
import { PEDAGOGY_YAML } from './test-fixture.js';

const lib = loadPedagogy(PEDAGOGY_YAML);
const ids = (r: { entries: { id: string }[] }) => r.entries.map((e) => e.id);

describe('entries', () => {
  it('filters by type, and gives each entry its claims to cite', () => {
    const r = entries(lib, { types: ['format_rule'] });
    expect(ids(r)).toEqual(['fmt-bold']);
    expect(r.entries[0]!.claims).toEqual([{ id: 'clm-bold', text: 'Use bold for emphasis.', support_type: 'direct_quote' }]);
  });

  it('counts an entry for every stage and subject when it names none, or its area is all', () => {
    expect(ids(entries(lib, { facets: { stage: ['p7'] } }))).toEqual(['fmt-bold', 'adp-spacing']);
    expect(ids(entries(lib, { facets: { stage: ['s1'], subject: ['History'] } }))).toEqual(['fmt-bold', 'adp-spacing', 'cur-his', 'cau-hol']);
    expect(ids(entries(lib, { facets: { subject: ['English and literacy'] } }))).toEqual(['fmt-bold', 'adp-spacing']);
  });

  it('matches a barrier or a hint strictly', () => {
    expect(ids(entries(lib, { facets: { often_relevant_to: ['Dyslexia'] } }))).toEqual(['adp-spacing']);
    expect(ids(entries(lib, { facets: { barrier: ['working_memory'] } }))).toEqual([]);
  });

  it('finds the pedagogy aligned to a curriculum item, by words, and without not-recommended entries', () => {
    expect(ids(entries(lib, { aligns_to: ['cur-his'] }))).toEqual(['cau-hol']);
    expect(ids(entries(lib, { text: 'TESTIMONY' }))).toEqual(['cau-hol']);
    expect(ids(entries(lib, { recommended_only: true, facets: { stage: ['s1'] } }))).toEqual(['fmt-bold', 'adp-spacing', 'cur-his']);
  });

  it('cuts at the limit and says so', () => {
    expect(entries(lib, { limit: 1 })).toMatchObject({ total: 4, truncated: true });
  });
});

describe('claims and entry', () => {
  it('gives each claim its passages, sources and how far it was checked', () => {
    const r = claims(lib, { ids: ['clm-bold', 'clm-spacing', 'clm-his', 'clm-nope'] });
    expect(r.missing).toEqual(['clm-nope']);
    expect(r.claims.map((c) => c.verification)).toEqual(['located', 'locator_to_confirm', 'not_fetched']);
    expect(r.claims[0]!.passages[0]!.source).toMatchObject({ title: 'Style guide', reuse_rule: 'short_quote_only' });
    expect(r.claims[2]!.support_type).toBe('inference_by_curator');
  });

  it('gives an entry in full with what links to it', () => {
    const r = entry(lib, { id: 'cur-his' });
    expect(r.entry.claims[0]!.id).toBe('clm-his');
    expect(r.linked_from).toEqual({ aligns_to: [{ id: 'cau-hol', type: 'caution', title: 'No simulation' }] });
    expect(() => entry(lib, { id: 'nope' })).toThrow(/no entry/);
  });

  it('keeps citations out of every answer, so none reach the model', () => {
    expect(lib.entries.get('adp-spacing')!.evidence.citations).toHaveLength(1);
    const answers = [entry(lib, { id: 'adp-spacing' }), entries(lib, {}), claims(lib, { ids: ['clm-spacing'] }), facets(lib)];
    for (const a of answers) expect(JSON.stringify(a)).not.toMatch(/citations|10\.1073|Zorzi/);
    expect(entry(lib, { id: 'adp-spacing' }).entry.evidence).toEqual({ rating: 'moderate', rationale: 'trial' });
  });

  it('counts the facets in use', () => {
    const f = facets(lib);
    expect(f.types).toEqual({ format_rule: 1, adaptation: 1, curriculum_ref: 1, caution: 1 });
    expect(f.facets.stage).toEqual({ p7: 1, s1: 3 });
  });
});
