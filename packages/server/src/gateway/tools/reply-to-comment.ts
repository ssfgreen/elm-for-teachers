import { COMMENT_MAX } from '@edw/shared';
import { toolError, type AgentTool } from './types.js';

/** A reply in an existing comment thread, by the assistant. */
export const replyToComment: AgentTool = {
  name: 'reply_to_comment',
  description: "Reply in one of the documents' comment threads (comment ids are listed with the document's comments).",
  parameters: {
    type: 'object',
    properties: { comment_id: { type: 'string' }, body: { type: 'string', description: 'The reply.' } },
    required: ['comment_id', 'body'],
    additionalProperties: false,
  },
  label: () => 'Replying to a comment',
  execute(args, ctx) {
    const c = ctx.view.comments.find((x) => x.id === args.comment_id);
    if (!c) return toolError(`no comment with id ${String(args.comment_id)}`);
    const rootId = c.root_id ?? c.id;
    if (rootId === ctx.commentThread) return toolError('this message is already your reply in that thread: write the reply as your message instead');
    const body = typeof args.body === 'string' ? args.body.trim() : '';
    if (!body || body.length > COMMENT_MAX) return toolError(`body must be 1 to ${COMMENT_MAX} characters`);
    return { output: JSON.stringify({ replied: true }), comments: [{ doc_id: c.doc_id, block_id: c.block_id, root_id: rootId, quote: null, body }] };
  },
};
