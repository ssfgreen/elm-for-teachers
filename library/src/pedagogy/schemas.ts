/** Request bodies for a pedagogy collection, shared by the JSON API and MCP. */
import { z } from 'zod';
import { CLAIMS_MAX, ENTRIES_MAX_LIMIT } from './query.js';
import { ENTRY_TYPES, LIST_FACETS } from './types.js';

const values = z.array(z.string().min(1).max(80)).max(20);

export const entriesShape = {
  types: z.array(z.enum(ENTRY_TYPES)).max(8).optional().describe('Entry types, any of them'),
  ids: z.array(z.string().min(1).max(120)).max(ENTRIES_MAX_LIMIT).optional().describe('Only these entries'),
  facets: z
    .object(Object.fromEntries(LIST_FACETS.map((k) => [k, values.optional()])) as Record<(typeof LIST_FACETS)[number], z.ZodOptional<typeof values>>)
    .strict()
    .optional()
    .describe('Facet values, any of each list; stage, level, area and subject also match entries that apply everywhere'),
  aligns_to: z.array(z.string().min(1).max(120)).max(40).optional().describe('Entries that align to these curriculum_ref ids'),
  text: z.string().max(200).optional().describe('Words that must all appear in the entry or its claims'),
  recommended_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(ENTRIES_MAX_LIMIT).optional(),
};
export const entryShape = { id: z.string().min(1).max(120) };
export const claimsShape = { ids: z.array(z.string().min(1).max(120)).min(1).max(CLAIMS_MAX) };

export const entriesBody = z.object(entriesShape).strict();
export const entryBody = z.object(entryShape).strict();
export const claimsBody = z.object(claimsShape).strict();
export const facetsBody = z.object({}).strict();
