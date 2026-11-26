import { badRequest, notFound } from './errors.js';
import type { Collection } from './types.js';

export const READ_DEFAULT_LINES = 200;
export const READ_MAX_LINES = 500;

export interface ReadArgs {
  path: string;
  from_line?: number;
  max_lines?: number;
}

export interface ReadResult {
  path: string;
  title: string;
  source_url: string | null;
  licence: string | null;
  from_line: number;
  to_line: number;
  total_lines: number;
  text: string;
}

/** A range of a document's lines, counted from 1 after the frontmatter. */
export function read(collection: Collection, args: ReadArgs): ReadResult {
  const doc = collection.docs.find((d) => d.path === args.path);
  if (!doc) throw notFound(`no document at ${args.path}`);
  const from = args.from_line ?? 1;
  const max = args.max_lines ?? READ_DEFAULT_LINES;
  if (!Number.isInteger(from) || from < 1) throw badRequest('from_line must be a whole number from 1');
  if (!Number.isInteger(max) || max < 1 || max > READ_MAX_LINES) throw badRequest(`max_lines must be from 1 to ${READ_MAX_LINES}`);
  const total = doc.lines.length;
  if (from > Math.max(total, 1)) throw badRequest(`from_line ${from} is past the end (${total} lines)`);
  const slice = doc.lines.slice(from - 1, from - 1 + max);
  const fm = doc.frontmatter;
  return {
    path: doc.path,
    title: doc.title,
    source_url: typeof fm.source_url === 'string' ? fm.source_url : null,
    licence: typeof fm.licence === 'string' ? fm.licence : null,
    from_line: from,
    to_line: from - 1 + slice.length,
    total_lines: total,
    text: slice.join('\n'),
  };
}
