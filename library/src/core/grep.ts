import { badRequest } from './errors.js';
import { selectDocs } from './list.js';
import type { Collection, Filters } from './types.js';

export const GREP_MAX_PATTERN = 200;
export const GREP_DEFAULT_MATCHES = 50;
export const GREP_MAX_MATCHES = 200;
/** Lines longer than this are matched and returned only up to it. */
const LINE_CAP = 1000;
/** All matched text together stops at this many characters. */
const OUTPUT_CAP = 60_000;
const TIME_BUDGET_MS = 500;

export interface GrepArgs {
  pattern: string;
  ignore_case?: boolean;
  path_glob?: string;
  filters?: Filters;
  context?: number;
  max_matches?: number;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
  before?: string[];
  after?: string[];
}

/**
 * A group that repeats something already repeated, such as `(a+)+` or `(\w*)*`: the classic
 * shape of catastrophic backtracking. Refused outright; the time budget catches the rest.
 */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,?\d*\})/;

export function compilePattern(pattern: string, ignoreCase: boolean): RegExp {
  if (pattern.length === 0) throw badRequest('pattern is empty');
  if (pattern.length > GREP_MAX_PATTERN) throw badRequest(`pattern is over ${GREP_MAX_PATTERN} characters`);
  if (NESTED_QUANTIFIER.test(pattern)) throw badRequest('pattern repeats a repeated group, which can run for ever: simplify it');
  try {
    return new RegExp(pattern, ignoreCase ? 'i' : '');
  } catch (e) {
    throw badRequest(`pattern is not a valid regular expression: ${(e as Error).message}`);
  }
}

const cap = (s: string) => (s.length > LINE_CAP ? `${s.slice(0, LINE_CAP)}…` : s);

/** Regex search line by line, with a cap on matches, output size and time. */
export function grep(collection: Collection, args: GrepArgs, now: () => number = Date.now): { matches: GrepMatch[]; truncated: boolean } {
  const re = compilePattern(args.pattern, args.ignore_case ?? false);
  const context = args.context ?? 0;
  if (!Number.isInteger(context) || context < 0 || context > 3) throw badRequest('context must be from 0 to 3');
  const max = args.max_matches ?? GREP_DEFAULT_MATCHES;
  if (!Number.isInteger(max) || max < 1 || max > GREP_MAX_MATCHES) throw badRequest(`max_matches must be from 1 to ${GREP_MAX_MATCHES}`);

  const started = now();
  const matches: GrepMatch[] = [];
  let size = 0;
  for (const doc of selectDocs(collection, args)) {
    for (let i = 0; i < doc.lines.length; i++) {
      if (now() - started > TIME_BUDGET_MS) return { matches, truncated: true };
      const line = cap(doc.lines[i]!);
      if (!re.test(line)) continue;
      if (matches.length >= max || size + line.length > OUTPUT_CAP) return { matches, truncated: true };
      const match: GrepMatch = { path: doc.path, line: i + 1, text: line };
      if (context > 0) {
        match.before = doc.lines.slice(Math.max(0, i - context), i).map(cap);
        match.after = doc.lines.slice(i + 1, i + 1 + context).map(cap);
        size += [...match.before, ...match.after].reduce((n, l) => n + l.length, 0);
      }
      size += line.length;
      matches.push(match);
    }
  }
  return { matches, truncated: false };
}
