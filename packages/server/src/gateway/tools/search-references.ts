import { toolError, type AgentTool } from './types.js';

/** Keyword search over the project's reference files: the best pages, with a snippet each. */
export const searchReferences: AgentTool = {
  name: 'search_references',
  description:
    "Search this project's reference files for words or a phrase. Returns the best-matching pages (file, page and a snippet), best first; read a page in full with read_reference. Search for the words the passage would use, not a question.",
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Words or a short phrase to look for, e.g. "balanced forces".' },
      file_ids: { type: 'array', items: { type: 'string' }, description: 'Only these files (default: all of them).' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  label: (args) => `Searching the reference files for “${String(args.query ?? '').slice(0, 40)}”`,
  async execute(args, ctx) {
    const refs = ctx.references;
    if (!refs || refs.files.length === 0) return toolError('this chat has no reference files');
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return toolError('give a query');
    const ids = Array.isArray(args.file_ids) ? args.file_ids.filter((x): x is string => typeof x === 'string') : undefined;
    const unknown = (ids ?? []).filter((id) => !refs.files.some((f) => f.id === id));
    if (unknown.length) return toolError(`no reference file with id ${unknown.join(', ')}`, { files: refs.files.map((f) => ({ id: f.id, name: f.name })) });
    const hits = await refs.search(query, ids);
    if (hits.length === 0) return { output: JSON.stringify({ query, results: [], note: 'Nothing matched. Try other words, or read the file.' }) };
    return { output: JSON.stringify({ query, results: hits.map((h) => ({ file_id: h.file_id, file: h.name, page: h.page, snippet: h.snippet })) }, null, 1) };
  },
};
