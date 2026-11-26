/**
 * The citation behind every evidence rating (issue #132). A `practitioner_wisdom` rating is backed
 * by a practitioner example or a URL; any other rating by a URL or a DOI; an unrated entry by
 * none. Citations are for the curator and the studio: they go into no tool answer.
 */
import type { Citation, CitationKind, Entry, PedagogyLibrary } from './types.js';

type Raw = Record<string, unknown>;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** A DOI as written, without a `doi:` or `https://doi.org/` in front. */
const bareDoi = (v: string) => v.replace(/^doi:\s*/i, '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');

/** Reads `evidence.citations` as written. Anything that is none of the three kinds is kept as `unreadable`. */
export function parseCitations(v: unknown): Citation[] {
  if (v === null || v === undefined) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map((c): Citation => {
    if (!c || typeof c !== 'object') return { kind: 'unreadable', given: JSON.stringify(c) };
    const r = c as Raw;
    if (r.kind === 'practitioner_example') return { kind: 'practitioner_example', text: text(r.text) };
    const derived = r.derived === true ? { derived: true as const } : {};
    if (r.kind === 'url') return { kind: 'url', url: text(r.url), description: text(r.description), ...derived };
    if (r.kind === 'doi') return { kind: 'doi', doi: bareDoi(text(r.doi)), citation: text(r.citation), ...derived };
    return { kind: 'unreadable', given: JSON.stringify(c) };
  });
}

/** Which kinds of citation a rating takes; none for an unrated entry. */
export function kindsFor(rating: string | null): readonly CitationKind[] {
  if (rating === null) return [];
  return rating === 'practitioner_wisdom' ? ['practitioner_example', 'url'] : ['url', 'doi'];
}

const DOI = /^10\.\d{4,9}\/\S+$/;

function isWebUrl(s: string) {
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** What is wrong with one citation on its own, whatever the rating. */
function shapeProblem(c: Citation): string | null {
  switch (c.kind) {
    case 'unreadable':
      return `a citation that is not a practitioner_example, url or doi: ${c.given}`;
    case 'practitioner_example':
      return c.text ? null : 'a practitioner_example with no text';
    case 'url':
      if (!isWebUrl(c.url)) return `a url citation whose url is not a web address: ${c.url || '(empty)'}`;
      return c.description ? null : `a url citation with no description: ${c.url}`;
    case 'doi':
      if (!DOI.test(c.doi)) return `a doi citation whose doi is not a DOI: ${c.doi || '(empty)'}`;
      return c.citation ? null : `a doi citation with no citation: ${c.doi}`;
  }
}

export function entryCitationProblems(e: Entry): string[] {
  const { rating, citations } = e.evidence;
  const kinds = kindsFor(rating);
  const out: string[] = [];
  if (rating === null && citations.length) out.push(`entry ${e.id}: citations but no evidence rating`);
  if (rating !== null && !citations.length) out.push(`entry ${e.id}: rated ${rating} with no citation (${kinds.join(' or ')})`);
  for (const c of citations) {
    const p = shapeProblem(c);
    if (p) out.push(`entry ${e.id}: ${p}`);
    else if (rating !== null && !(kinds as readonly string[]).includes(c.kind)) out.push(`entry ${e.id}: rated ${rating}, which takes ${kinds.join(' or ')}, not ${c.kind}`);
  }
  return out;
}

/** Every citation problem in a library, entry by entry. Pure: the loader warns with it, or refuses in strict mode. */
export function citationProblems(lib: PedagogyLibrary): string[] {
  return [...lib.entries.values()].flatMap(entryCitationProblems);
}
