import { ARASAAC_PLUGIN_ID } from '@edw/shared';
import { askFirstResult, toolError, type AgentTool } from './types.js';

/**
 * Looks for a picture in ARASAAC's library of pictograms (pictures/arasaac.ts). The model puts one
 * in an image block as `![what it shows](arasaac:<id>)`; when the turn is applied the picture is
 * copied in as an asset (gateway/pictures.ts), and the teacher is offered the rest to swap in.
 */
export const searchPictures: AgentTool = {
  name: 'search_pictures',
  description:
    'Search ARASAAC, a free library of clear, simple pictograms made for teaching, for a picture of something. Always search here before drawing a picture yourself. Returns up to 4 pictures, best first, each with an id and the words it is filed under (you cannot see the pictures, so judge by the words). To use one, insert an image block (or replace one) with the content ![what it shows](arasaac:ID), for example ![an apple](arasaac:2462); use the one that fits best: the teacher is shown the others and can swap. If none of them shows what is wanted (the words are about something else), draw it as an SVG instead. Search for one thing at a time, in a word or two of English (a noun such as "apple" or "volcano", or an action such as "read").',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What the picture shows, in a word or two, e.g. "apple" or "brush teeth".' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  label: (args) => `Searching for a picture of “${String(args.query ?? '').slice(0, 40)}”`,
  async execute(args, ctx) {
    if (!ctx.pictures) return toolError('picture search is not available: draw the picture as an SVG instead');
    if (ctx.askFirst?.has(ARASAAC_PLUGIN_ID)) return askFirstResult(ARASAAC_PLUGIN_ID, 'ARASAAC pictures');
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return toolError('give a query');
    const options = await ctx.pictures.search(query);
    if (options.length === 0) return { output: JSON.stringify({ query, pictures: [], note: 'No pictures found. Try another word, or draw it as an SVG.' }), pictures: { query, options }, summary: ['Found no pictures'] };
    return {
      output: JSON.stringify({ query, pictures: options.map((o) => ({ id: `arasaac:${o.id}`, shows: o.label })) }, null, 1),
      pictures: { query, options },
      summary: [`Found ${options.length} picture${options.length === 1 ? '' : 's'}: ${options.map((o) => o.label).join(', ')}`],
    };
  },
};
