import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { citationProblems } from './citations.js';
import { fillCitations } from './fill-citations.js';
import { loadPedagogy } from './load.js';

const YAML = `sources:
- id: s-web
  title: 'A guide: with a colon'
  publisher: Guide Co
  authors: [Guide Co]
  year: 2023
  url: https://example.org/guide
- id: s-doi
  title: A trial
  publisher: A Journal 1(2)
  authors: [Smith A, Jones B]
  year: 2012
  url: https://doi.org/10.1073/pnas.1205566109
- id: s-none
  title: No address
  url: ''
passages:
- {id: p-web, source_id: s-web, text: a}
- {id: p-doi, source_id: s-doi, text: b}
- {id: p-none, source_id: s-none, text: c}
entries:
- id: e-strong
  # a comment that stays
  evidence:
    rating: strong
    rationale: >-
      Folded
      rationale.
  # a comment on claims, which stays above it
  claims: [c-doi, c-web, c-doi2]
- id: e-wisdom
  evidence:
    rating: practitioner_wisdom
    rationale: guide
  claims: [c-doi]
- id: e-unrated
  evidence:
    rating: null
  claims: [c-web]
- id: e-cited
  evidence:
    rating: moderate
    citations: [{kind: url, url: https://example.org/mine, description: Mine}]
  claims: [c-web]
- id: e-unreached
  evidence:
    rating: emerging
  claims: [c-none]
- id: e-last
  claims: [c-web]
  evidence:
    rating: moderate
claims:
- {id: c-doi, supported_by: [p-doi]}
- {id: c-doi2, supported_by: [p-doi, p-web]}
- {id: c-web, supported_by: [p-web]}
- {id: c-none, supported_by: [p-none]}
`;

const citationsOf = (text: string, id: string) => (parse(text) as { entries: { id: string; evidence: { citations?: unknown } }[] }).entries.find((e) => e.id === id)!.evidence.citations;

/** The text with every line the fill adds taken out again. */
const withoutCitations = (text: string) => text.replace(/^ +citations:\n(?: +- kind: (?:url|doi)\n(?: {2,}\w+: .*\n){3})+/gm, '');

describe('fillCitations', () => {
  const r = fillCitations(YAML);

  it('cites each source once, in the order the claims reach it, with a doi where the rating takes one', () => {
    expect(citationsOf(r.text, 'e-strong')).toEqual([
      { kind: 'doi', doi: '10.1073/pnas.1205566109', citation: 'Smith A, Jones B (2012). A trial. A Journal 1(2).', derived: true },
      { kind: 'url', url: 'https://example.org/guide', description: 'A guide: with a colon', derived: true },
    ]);
  });

  it('gives practitioner wisdom a url citation even for a doi.org source', () => {
    expect(citationsOf(r.text, 'e-wisdom')).toEqual([{ kind: 'url', url: 'https://doi.org/10.1073/pnas.1205566109', description: 'A trial', derived: true }]);
  });

  it('leaves unrated and already cited entries alone, and reports a rated one with no source address', () => {
    expect(citationsOf(r.text, 'e-unrated')).toBeUndefined();
    expect(citationsOf(r.text, 'e-cited')).toEqual([{ kind: 'url', url: 'https://example.org/mine', description: 'Mine' }]);
    expect(citationsOf(r.text, 'e-unreached')).toBeUndefined();
    expect(r.unreached).toEqual(['e-unreached']);
    expect(r).toMatchObject({ entries: 3, citations: 4, dois: 1 });
  });

  it('fills evidence written last in an entry', () => {
    expect(citationsOf(r.text, 'e-last')).toEqual([{ kind: 'url', url: 'https://example.org/guide', description: 'A guide: with a colon', derived: true }]);
  });

  it('only adds lines: taking them out gives back the file byte for byte', () => {
    expect(r.text).not.toBe(YAML);
    expect(withoutCitations(r.text)).toBe(YAML);
  });

  it('keeps a comment on the next key above that key', () => {
    expect(r.text).toMatch(/derived: true\n {2}# a comment on claims, which stays above it\n {2}claims: \[c-doi, c-web, c-doi2\]/);
  });

  it('changes nothing when run again', () => {
    expect(fillCitations(r.text).text).toBe(r.text);
  });

  it('refuses evidence written inline rather than rewrite it', () => {
    expect(() => fillCitations(YAML.replace('- id: e-wisdom\n  evidence:\n    rating: practitioner_wisdom\n    rationale: guide', '- id: e-wisdom\n  evidence: {rating: practitioner_wisdom}'))).toThrow(/inline/);
  });
});

describe('the shipped pedagogy-scotland file', () => {
  const text = readFileSync(new URL('../../collections/pedagogy-scotland/pedagogy.yaml', import.meta.url), 'utf8');

  it('is already filled: running the fill again changes nothing', () => {
    expect(fillCitations(text).text).toBe(text);
  });

  it('has a derived citation on every rated entry, and no citation problem', () => {
    const lib = loadPedagogy(text, { strict: true });
    const rated = [...lib.entries.values()].filter((e) => e.evidence.rating !== null);
    expect(rated).toHaveLength(84);
    expect(rated.every((e) => e.evidence.citations.length > 0 && e.evidence.citations.every((c) => 'derived' in c && c.derived))).toBe(true);
    expect(citationProblems(lib)).toEqual([]);
  });
});
