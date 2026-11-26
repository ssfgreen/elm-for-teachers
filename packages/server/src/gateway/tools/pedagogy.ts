/**
 * The pedagogy tools, for a class or year group chat when the pedagogy library is on offer:
 * find entries by the facets a request is shaped by (type, lesson purpose, barrier, a hint such
 * as dyslexia, words), and read one in full. Every claim they return joins the turn's citable
 * set (`ctx.pedagogy.citable`); the reply may cite only those and the ones the turn began with.
 * They read the library only.
 */
import { LibraryError } from '../../plugins/library-client.js';
import { entryBlock, focusFacets, type EntrySummary } from '../pedagogy-message.js';
import { toolError, type AgentTool, type ToolContext, type ToolResult } from './types.js';

const TYPES = ['principle', 'activity_type', 'signature_pedagogy', 'adaptation', 'format_rule', 'exemplar', 'curriculum_ref', 'caution'];
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : typeof v === 'string' && v.trim() ? [v.trim()] : []);
const short = (v: unknown) => String(v ?? '').slice(0, 40);

async function call(ctx: ToolContext, op: 'entries' | 'entry', body: Record<string, unknown>) {
  const p = ctx.pedagogy;
  if (!p) return toolError('no pedagogy library is on offer in this chat');
  try {
    return await p.source.client.call(p.source.collection, op, body);
  } catch (err) {
    if (err instanceof LibraryError && (err.status === 400 || err.status === 404)) return toolError(err.message);
    return toolError('the pedagogy library could not be reached just now; carry on without it and say so');
  }
}

const isError = (x: unknown): x is ToolResult => !!x && typeof x === 'object' && 'isError' in x;

export const pedagogyFind: AgentTool = {
  name: 'pedagogy_find',
  description:
    "Find entries in the pedagogy library by what the request needs: entry types, lesson purpose, a barrier (decoding, working_memory, attention, figurative_language…), a hint such as dyslexia or autism, and words that must all appear. The class's stage, level and subject are applied unless you give your own. Each entry comes with its claims to cite as [[clm-…]].",
  parameters: {
    type: 'object',
    properties: {
      types: { type: 'array', items: { type: 'string', enum: TYPES } },
      lesson_purpose: { type: 'array', items: { type: 'string', enum: ['introduce', 'guided_practice', 'independent_practice', 'apply_transfer', 'assess_feedback'] } },
      barrier: { type: 'array', items: { type: 'string' } },
      often_relevant_to: { type: 'array', items: { type: 'string' }, description: 'A hint such as "dyslexia" or "EAL": where to look, never a rule.' },
      artefact_type: { type: 'array', items: { type: 'string', enum: ['slides', 'worksheet', 'form', 'lesson_plan', 'interaction'] } },
      stage: { type: 'array', items: { type: 'string' }, description: 'p1 to p7, s1 to s6 (default: the class).' },
      subject: { type: 'array', items: { type: 'string' }, description: 'Default: the class.' },
      text: { type: 'string', description: 'Words that must all appear.' },
    },
    additionalProperties: false,
  },
  label: (args) => `Looking in the pedagogy library${args.text ? ` for “${short(args.text)}”` : ''}`,
  async execute(args, ctx) {
    const base = ctx.pedagogy ? focusFacets(ctx.pedagogy.focus) : {};
    const facets: Record<string, string[]> = { ...base };
    for (const k of ['lesson_purpose', 'barrier', 'often_relevant_to', 'artefact_type', 'stage', 'subject'] as const) if (list(args[k]).length) facets[k] = list(args[k]);
    const types = list(args.types).filter((t) => TYPES.includes(t));
    const out = await call(ctx, 'entries', { facets, ...(types.length ? { types } : {}), ...(typeof args.text === 'string' && args.text.trim() ? { text: args.text.trim() } : {}), limit: 15 });
    if (isError(out)) return out;
    const entries = (out.entries as EntrySummary[] | undefined) ?? [];
    for (const e of entries) for (const c of e.claims) ctx.pedagogy!.citable.add(c.id);
    if (!entries.length) return { output: 'No entries match. Try fewer filters, or other words.' };
    const more = out.truncated ? `\n\n(${String(out.total)} match; the first ${entries.length} are shown: narrow the search for others.)` : '';
    return { output: `${entries.map(entryBlock).join('\n')}${more}` };
  },
};

export const pedagogyRead: AgentTool = {
  name: 'pedagogy_read',
  description: 'Read one pedagogy library entry in full by its id: how to do it, its artefact recipes, risks, its claims with their sources, and the entries linked to it.',
  parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
  label: (args) => `Reading ${short(args.id)} in the pedagogy library`,
  async execute(args, ctx) {
    if (typeof args.id !== 'string' || !args.id.trim()) return toolError('give an entry id');
    const out = await call(ctx, 'entry', { id: args.id.trim() });
    if (isError(out)) return out;
    const e = out.entry as Record<string, unknown> & { claims: { id: string; text: string; support_type: string; verification: string; passages: { locator: string; source: { title: string; publisher: string; year: number | null } }[] }[] };
    for (const c of e.claims) ctx.pedagogy!.citable.add(c.id);
    // Passages and sources are named, not quoted: the claims are what is cited.
    const claims = e.claims.map((c) => ({ id: c.id, text: c.text, support_type: c.support_type, verification: c.verification, sources: c.passages.map((p) => `${p.source.title} (${p.source.publisher}${p.source.year ? `, ${p.source.year}` : ''}), ${p.locator}`) }));
    const { id, type, title, summary, body, status, facets, evidence, prerequisites, risks, artefact_recipes, render_settings } = e;
    return { output: JSON.stringify({ id, type, title, status, summary, body, facets, evidence, prerequisites, risks, artefact_recipes, render_settings, claims, related: out.related, linked_from: out.linked_from }, null, 1) };
  },
};

export const PEDAGOGY_TOOLS: readonly AgentTool[] = [pedagogyFind, pedagogyRead];
