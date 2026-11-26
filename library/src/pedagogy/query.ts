/**
 * Navigating a pedagogy collection the way a teacher's request is shaped, rather than by
 * similarity: filter entries by type and facets (stage, subject, purpose, barrier…), narrow by
 * words, follow relations, and look claims up by id for citations. Pure functions over the
 * library in memory, so the JSON API, MCP and tests share them.
 */
import { badRequest, notFound } from '../core/errors.js';
import { LIST_FACETS, type Claim, type Entry, type ListFacet, type PedagogyLibrary, type Verification } from './types.js';

export const ENTRIES_DEFAULT_LIMIT = 20;
export const ENTRIES_MAX_LIMIT = 120;
export const CLAIMS_MAX = 200;

export type EntryFilters = Partial<Record<ListFacet, string[]>>;

export interface EntriesArgs {
  types?: string[];
  ids?: string[];
  facets?: EntryFilters;
  /** Entries whose `aligns_to` names one of these (curriculum_ref ids): the pedagogy for a curriculum item. */
  aligns_to?: string[];
  /** Words that must all appear in the entry's title, summary, body or claims (any case). */
  text?: string;
  /** Leave out entries rated not recommended (default false: they steer the model away). */
  recommended_only?: boolean;
  limit?: number;
}

/**
 * Facets where an entry with no value, or `curriculum_area: all`, applies everywhere: a
 * cross-cutting principle is for every stage and subject. The rest must match.
 */
const GENERAL: ReadonlySet<ListFacet> = new Set(['jurisdiction', 'cfe_level', 'stage', 'curriculum_area', 'subject']);

const norm = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
/** "English and literacy" matches "english" and "literacy and English" either way round. */
const subjectMatch = (want: string, have: string) => {
  const w = norm(want);
  const h = norm(have);
  return w === h || ` ${w} `.includes(` ${h} `) || ` ${h} `.includes(` ${w} `);
};

function facetMatches(e: Entry, facet: ListFacet, wanted: string[]): boolean {
  if (wanted.length === 0) return true;
  const have = e.facets[facet] ?? [];
  if (GENERAL.has(facet)) {
    if (have.length === 0) return true;
    if ((facet === 'subject' || facet === 'curriculum_area') && (e.facets.curriculum_area ?? []).some((a) => norm(a) === 'all')) return true;
  }
  const eq = facet === 'subject' ? subjectMatch : (a: string, b: string) => norm(a) === norm(b);
  return wanted.some((w) => have.some((h) => eq(w, h)));
}

const haystack = (lib: PedagogyLibrary, e: Entry) =>
  norm([e.id, e.title, e.summary, e.body, ...e.claims.map((c) => lib.claims.get(c)?.text ?? '')].join(' '));

/** An entry as a list shows it: enough to choose, with its claims to cite. */
export function entrySummary(lib: PedagogyLibrary, e: Entry) {
  const f = e.facets;
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    summary: e.summary,
    status: e.status,
    evidence: e.evidence.rating,
    ...(f.changes_goal !== undefined ? { changes_goal: f.changes_goal } : {}),
    facets: Object.fromEntries((['stage', 'subject', 'lesson_purpose', 'barrier', 'often_relevant_to'] as const).filter((k) => f[k]?.length).map((k) => [k, f[k]])),
    claims: e.claims.map((id) => lib.claims.get(id)!).map((c) => ({ id: c.id, text: c.text, support_type: c.support_type })),
  };
}

export function entries(lib: PedagogyLibrary, args: EntriesArgs) {
  const limit = args.limit ?? ENTRIES_DEFAULT_LIMIT;
  if (limit < 1 || limit > ENTRIES_MAX_LIMIT) throw badRequest(`limit must be 1 to ${ENTRIES_MAX_LIMIT}`);
  const words = norm(args.text ?? '').split(' ').filter((w) => w.length > 1);
  const types = new Set(args.types ?? []);
  const ids = args.ids ? new Set(args.ids) : null;
  const aligns = args.aligns_to ? new Set(args.aligns_to) : null;
  const found = [...lib.entries.values()].filter(
    (e) =>
      (types.size === 0 || types.has(e.type)) &&
      (!ids || ids.has(e.id)) &&
      (!aligns || (e.relations.aligns_to ?? []).some((t) => aligns.has(t))) &&
      !(args.recommended_only && e.evidence.rating === 'not_recommended') &&
      LIST_FACETS.every((k) => facetMatches(e, k, args.facets?.[k] ?? [])) &&
      (words.length === 0 || ((h) => words.every((w) => h.includes(w)))(haystack(lib, e))),
  );
  return { total: found.length, truncated: found.length > limit, entries: found.slice(0, limit).map((e) => entrySummary(lib, e)) };
}

const unconfirmed = (locator: string) => /UNCONFIRMED|TODO/i.test(locator);

export function verificationOf(lib: PedagogyLibrary, c: Claim): Verification {
  const ps = c.supported_by.map((p) => lib.passages.get(p)!);
  if (!ps.some((p) => p.verified_by_fetch)) return 'not_fetched';
  return ps.some((p) => unconfirmed(p.locator)) ? 'locator_to_confirm' : 'located';
}

/** A claim as the "i" hover shows it: the claim, its passages and their sources. */
export function claimDetail(lib: PedagogyLibrary, c: Claim) {
  const e = lib.entries.get(c.entry_id)!;
  return {
    id: c.id,
    text: c.text,
    support_type: c.support_type,
    verification: verificationOf(lib, c),
    entry: { id: e.id, title: e.title, type: e.type, status: e.status },
    passages: c.supported_by.map((pid) => {
      const p = lib.passages.get(pid)!;
      const s = lib.sources.get(p.source_id)!;
      return {
        id: p.id,
        locator: p.locator,
        text: p.text,
        excerpt_type: p.excerpt_type,
        verified_by_fetch: p.verified_by_fetch,
        source: { id: s.id, title: s.title, publisher: s.publisher, year: s.year, url: s.url, evidence_weight: s.evidence_weight, licence: s.licence, reuse_rule: s.reuse_rule },
      };
    }),
  };
}

export function claims(lib: PedagogyLibrary, args: { ids: string[] }) {
  if (args.ids.length > CLAIMS_MAX) throw badRequest(`at most ${CLAIMS_MAX} ids`);
  const ids = [...new Set(args.ids)];
  return {
    claims: ids.filter((id) => lib.claims.has(id)).map((id) => claimDetail(lib, lib.claims.get(id)!)),
    missing: ids.filter((id) => !lib.claims.has(id)),
  };
}

const brief = (e: Entry) => ({ id: e.id, type: e.type, title: e.title });

/** One entry in full, its claims with their support, and the entries it links to and from. */
export function entry(lib: PedagogyLibrary, args: { id: string }) {
  const e = lib.entries.get(args.id);
  if (!e) throw notFound(`no entry called ${args.id}`);
  const related = Object.fromEntries(Object.entries(e.relations).filter(([, v]) => v.length).map(([k, v]) => [k, v.map((id) => brief(lib.entries.get(id)!))]));
  const from = (rel: string) => [...lib.entries.values()].filter((x) => (x.relations[rel] ?? []).includes(e.id)).map(brief);
  const { claims: claimIds, ...rest } = e;
  return {
    // Citations are for the curator and the studio, not the model (#132).
    entry: { ...rest, evidence: { rating: e.evidence.rating, rationale: e.evidence.rationale }, claims: claimIds.map((id) => claimDetail(lib, lib.claims.get(id)!)) },
    related,
    /** The pedagogy that names this entry: for a curriculum_ref, what aligns to it; for a caution, what it is a caution for. */
    linked_from: Object.fromEntries((['aligns_to', 'caution_from', 'uses_principle', 'conflicts_with'] as const).map((k) => [k, from(k)] as const).filter(([, v]) => v.length > 0)),
  };
}

/** Every facet value in use, with how many entries carry it: what a browser's filters offer. */
export function facets(lib: PedagogyLibrary) {
  const count = (vals: string[]) => vals.reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {});
  const all = [...lib.entries.values()];
  return {
    counts: { sources: lib.sources.size, passages: lib.passages.size, entries: lib.entries.size, claims: lib.claims.size },
    types: count(all.map((e) => e.type)),
    statuses: count(all.map((e) => e.status)),
    evidence: count(all.map((e) => e.evidence.rating ?? 'none')),
    facets: Object.fromEntries(LIST_FACETS.map((k) => [k, count(all.flatMap((e) => e.facets[k] ?? []))])),
  };
}
