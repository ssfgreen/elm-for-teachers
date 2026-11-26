import { copyTempId, DocBackground, DocFont, waitingIn, type Operation } from '@edw/shared';
import { validateOperations } from '../validate.js';
import { describeEdits } from './describe-edits.js';
import { toolError, type AgentTool } from './types.js';

/**
 * The fonts the model may suggest: the toolbar's, less OpenDyslexic, which the teacher picks
 * themselves (the prompt does not list it). The others (Century Gothic, Verdana and Comic Sans, a past
 * study condition) are still read, for older docs.
 */
const NOT_OFFERED = new Set<DocFont>(['century_gothic', 'verdana', 'comic_sans', 'open_dyslexic']);
const OFFERED_FONTS: DocFont[] = DocFont.options.filter((f) => !NOT_OFFERED.has(f));

const OPERATION_SCHEMA = {
  type: 'object',
  properties: {
    op: { type: 'string', enum: ['insert', 'replace', 'delete', 'move', 'create_doc', 'set_style'] },
    id: { type: 'string', description: 'replace, delete, move: the block id.' },
    doc: { type: 'string', description: "insert, set_style: a doc id or an earlier create_doc's temp_id; omit for the open doc." },
    after: { type: 'string', description: 'insert, move: a block id, an earlier insert\'s temp_id, or "start".' },
    type: { type: 'string', description: 'insert: the block type.' },
    content: { type: 'string', description: 'insert, replace: the block text.' },
    temp_id: { type: 'string', description: 'insert, create_doc: a short name later operations can refer to.' },
    name: { type: 'string', description: "create_doc: the new document's name." },
    font: { type: 'string', enum: OFFERED_FONTS, description: "set_style: the document's font." },
    background: { type: 'string', enum: [...DocBackground.options], description: "set_style: the document's page colour." },
    copy_of: { type: 'string', description: "create_doc: the id of a document in this chat to copy, when the teacher asks for a copy. Its blocks come in straight away, not as suggestions; the result lists each copy's id for later operations." },
    from: { type: 'string', description: 'insert: the id of the block this new block is a version of (for example a definition moved into a block of its own).' },
    revises_suggestion: { type: 'boolean', description: 'replace, delete, move, in Editing mode only: true when the teacher asked for this change to your earlier suggestion on the block.' },
  },
  required: ['op'],
};

const COPY_CHOICE_NOTE =
  'That document has suggestions the teacher has not accepted or rejected, so no copy was made: the teacher chooses what the copy is built from. Say so in your reply, and how many suggestions are waiting; the teacher is shown the choices under it. Your other changes went ahead.';

/** Each block the call's copies are made of, and the name later operations use for its copy. */
function copiesMade(operations: readonly Operation[], sources: ReadonlyMap<string, readonly string[] | null> | undefined): { from: string; id: string }[] {
  return operations.flatMap((op) => (op.op === 'create_doc' && op.copy_of ? (sources?.get(op.copy_of) ?? []).map((from) => ({ from, id: copyTempId(op.temp_id, from) })) : []));
}

/**
 * Proposals: operations in the shared `Operation` shape, checked at once against the thread's
 * docs together with the turn's earlier edits (so their temp_ids can be used). The model is
 * told what was accepted and why anything was dropped.
 */
export const editDocument: AgentTool = {
  name: 'edit_document',
  description:
    'Propose changes to documents in this chat. The teacher sees them as suggestions to accept or reject, except in a document made with create_doc, which goes straight in. Operations are applied in order; the result says which were accepted and why any were dropped, so you can correct them with another call. To copy a document, use create_doc with copy_of, only when the teacher asks for a copy.',
  parameters: {
    type: 'object',
    properties: { operations: { type: 'array', items: OPERATION_SCHEMA } },
    required: ['operations'],
    additionalProperties: false,
  },
  label: () => 'Writing in the document',
  execute(args, ctx) {
    if (!Array.isArray(args.operations)) return toolError('operations must be an array');
    const all = validateOperations([...ctx.accepted, ...args.operations], ctx.view.ctx);
    const operations = all.operations.slice(ctx.accepted.length);
    const dropped = all.dropped.map((d) => ({ ...d, index: d.index - ctx.accepted.length })).filter((d) => d.index >= 0);
    const copies = copiesMade(operations, ctx.view.ctx.copies);
    const waiting = [...new Set(dropped.filter((d) => d.reason === 'needs_copy_choice').map((d) => String((d.op as { copy_of?: unknown }).copy_of)))].map((doc) => ({ doc, waiting: waitingIn(ctx.view.blocks, doc) }));
    return {
      output: JSON.stringify({
        accepted: operations.length,
        dropped: dropped.map((d) => ({ index: d.index, reason: d.reason })),
        ...(copies.length ? { copies } : {}),
        ...(waiting.length ? { needs_copy_choice: waiting, note: COPY_CHOICE_NOTE } : {}),
      }),
      operations,
      dropped,
      ...(waiting.length ? { copyRequests: waiting.map((w) => ({ doc_id: w.doc, waiting: w.waiting })) } : {}),
      summary: describeEdits(args.operations, dropped, ctx.view.blocks, ctx.view.docs),
    };
  },
};
