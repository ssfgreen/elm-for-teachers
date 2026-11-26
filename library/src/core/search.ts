import { CODE_RE } from './codes.js';
import { badRequest } from './errors.js';
import { selectDocs } from './list.js';
import { parseQuery, tokenise, type Query } from './tokens.js';
import type { Collection, Filters, LibraryDoc } from './types.js';

export const SEARCH_DEFAULT_LIMIT = 10;
export const SEARCH_MAX_LIMIT = 50;
const SNIPPET_CHARS = 300;
const K1 = 1.2;
const B = 0.75;
/** Words in the headings above a line, and in the title, count for less than words in it. */
const HEADING_WEIGHT = 0.4;

export interface SearchArgs {
  query: string;
  filters?: Filters;
  limit?: number;
}

export interface SearchResult {
  path: string;
  title: string;
  source_url: string | null;
  snippet: string;
  score: number;
  /** Where the snippet is, for a `read` after: not in the plans' contract, but it costs nothing. */
  line: number;
}

/** A passage is one line of a document, which is one experience and outcome or one paragraph. */
interface Passage {
  doc: LibraryDoc;
  line: number;
  text: string;
  codes: string[];
  tf: Map<string, number>;
  context: Map<string, number>;
  length: number;
}

const index = new WeakMap<Collection, { passages: Passage[]; df: Map<string, number>; avg: number }>();

function count(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function buildIndex(collection: Collection) {
  const passages: Passage[] = [];
  for (const doc of collection.docs) {
    const headings: string[] = [];
    doc.lines.forEach((raw, i) => {
      const text = raw.trim();
      const heading = /^(#{1,6})\s+(.*)$/.exec(text);
      if (heading) headings.splice(heading[1]!.length - 1, Infinity, heading[2]!);
      if (text.length === 0) return;
      const tokens = tokenise(text);
      passages.push({
        doc,
        line: i + 1,
        text,
        codes: [...text.matchAll(CODE_RE)].map((m) => m[0]),
        tf: count(tokens),
        context: count(tokenise(`${doc.title} ${headings.join(' ')}`)),
        length: tokens.length,
      });
    });
  }
  const df = new Map<string, number>();
  for (const p of passages) for (const t of new Set([...p.tf.keys(), ...p.context.keys()])) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = passages.reduce((n, p) => n + p.length, 0) / Math.max(passages.length, 1);
  const built = { passages, df, avg };
  index.set(collection, built);
  return built;
}

/** Codes first: a line that starts with the code wins, then one that names it, then a prefix. */
function codeScore(p: Passage, q: Query): number {
  let score = 0;
  for (const code of q.codes) {
    const exact = p.codes.includes(code);
    if (exact && p.text.startsWith(code)) score += 1000;
    else if (exact) score += 500;
    else if (p.codes.some((c) => c.startsWith(code))) score += p.text.startsWith(code) ? 300 : 150;
  }
  return score;
}

function snippet(text: string, q: Query): string {
  if (text.length <= SNIPPET_CHARS) return text;
  const lower = text.toLowerCase();
  const hits = [...q.codes.map((c) => text.indexOf(c)), ...q.terms.map((t) => lower.indexOf(t))].filter((i) => i >= 0);
  const at = hits.length > 0 ? Math.min(...hits) : 0;
  const start = Math.max(0, Math.min(at - 60, text.length - SNIPPET_CHARS));
  return `${start > 0 ? '…' : ''}${text.slice(start, start + SNIPPET_CHARS)}${start + SNIPPET_CHARS < text.length ? '…' : ''}`;
}

/** Ranked keyword search (BM25 over lines, with codes ranked first). */
export function search(collection: Collection, args: SearchArgs): { results: SearchResult[] } {
  if (typeof args.query !== 'string' || args.query.trim().length === 0) throw badRequest('query is empty');
  const limit = args.limit ?? SEARCH_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) throw badRequest(`limit must be from 1 to ${SEARCH_MAX_LIMIT}`);

  const q = parseQuery(args.query);
  const { passages, df, avg } = index.get(collection) ?? buildIndex(collection);
  const allowed = new Set(selectDocs(collection, { filters: args.filters }));
  const n = passages.length;
  const scored: { p: Passage; score: number }[] = [];
  for (const p of passages) {
    if (!allowed.has(p.doc)) continue;
    let score = codeScore(p, q);
    for (const term of q.terms) {
      const d = df.get(term);
      if (!d) continue;
      const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
      const tf = (p.tf.get(term) ?? 0) + HEADING_WEIGHT * (p.context.get(term) ?? 0);
      score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * p.length) / avg));
    }
    if (score > 0 && q.phrase.length > 3 && p.text.toLowerCase().includes(q.phrase)) score += 2;
    if (score > 0) scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.p.doc.path < b.p.doc.path ? -1 : 1) || a.p.line - b.p.line);
  const results = scored.slice(0, limit).map(({ p, score }) => ({
    path: p.doc.path,
    title: p.doc.title,
    source_url: typeof p.doc.frontmatter.source_url === 'string' ? p.doc.frontmatter.source_url : null,
    snippet: snippet(p.text, q),
    score: Math.round(score * 1000) / 1000,
    line: p.line,
  }));
  return { results };
}
