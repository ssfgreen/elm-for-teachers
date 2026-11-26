/**
 * One-off fill (issue #142): gives every rated entry without citations one citation per source it
 * reaches through claims → passages → sources. A source whose URL is on doi.org becomes a `doi`
 * citation where the rating takes one; any other source a `url` citation with the source title as
 * its description. Each is marked `derived: true`, so a curator can tell them from hand-written ones.
 *
 * The file is edited by splicing text in, located with the yaml Document API, rather than by
 * re-serialising it: every byte outside the new citation lines stays as it was.
 *
 * It is also a refresh step: `validate.py` rebuilds `pedagogy.yaml` from `pedagogy-sample/parts`,
 * which hold no citations, so run this after every copy of `out.yaml` (library/README.md).
 *
 * Run: `pnpm --filter @edw/library fill-citations [path]`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMap, isScalar, isSeq, parseDocument, stringify, type YAMLMap } from 'yaml';
import { kindsFor } from './citations.js';

type Raw = Record<string, unknown>;
type Derived = { kind: 'url'; url: string; description: string } | { kind: 'doi'; doi: string; citation: string };

const DOI_URL = /^https?:\/\/(dx\.)?doi\.org\/(10\.\d{4,9}\/\S+)$/i;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** The reference written for a doi citation: authors (year). Title. Publisher. */
function reference(s: Raw): string {
  const authors = Array.isArray(s.authors) ? s.authors.map(str).filter(Boolean).join(', ') : '';
  const year = str(s.year);
  const head = [authors, year && `(${year})`].filter(Boolean).join(' ');
  return [head, str(s.title), str(s.publisher)].filter(Boolean).join('. ') + '.';
}

/** The citations an entry's sources give it, in the order its claims first reach them. */
export function derivedCitations(entry: Raw, data: Raw): Derived[] {
  const byId = (list: unknown) => new Map(((list as Raw[] | undefined) ?? []).map((x) => [str(x.id), x]));
  const sources = byId(data.sources);
  const passages = byId(data.passages);
  const claims = byId(data.claims);
  const takesDoi = kindsFor(str((entry.evidence as Raw | undefined)?.rating) || null).includes('doi');
  const seen = new Set<string>();
  const out: Derived[] = [];
  for (const claimId of (entry.claims as unknown[] | undefined) ?? []) {
    for (const psgId of (claims.get(str(claimId))?.supported_by as unknown[] | undefined) ?? []) {
      const sourceId = str(passages.get(str(psgId))?.source_id);
      const source = sources.get(sourceId);
      if (!source || seen.has(sourceId)) continue;
      seen.add(sourceId);
      const url = str(source.url);
      if (!url) continue;
      const doi = DOI_URL.exec(url)?.[2];
      out.push(doi && takesDoi ? { kind: 'doi', doi, citation: reference(source) } : { kind: 'url', url, description: str(source.title) });
    }
  }
  return out;
}

/** One YAML scalar on one line, quoted only when it has to be. */
const scalar = (v: string) => stringify(v, { lineWidth: 0 }).trimEnd();

function citationLines(citations: Derived[], indent: string): string {
  const lines = [`${indent}citations:`];
  for (const c of citations) {
    const [k1, k2] = c.kind === 'url' ? (['url', 'description'] as const) : (['doi', 'citation'] as const);
    lines.push(`${indent}- kind: ${c.kind}`, `${indent}  ${k1}: ${scalar((c as Raw)[k1] as string)}`, `${indent}  ${k2}: ${scalar((c as Raw)[k2] as string)}`, `${indent}  derived: true`);
  }
  return `${lines.join('\n')}\n`;
}

/** Where the line holding `offset` starts. */
const lineStart = (text: string, offset: number) => text.lastIndexOf('\n', offset - 1) + 1;

/** Where the line holding `offset` starts, moved up past any comment lines just above it, so they stay with their key. */
function aboveComments(text: string, offset: number): number {
  let at = lineStart(text, offset);
  while (at > 0) {
    const prev = lineStart(text, at - 1);
    if (!/^\s*#/.test(text.slice(prev, at))) break;
    at = prev;
  }
  return at;
}

export interface FillResult {
  text: string;
  entries: number;
  citations: number;
  dois: number;
  /** Rated entries that reach no source with a URL, so were left without a citation. */
  unreached: string[];
}

/** Fills the citations of every rated entry that has none. Entries that already have some are left alone. */
export function fillCitations(text: string): FillResult {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(`pedagogy.yaml does not parse: ${doc.errors[0]!.message}`);
  const data = doc.toJS() as Raw;
  const entries = doc.get('entries');
  if (!isSeq(entries)) throw new Error('pedagogy.yaml has no entries list');

  const inserts: { at: number; lines: string }[] = [];
  const result: FillResult = { text, entries: 0, citations: 0, dois: 0, unreached: [] };
  for (const node of entries.items) {
    if (!isMap(node)) continue;
    const entry = (node as YAMLMap).toJSON() as Raw;
    const evidence = (node as YAMLMap).get('evidence', true);
    if (!isMap(evidence) || !str((entry.evidence as Raw | undefined)?.rating) || (entry.evidence as Raw).citations !== undefined) continue;
    if (evidence.flow) throw new Error(`entry ${str(entry.id)}: evidence is written inline; write it as a block first`);
    const citations = derivedCitations(entry, data);
    if (!citations.length) {
      result.unreached.push(str(entry.id));
      continue;
    }
    // After evidence's last pair: above the entry's next key and any comment on it, or at the entry's end.
    const pairs = (node as YAMLMap).items;
    const next = pairs[pairs.findIndex((p) => isScalar(p.key) && p.key.value === 'evidence') + 1];
    const keyStart = next && isScalar(next.key) ? next.key.range?.[0] : undefined;
    const at = keyStart !== undefined ? aboveComments(text, keyStart) : node.range![2];
    const firstKey = evidence.items[0]!.key;
    const indent = ' '.repeat(isScalar(firstKey) ? firstKey.range![0] - lineStart(text, firstKey.range![0]) : 4);
    inserts.push({ at, lines: citationLines(citations, indent) });
    result.entries++;
    result.citations += citations.length;
    result.dois += citations.filter((c) => c.kind === 'doi').length;
  }
  for (const { at, lines } of inserts.reverse()) result.text = result.text.slice(0, at) + lines + result.text.slice(at);
  return result;
}

function main(path: string) {
  const r = fillCitations(readFileSync(path, 'utf8'));
  writeFileSync(path, r.text);
  console.log(`${r.entries} entries filled with ${r.citations} citations (${r.dois} doi)`);
  if (r.unreached.length) console.log(`no source with a URL: ${r.unreached.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2] ?? fileURLToPath(new URL('../../collections/pedagogy-scotland/pedagogy.yaml', import.meta.url)));
}
