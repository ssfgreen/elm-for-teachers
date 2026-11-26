/** Request bodies for a curriculum collection, shared by the JSON API and MCP. */
import { z } from 'zod';
import { OUTCOMES_MAX } from './query.js';

const s = z.string().min(1).max(120);
export const structureBody = z.object({}).strict();
export const outcomesShape = {
  level: s.optional().describe('early, first, second, third or fourth'),
  stage: s.optional().describe('p1 to p7, s1 to s3'),
  area: s.optional(),
  organiser: s.optional(),
  code: s.optional().describe('A code or its start, such as "LIT 2-1"'),
  text: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(OUTCOMES_MAX).optional(),
};
export const outcomesBody = z.object(outcomesShape).strict();
export const benchmarksShape = { codes: z.array(s).max(80).optional(), area: s.optional(), level: s.optional() };
export const benchmarksBody = z.object(benchmarksShape).strict();
