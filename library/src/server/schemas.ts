import { z } from 'zod';
import { GREP_MAX_MATCHES, GREP_MAX_PATTERN } from '../core/grep.js';
import { READ_MAX_LINES } from '../core/read.js';
import { SEARCH_MAX_LIMIT } from '../core/search.js';

/** Request bodies, shared by the JSON API and the MCP tools so both check the same things. */
const oneOrMany = z.union([z.string(), z.array(z.string())]);

export const filtersSchema = z
  .object({ subject: oneOrMany.optional(), level: oneOrMany.optional(), type: oneOrMany.optional(), code: oneOrMany.optional() })
  .strict()
  .describe('Frontmatter filters, case-insensitive; a list matches any of its values');

export const searchShape = {
  query: z.string().min(1).max(500).describe('Words or curriculum codes, such as "fractions" or "MNU 2-07a"'),
  filters: filtersSchema.optional(),
  limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).optional().describe('Results to return, default 10'),
};

export const grepShape = {
  pattern: z.string().min(1).max(GREP_MAX_PATTERN).describe('JavaScript regular expression, matched line by line'),
  ignore_case: z.boolean().optional(),
  path_glob: z.string().max(200).optional().describe('Only paths matching this glob, such as "*.md"'),
  filters: filtersSchema.optional(),
  context: z.number().int().min(0).max(3).optional().describe('Lines of context before and after, 0 to 3'),
  max_matches: z.number().int().min(1).max(GREP_MAX_MATCHES).optional().describe('Default 50'),
};

export const listShape = {
  path_glob: z.string().max(200).optional(),
  filters: filtersSchema.optional(),
};

export const readShape = {
  path: z.string().min(1).max(500).describe('A path from list, search or grep'),
  from_line: z.number().int().min(1).optional().describe('First line, from 1'),
  max_lines: z.number().int().min(1).max(READ_MAX_LINES).optional().describe('Default 200'),
};

export const searchBody = z.object(searchShape).strict();
export const grepBody = z.object(grepShape).strict();
export const listBody = z.object(listShape).strict();
export const readBody = z.object(readShape).strict();

/** A zod error as one readable line. */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}
