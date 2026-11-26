import { COMMENT_MAX } from '@edw/shared';
import { toolError, type AgentTool } from './types.js';

/**
 * A new comment thread on a block (optionally about some of its text), by the assistant:
 * feedback, a question or a suggestion the teacher decides on, without changing the text.
 */
export const addComment: AgentTool = {
  name: 'add_comment',
  description:
    'Leave a comment on a block of a document, as a reviewer would: feedback, a question for the teacher, or a suggestion they can decide on, without changing the text. Quote the words it is about exactly as they are written, or leave quote out for the whole block.',
  parameters: {
    type: 'object',
    properties: {
      block_id: { type: 'string', description: 'An existing block (not one inserted this turn).' },
      quote: { type: 'string', description: 'The exact words in the block the comment is about.' },
      body: { type: 'string', description: 'The comment.' },
    },
    required: ['block_id', 'body'],
    additionalProperties: false,
  },
  label: () => 'Adding a comment',
  execute(args, ctx) {
    const block = ctx.view.blocks.find((b) => b.id === args.block_id && b.status === 'live');
    if (!block) return toolError(`no block with id ${String(args.block_id)} in this chat's documents`);
    const body = typeof args.body === 'string' ? args.body.trim() : '';
    if (!body || body.length > COMMENT_MAX) return toolError(`body must be 1 to ${COMMENT_MAX} characters`);
    const quote = typeof args.quote === 'string' && args.quote.trim() ? args.quote.trim() : null;
    if (quote && !block.content.includes(quote)) return toolError('quote is not in that block: copy the words exactly as they are written, or leave quote out');
    return { output: JSON.stringify({ added: true }), comments: [{ doc_id: block.doc_id, block_id: block.id, root_id: null, quote, body }] };
  },
};
