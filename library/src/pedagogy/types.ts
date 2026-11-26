/**
 * A pedagogy collection (library/pedagogy-sample/HANDOFF.md): sources, passages, entries and
 * claims, as in `pedagogy_library_schema.yaml`. The model cites claims; a claim is backed by
 * passages, and a passage by a source. Only the fields the server reads are typed; the rest of
 * each record is kept as it was written.
 */

export const ENTRY_TYPES = ['principle', 'activity_type', 'signature_pedagogy', 'adaptation', 'format_rule', 'exemplar', 'curriculum_ref', 'caution'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

/** The facets an entry can be filtered by. A list facet matches if any of its values does. */
export const LIST_FACETS = ['jurisdiction', 'cfe_level', 'stage', 'curriculum_area', 'subject', 'lesson_purpose', 'knowledge_type', 'expertise', 'artefact_type', 'barrier', 'often_relevant_to'] as const;
export type ListFacet = (typeof LIST_FACETS)[number];

/** The ratings an entry's evidence can carry (`pedagogy_library_schema.yaml`), or none. */
export const EVIDENCE_RATINGS = ['strong', 'moderate', 'emerging', 'contested', 'practitioner_wisdom', 'not_recommended'] as const;

/**
 * What stands behind an evidence rating, for the curator and the studio: never sent to the model.
 * `derived` marks one filled from the entry's own sources (#142) rather than written by hand.
 * `unreadable` keeps a citation that is none of the three as written, so `citationProblems` can
 * name it rather than lose it.
 */
export type Citation =
  | { kind: 'practitioner_example'; text: string }
  | { kind: 'url'; url: string; description: string; derived?: true }
  | { kind: 'doi'; doi: string; citation: string; derived?: true }
  | { kind: 'unreadable'; given: string };
export const CITATION_KINDS = ['practitioner_example', 'url', 'doi'] as const;
export type CitationKind = (typeof CITATION_KINDS)[number];

export interface Source {
  id: string;
  title: string;
  publisher: string;
  authors: string[];
  year: number | null;
  url: string;
  source_type: string;
  evidence_weight: string;
  licence: string;
  reuse_rule: 'full_text_ok' | 'short_quote_only' | 'locator_only';
  version: string | null;
  retrieved_at: string | null;
}

export interface Passage {
  id: string;
  source_id: string;
  locator: string;
  text: string;
  excerpt_type: 'quote' | 'paraphrase';
  fetched_url: string | null;
  verified_by_fetch: boolean;
}

export interface Claim {
  id: string;
  entry_id: string;
  text: string;
  supported_by: string[];
  support_type: 'direct_quote' | 'paraphrase' | 'inference_by_curator';
}

export interface Entry {
  id: string;
  type: EntryType;
  title: string;
  summary: string;
  body: string;
  status: string;
  version: string | null;
  facets: Partial<Record<ListFacet, string[]>> & { access_dimension?: string; changes_goal?: boolean };
  evidence: { rating: string | null; rationale: string | null; citations: Citation[] };
  prerequisites: string[];
  risks: string[];
  relations: Record<string, string[]>;
  artefact_recipes: Record<string, string>;
  render_settings: Record<string, unknown> | null;
  claims: string[];
  reviewed_by: string[];
  last_reviewed: string | null;
}

export interface PedagogyLibrary {
  sources: Map<string, Source>;
  passages: Map<string, Passage>;
  entries: Map<string, Entry>;
  claims: Map<string, Claim>;
}

/** How far a claim's support has been checked, for the "i" hover (HANDOFF.md section 4). */
export type Verification = 'located' | 'locator_to_confirm' | 'not_fetched';
