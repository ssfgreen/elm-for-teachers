/**
 * Cases for `entryCitationProblems`: every rating with every kind, malformed URLs and DOIs, and
 * unrated entries. `problem` is a pattern the one problem must match, or null for none.
 */
import { EVIDENCE_RATINGS } from './types.js';

export interface CitationCase {
  name: string;
  rating: string | null;
  citations: unknown;
  problem: RegExp | null;
}

const EXAMPLE = { kind: 'practitioner_example', text: 'A P5 teacher found bold headings easier for her class.' };
const URL_ = { kind: 'url', url: 'https://www.w3.org/TR/WCAG22/', description: 'WCAG 2.2, success criterion 1.4.12' };
const DOI_ = { kind: 'doi', doi: '10.1073/pnas.1205566109', citation: 'Zorzi et al. (2012), PNAS 109(28)' };
const BY_KIND = { practitioner_example: EXAMPLE, url: URL_, doi: DOI_ } as const;

const allowed = (rating: string) => (rating === 'practitioner_wisdom' ? ['practitioner_example', 'url'] : ['url', 'doi']);

/** Every rating against every kind. */
const grid: CitationCase[] = EVIDENCE_RATINGS.flatMap((rating) =>
  (Object.keys(BY_KIND) as (keyof typeof BY_KIND)[]).map((kind) => ({
    name: `${rating} with a ${kind}`,
    rating,
    citations: [BY_KIND[kind]],
    problem: allowed(rating).includes(kind) ? null : new RegExp(`rated ${rating}, which takes .* not ${kind}`),
  })),
);

export const CITATION_CASES: CitationCase[] = [
  ...grid,
  ...EVIDENCE_RATINGS.map((rating) => ({ name: `${rating} with no citation`, rating, citations: undefined, problem: new RegExp(`rated ${rating} with no citation`) })),
  { name: 'moderate with an empty list', rating: 'moderate', citations: [], problem: /with no citation \(url or doi\)/ },
  { name: 'unrated with none', rating: null, citations: undefined, problem: null },
  { name: 'unrated with an empty list', rating: null, citations: [], problem: null },
  { name: 'unrated with a citation', rating: null, citations: [URL_], problem: /citations but no evidence rating/ },
  { name: 'a single citation, not a list', rating: 'strong', citations: DOI_, problem: null },
  { name: 'two citations, both allowed', rating: 'practitioner_wisdom', citations: [EXAMPLE, URL_], problem: null },
  // URLs
  { name: 'a url with no scheme', rating: 'moderate', citations: [{ ...URL_, url: 'www.w3.org/TR/WCAG22/' }], problem: /not a web address/ },
  { name: 'a url that is not http', rating: 'moderate', citations: [{ ...URL_, url: 'ftp://example.org/a' }], problem: /not a web address/ },
  { name: 'a url with no dot in the host', rating: 'moderate', citations: [{ ...URL_, url: 'https://localhost/a' }], problem: /not a web address/ },
  { name: 'a url that is empty', rating: 'moderate', citations: [{ kind: 'url', description: 'x' }], problem: /not a web address: \(empty\)/ },
  { name: 'a url with no description', rating: 'moderate', citations: [{ kind: 'url', url: URL_.url }], problem: /url citation with no description/ },
  { name: 'an http url is fine', rating: 'moderate', citations: [{ ...URL_, url: 'http://example.org/page' }], problem: null },
  // DOIs
  { name: 'a doi with doi: in front is read bare', rating: 'strong', citations: [{ ...DOI_, doi: 'doi:10.1073/pnas.1205566109' }], problem: null },
  { name: 'a doi as a doi.org link is read bare', rating: 'strong', citations: [{ ...DOI_, doi: 'https://doi.org/10.1073/pnas.1205566109' }], problem: null },
  { name: 'a doi with no 10. prefix', rating: 'strong', citations: [{ ...DOI_, doi: '1073/pnas.1205566109' }], problem: /not a DOI: 1073/ },
  { name: 'a doi with no suffix', rating: 'strong', citations: [{ ...DOI_, doi: '10.1073/' }], problem: /not a DOI/ },
  { name: 'a doi with a space', rating: 'strong', citations: [{ ...DOI_, doi: '10.1073/pnas 1205566109' }], problem: /not a DOI/ },
  { name: 'a doi with no citation', rating: 'strong', citations: [{ kind: 'doi', doi: DOI_.doi }], problem: /doi citation with no citation/ },
  // Other shapes
  { name: 'a practitioner example with no text', rating: 'practitioner_wisdom', citations: [{ kind: 'practitioner_example', text: '  ' }], problem: /practitioner_example with no text/ },
  { name: 'an unknown kind', rating: 'moderate', citations: [{ kind: 'book', title: 'x' }], problem: /not a practitioner_example, url or doi/ },
  { name: 'a bare string', rating: 'moderate', citations: ['https://example.org'], problem: /not a practitioner_example, url or doi/ },
];
