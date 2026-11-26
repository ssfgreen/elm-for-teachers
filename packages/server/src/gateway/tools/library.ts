/**
 * The library tools: one set for every library the teacher connected (plugins of kind `library`),
 * each call naming the library. A library is a folder of markdown files with frontmatter on a
 * library server (docs/plugins.md), so the tools work like a terminal over it: search, grep,
 * list and read. Every answer carries the collection's version, kept in the call's trace.
 */
import { LibraryError, type LibraryOp } from '../../plugins/library-client.js';
import { askFirstResult, toolError, type AgentTool, type LibraryOnOffer, type ToolContext, type ToolResult } from './types.js';

const library = { type: 'string', description: 'The library, by id from the Libraries list.' };
const filters = {
  type: 'object',
  description: 'Only documents whose frontmatter matches (any value of a list), e.g. {"level": "Second"} or {"code": "MNU 2-03a"}.',
  properties: { subject: { type: 'string' }, level: { type: 'string' }, type: { type: 'string' }, code: { type: 'string' } },
  additionalProperties: false,
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
/** Only the arguments given, so the library's own defaults apply to the rest. */
const given = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

function find(ctx: ToolContext, args: Record<string, unknown>): LibraryOnOffer | ToolResult {
  const libs = ctx.libraries ?? [];
  if (libs.length === 0) return toolError('no library is connected to this chat');
  const id = str(args.library);
  const lib = libs.find((l) => l.id === id);
  if (!lib) return toolError(`no library called ${id || '(none given)'}`, { libraries: libs.map((l) => ({ id: l.id, name: l.name })) });
  return lib;
}

async function run(ctx: ToolContext, args: Record<string, unknown>, op: LibraryOp, body: Record<string, unknown>): Promise<ToolResult> {
  const lib = find(ctx, args);
  if (!('client' in lib)) return lib;
  if (ctx.askFirst?.has(lib.id)) return askFirstResult(lib.id, lib.name);
  try {
    const out = await lib.client.call(lib.collection, op, given(body));
    return { output: JSON.stringify({ library: lib.id, ...out }, null, 1) };
  } catch (err) {
    // A wrong pattern, path or filter (400, 404): the model can fix it.
    if (err instanceof LibraryError && (err.status === 400 || err.status === 404)) return toolError(err.message);
    return toolError(`${lib.name} could not be searched just now (${err instanceof Error ? err.message : 'error'}); carry on without it and say so`);
  }
}

const nameOf = (ctx: ToolContext, args: Record<string, unknown>) => ctx.libraries?.find((l) => l.id === args.library)?.name ?? 'a library';
const short = (v: unknown) => String(v ?? '').slice(0, 40);

export const librarySearch: AgentTool = {
  name: 'library_search',
  description:
    'Search a library for words, a phrase or a code (such as "MNU 2-03a"). Returns the best-matching documents, best first, each with its path, title, source link and a snippet. Read one with library_read. Search for the words the document would use, not a question.',
  parameters: {
    type: 'object',
    properties: { library, query: { type: 'string', description: 'Words, a phrase or a code.' }, filters, limit: { type: 'integer', description: 'At most this many (default 8).' } },
    required: ['library', 'query'],
    additionalProperties: false,
  },
  label: (args, ctx) => `Searching ${nameOf(ctx, args)} for “${short(args.query)}”`,
  execute: (args, ctx) => (str(args.query) ? run(ctx, args, 'search', { query: str(args.query), filters: obj(args.filters), limit: int(args.limit) }) : toolError('give a query')),
};

export const libraryGrep: AgentTool = {
  name: 'library_grep',
  description:
    'Find every line in a library that matches a regular expression (JavaScript syntax, at most 200 characters), as grep does: each match with its file path and line number, and optionally lines around it. Use it for exact wording or codes, e.g. "^MNU 2-0" or "fraction(s)?".',
  parameters: {
    type: 'object',
    properties: {
      library,
      pattern: { type: 'string', description: 'A regular expression.' },
      ignore_case: { type: 'boolean' },
      path_glob: { type: 'string', description: 'Only files whose path matches, e.g. "numeracy*".' },
      filters,
      context: { type: 'integer', description: 'Lines to show before and after each match (0 to 3).' },
    },
    required: ['library', 'pattern'],
    additionalProperties: false,
  },
  label: (args, ctx) => `Searching ${nameOf(ctx, args)} for /${short(args.pattern)}/`,
  execute: (args, ctx) =>
    str(args.pattern)
      ? run(ctx, args, 'grep', { pattern: String(args.pattern), ignore_case: args.ignore_case === true ? true : undefined, path_glob: str(args.path_glob) || undefined, filters: obj(args.filters), context: int(args.context) })
      : toolError('give a pattern'),
};

export const libraryList: AgentTool = {
  name: 'library_list',
  description: "List a library's documents: path, title, length, subject, level and type, optionally only those matching a path pattern or filters.",
  parameters: { type: 'object', properties: { library, path_glob: { type: 'string' }, filters }, required: ['library'], additionalProperties: false },
  label: (args, ctx) => `Listing ${nameOf(ctx, args)}`,
  execute: (args, ctx) => run(ctx, args, 'list', { path_glob: str(args.path_glob) || undefined, filters: obj(args.filters) }),
};

export const libraryRead: AgentTool = {
  name: 'library_read',
  description: 'Read a document from a library by its path, a range of lines at a time (up to 200), with its title, source link and licence. Cite the source when you use it.',
  parameters: {
    type: 'object',
    properties: { library, path: { type: 'string' }, from_line: { type: 'integer', description: 'First line (default 1).' }, max_lines: { type: 'integer' } },
    required: ['library', 'path'],
    additionalProperties: false,
  },
  label: (args, ctx) => `Reading “${short(args.path)}” in ${nameOf(ctx, args)}`,
  execute: (args, ctx) => (str(args.path) ? run(ctx, args, 'read', { path: str(args.path), from_line: int(args.from_line), max_lines: int(args.max_lines) }) : toolError('give a path')),
};

/** Offered on top of a config's tools when any library is on offer. */
export const LIBRARY_TOOLS: readonly AgentTool[] = [librarySearch, libraryGrep, libraryList, libraryRead];
