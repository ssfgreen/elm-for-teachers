/**
 * Reads a pedagogy collection's `pedagogy.yaml` (the output of `validate.py`) into maps by id,
 * and refuses a library that breaks the rules a server must keep (HANDOFF.md section 4): a
 * verbatim quote over 15 words, more than one quote from a source, a quote from a source that
 * allows a locator only, a claim with no passage, or a reference to a record that is not there.
 * A relation to an unknown entry is dropped, as validate.py does. A missing or malformed
 * citation behind an evidence rating (`citations.ts`) is a warning, or a refusal with `strict`.
 */
import { parse } from 'yaml';
import { citationProblems, parseCitations } from './citations.js';
import { ENTRY_TYPES, LIST_FACETS, type Claim, type Entry, type EntryType, type Passage, type PedagogyLibrary, type Source } from './types.js';

export const MAX_QUOTE_WORDS = 15;

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
const strOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : str(v));
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : v === null || v === undefined || v === '' ? [] : [str(v)]);
const records = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

function source(r: Raw): Source {
  const reuse = str(r.reuse_rule);
  return {
    id: str(r.id),
    title: str(r.title),
    publisher: str(r.publisher),
    authors: strs(r.authors),
    year: typeof r.year === 'number' ? r.year : null,
    url: str(r.url),
    source_type: str(r.source_type),
    evidence_weight: str(r.evidence_weight),
    licence: str(r.licence),
    reuse_rule: reuse === 'full_text_ok' || reuse === 'locator_only' ? reuse : 'short_quote_only',
    version: strOrNull(r.version),
    retrieved_at: strOrNull(r.retrieved_at),
  };
}

function passage(r: Raw): Passage {
  return {
    id: str(r.id),
    source_id: str(r.source_id),
    locator: str(r.locator),
    text: str(r.text).trim(),
    excerpt_type: r.excerpt_type === 'quote' ? 'quote' : 'paraphrase',
    fetched_url: strOrNull(r.fetched_url),
    verified_by_fetch: r.verified_by_fetch === true,
  };
}

function claim(r: Raw): Claim {
  const t = str(r.support_type);
  return {
    id: str(r.id),
    entry_id: str(r.entry_id),
    text: str(r.text).trim(),
    supported_by: strs(r.supported_by),
    support_type: t === 'direct_quote' || t === 'inference_by_curator' ? t : 'paraphrase',
  };
}

function entry(r: Raw): Entry {
  const f = (r.facets && typeof r.facets === 'object' ? r.facets : {}) as Raw;
  const facets: Entry['facets'] = {};
  for (const k of LIST_FACETS) if (f[k] !== undefined && f[k] !== null) facets[k] = strs(f[k]);
  if (f.access_dimension) facets.access_dimension = str(f.access_dimension);
  if (typeof f.changes_goal === 'boolean') facets.changes_goal = f.changes_goal;
  const ev = (r.evidence && typeof r.evidence === 'object' ? r.evidence : {}) as Raw;
  const rel = (r.relations && typeof r.relations === 'object' ? r.relations : {}) as Raw;
  const recipes = (r.artefact_recipes && typeof r.artefact_recipes === 'object' ? r.artefact_recipes : {}) as Raw;
  return {
    id: str(r.id),
    type: str(r.type) as EntryType,
    title: str(r.title),
    summary: str(r.summary).trim(),
    body: str(r.body).trim(),
    status: str(r.status) || 'draft',
    version: strOrNull(r.version),
    facets,
    evidence: { rating: strOrNull(ev.rating), rationale: strOrNull(ev.rationale), citations: parseCitations(ev.citations) },
    prerequisites: strs(r.prerequisites),
    risks: strs(r.risks),
    relations: Object.fromEntries(Object.entries(rel).map(([k, v]) => [k, strs(v)])),
    artefact_recipes: Object.fromEntries(Object.entries(recipes).map(([k, v]) => [k, str(v).trim()])),
    render_settings: r.render_settings && typeof r.render_settings === 'object' ? (r.render_settings as Record<string, unknown>) : null,
    claims: strs(r.claims),
    reviewed_by: strs(r.reviewed_by),
    last_reviewed: strOrNull(r.last_reviewed),
  };
}

const byId = <T extends { id: string }>(kind: string, list: T[]) => {
  const out = new Map<string, T>();
  for (const x of list) {
    if (!x.id) throw new Error(`pedagogy.yaml: a ${kind} has no id`);
    if (out.has(x.id)) throw new Error(`pedagogy.yaml: two records with the id ${x.id}`);
    out.set(x.id, x);
  }
  return out;
};

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export interface LoadOptions {
  /** Refuse a library with a citation problem, as the studio will on save. */
  strict?: boolean;
  /** Where citation warnings go when not strict: one line for the whole library. */
  warn?: (message: string) => void;
}

/** Parses and checks a library; throws with every problem found. */
export function loadPedagogy(text: string, opts: LoadOptions = {}): PedagogyLibrary {
  const raw = (parse(text) ?? {}) as Raw;
  const lib: PedagogyLibrary = {
    sources: byId('source', records(raw.sources).map(source)),
    passages: byId('passage', records(raw.passages).map(passage)),
    entries: byId('entry', records(raw.entries).map(entry)),
    claims: byId('claim', records(raw.claims).map(claim)),
  };
  const problems: string[] = [];
  const quotes = new Map<string, number>();
  for (const p of lib.passages.values()) {
    const s = lib.sources.get(p.source_id);
    if (!s) problems.push(`passage ${p.id}: no source ${p.source_id}`);
    if (p.excerpt_type !== 'quote') continue;
    if (wordCount(p.text) > MAX_QUOTE_WORDS) problems.push(`passage ${p.id}: a quote over ${MAX_QUOTE_WORDS} words`);
    if (s?.reuse_rule === 'locator_only') problems.push(`passage ${p.id}: a quote from ${s.id}, which allows a locator only`);
    quotes.set(p.source_id, (quotes.get(p.source_id) ?? 0) + 1);
  }
  for (const [s, n] of quotes) if (n > 1) problems.push(`source ${s}: ${n} quotes (at most 1)`);
  for (const c of lib.claims.values()) {
    if (!c.supported_by.length) problems.push(`claim ${c.id}: no passage`);
    for (const p of c.supported_by) if (!lib.passages.has(p)) problems.push(`claim ${c.id}: no passage ${p}`);
    if (!lib.entries.has(c.entry_id)) problems.push(`claim ${c.id}: no entry ${c.entry_id}`);
  }
  for (const e of lib.entries.values()) {
    if (!(ENTRY_TYPES as readonly string[]).includes(e.type)) problems.push(`entry ${e.id}: unknown type ${e.type}`);
    for (const c of e.claims) if (!lib.claims.has(c)) problems.push(`entry ${e.id}: no claim ${c}`);
    for (const k of Object.keys(e.relations)) e.relations[k] = e.relations[k]!.filter((t) => lib.entries.has(t));
  }
  const cited = citationProblems(lib);
  if (opts.strict) problems.push(...cited);
  if (problems.length) throw new Error(`pedagogy.yaml has ${problems.length} problem(s):\n${problems.slice(0, 20).join('\n')}`);
  if (cited.length) (opts.warn ?? console.warn)(`pedagogy.yaml: ${cited.length} citation problem(s), first: ${cited.slice(0, 3).join('; ')}`);
  return lib;
}
