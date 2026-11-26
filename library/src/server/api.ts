import type { z } from 'zod';
import { LibraryError } from '../core/errors.js';
import { grep } from '../core/grep.js';
import { list } from '../core/list.js';
import { read } from '../core/read.js';
import { search } from '../core/search.js';
import type { Collection } from '../core/types.js';
import { benchmarks, outcomes, structure } from '../curriculum/query.js';
import { benchmarksBody, outcomesBody, structureBody } from '../curriculum/schemas.js';
import type { CurriculumData } from '../curriculum/types.js';
import { claims, entries, entry, facets } from '../pedagogy/query.js';
import { claimsBody, entriesBody, entryBody, facetsBody } from '../pedagogy/schemas.js';
import type { PedagogyLibrary } from '../pedagogy/types.js';
import { describeIssues, grepBody, listBody, readBody, searchBody } from './schemas.js';

export interface ApiResponse {
  status: number;
  body: unknown;
}

/** The entry for `GET /api/collections` and the MCP `list_collections` tool. */
export function describeCollection(c: Collection) {
  const { id, name, publisher, description, licence, licence_url, homepage } = c.meta;
  const p = c.pedagogy;
  return {
    id,
    kind: c.meta.kind ?? 'documents',
    name,
    publisher,
    description,
    licence,
    licence_url,
    homepage,
    version: c.version,
    doc_count: c.docs.length,
    ...(p ? { entry_count: p.entries.size, claim_count: p.claims.size } : {}),
    ...(c.curriculum ? { outcome_count: c.curriculum.outcomes.length, benchmark_count: c.curriculum.benchmarks.length } : {}),
    updated_at: c.updatedAt,
  };
}

type DocOperation = 'search' | 'grep' | 'list' | 'read';
type PedagogyOperation = 'entries' | 'entry' | 'claims' | 'facets';
type CurriculumOperation = 'structure' | 'outcomes' | 'benchmarks';
export type Operation = DocOperation | PedagogyOperation | CurriculumOperation;

const DOC_OPERATIONS: Record<DocOperation, { body: z.ZodTypeAny; run: (c: Collection, args: never) => object }> = {
  search: { body: searchBody, run: search },
  grep: { body: grepBody, run: (c, args) => grep(c, args) },
  list: { body: listBody, run: list },
  read: { body: readBody, run: read },
};

/** On a pedagogy collection only (docs/plugins.md, "Pedagogy collections"). */
const PEDAGOGY_OPERATIONS: Record<PedagogyOperation, { body: z.ZodTypeAny; run: (p: PedagogyLibrary, args: never) => object }> = {
  entries: { body: entriesBody, run: entries },
  entry: { body: entryBody, run: entry },
  claims: { body: claimsBody, run: claims },
  facets: { body: facetsBody, run: (p) => facets(p) },
};

/** On a curriculum collection only. */
const CURRICULUM_OPERATIONS: Record<CurriculumOperation, { body: z.ZodTypeAny; run: (d: CurriculumData, args: never) => object }> = {
  structure: { body: structureBody, run: (d) => structure(d) },
  outcomes: { body: outcomesBody, run: outcomes },
  benchmarks: { body: benchmarksBody, run: benchmarks },
};

const OPERATIONS: Record<Operation, { body: z.ZodTypeAny; run: (c: Collection, args: never) => object }> = {
  ...DOC_OPERATIONS,
  ...(Object.fromEntries(
    Object.entries(CURRICULUM_OPERATIONS).map(([k, op]) => [
      k,
      {
        body: op.body,
        run: (c: Collection, args: never) => {
          if (!c.curriculum) throw new LibraryError(404, `${c.meta.id} is not a curriculum collection`);
          return op.run(c.curriculum, args);
        },
      },
    ]),
  ) as Record<CurriculumOperation, { body: z.ZodTypeAny; run: (c: Collection, args: never) => object }>),
  ...(Object.fromEntries(
    Object.entries(PEDAGOGY_OPERATIONS).map(([k, op]) => [
      k,
      {
        body: op.body,
        run: (c: Collection, args: never) => {
          if (!c.pedagogy) throw new LibraryError(404, `${c.meta.id} is not a pedagogy collection`);
          return op.run(c.pedagogy, args);
        },
      },
    ]),
  ) as Record<PedagogyOperation, { body: z.ZodTypeAny; run: (c: Collection, args: never) => object }>),
};

/** Runs one operation on a collection. Every answer, errors included, carries the version. */
export function runOperation(collection: Collection, op: Operation, input: unknown): ApiResponse {
  const parsed = OPERATIONS[op].body.safeParse(input ?? {});
  if (!parsed.success) return { status: 400, body: { error: describeIssues(parsed.error), version: collection.version } };
  try {
    const out = OPERATIONS[op].run(collection, parsed.data as never);
    return { status: 200, body: { version: collection.version, ...out } };
  } catch (e) {
    if (e instanceof LibraryError) return { status: e.status, body: { error: e.message, version: collection.version } };
    throw e;
  }
}

const isOperation = (s: string): s is Operation => Object.hasOwn(OPERATIONS, s);

/**
 * Routes a JSON API request. `body` is the parsed JSON, or `undefined` when there was none.
 * Returns null for paths outside `/api/`.
 */
export function handleApi(collections: ReadonlyMap<string, Collection>, method: string, path: string, body: unknown): ApiResponse | null {
  if (!path.startsWith('/api/')) return null;
  if (path === '/api/collections' || path === '/api/collections/') {
    if (method !== 'GET') return { status: 405, body: { error: 'use GET' } };
    return { status: 200, body: [...collections.values()].map(describeCollection) };
  }
  const m = /^\/api\/collections\/([^/]+)\/([a-z]+)$/.exec(path);
  if (!m) return { status: 404, body: { error: `no route for ${path}` } };
  const collection = collections.get(decodeURIComponent(m[1]!));
  if (!collection) return { status: 404, body: { error: `no collection called ${m[1]}` } };
  const op = m[2]!;
  if (!isOperation(op)) return { status: 404, body: { error: `no operation called ${op}`, version: collection.version } };
  if (method !== 'POST') return { status: 405, body: { error: 'use POST', version: collection.version } };
  return runOperation(collection, op, body);
}
