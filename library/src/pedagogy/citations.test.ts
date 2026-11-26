import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CITATION_CASES } from './citations.cases.js';
import { citationProblems, entryCitationProblems, kindsFor, parseCitations } from './citations.js';
import { loadPedagogy } from './load.js';
import { PEDAGOGY_YAML } from './test-fixture.js';
import type { Entry } from './types.js';

const entryWith = (rating: string | null, citations: unknown) =>
  ({ id: 'e1', evidence: { rating, rationale: null, citations: parseCitations(citations) } }) as unknown as Entry;

describe('entryCitationProblems', () => {
  for (const c of CITATION_CASES) {
    it(c.name, () => {
      const problems = entryCitationProblems(entryWith(c.rating, c.citations));
      if (c.problem === null) expect(problems).toEqual([]);
      else {
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(c.problem);
      }
    });
  }

  it('says which kinds each rating takes', () => {
    expect(kindsFor('practitioner_wisdom')).toEqual(['practitioner_example', 'url']);
    expect(kindsFor('contested')).toEqual(['url', 'doi']);
    expect(kindsFor(null)).toEqual([]);
  });
});

const BOLD = 'evidence: {rating: practitioner_wisdom, rationale: guide, citations: [{kind: practitioner_example, text: A P7 class read bold more easily.}]}';

describe('loading with citations', () => {
  it('reads them onto the entry, and a cited library loads with no warning', () => {
    const warn = vi.fn();
    const lib = loadPedagogy(PEDAGOGY_YAML, { warn });
    expect(lib.entries.get('fmt-bold')!.evidence.citations).toEqual([{ kind: 'practitioner_example', text: 'A P7 class read bold more easily.' }]);
    expect(citationProblems(lib)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on a missing citation, and refuses it in strict mode', () => {
    const missing = PEDAGOGY_YAML.replace(BOLD, 'evidence: {rating: practitioner_wisdom, rationale: guide}');
    const warn = vi.fn();
    expect(loadPedagogy(missing, { warn }).entries.size).toBe(4);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(/1 citation problem\(s\), first: entry fmt-bold: rated practitioner_wisdom with no citation/);
    expect(() => loadPedagogy(missing, { strict: true })).toThrow(/entry fmt-bold: rated practitioner_wisdom with no citation/);
  });

  it('warns on a malformed citation, and refuses it in strict mode', () => {
    const bad = PEDAGOGY_YAML.replace('doi: 10.1073/pnas.1205566109', 'doi: pnas.1205566109');
    const warn = vi.fn();
    loadPedagogy(bad, { warn });
    expect(warn.mock.calls[0]![0]).toMatch(/entry adp-spacing: a doi citation whose doi is not a DOI/);
    expect(() => loadPedagogy(bad, { strict: true })).toThrow(/not a DOI/);
  });

  it('reads derived: true on a url or doi citation, and only true', () => {
    expect(parseCitations([{ kind: 'url', url: 'https://example.org', description: 'x', derived: true }])).toEqual([{ kind: 'url', url: 'https://example.org', description: 'x', derived: true }]);
    expect(parseCitations([{ kind: 'doi', doi: '10.1073/pnas.1205566109', citation: 'x', derived: 'yes' }])).toEqual([{ kind: 'doi', doi: '10.1073/pnas.1205566109', citation: 'x' }]);
  });

  // Filled by #142: the shipped library now loads strictly, with no warning.
  it("loads today's pedagogy-scotland library, strictly and with no warning", () => {
    const text = readFileSync(new URL('../../collections/pedagogy-scotland/pedagogy.yaml', import.meta.url), 'utf8');
    const warn = vi.fn();
    const lib = loadPedagogy(text, { warn });
    const rated = [...lib.entries.values()].filter((e) => e.evidence.rating !== null).length;
    expect(rated).toBeGreaterThan(0);
    expect(citationProblems(lib)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(() => loadPedagogy(text, { strict: true })).not.toThrow();
  });
});
