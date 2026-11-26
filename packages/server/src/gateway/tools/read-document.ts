import { serializeCanvas } from '../prompt.js';
import { commentsText } from './comments-text.js';
import { previewView } from './preview.js';
import { pageBlocks, pageNote } from './truncate.js';
import { toolError, type AgentTool } from './types.js';

const NOTE_ROOM = 200;

/**
 * One of this thread's docs, as the open one is shown: numbered blocks with ids and types,
 * with the turn's own edits so far applied (a doc created this turn can be read by its temp_id).
 * A long doc comes in pages of whole blocks (config `agent.max_read_chars`): `from_block` reads on.
 */
export const readDocument: AgentTool = {
  name: 'read_document',
  description:
    "Read one of this chat's documents as numbered blocks with ids and types, with your suggested edits from this turn already applied. Blocks you inserted this turn show as [new] (with their temp_id) instead of an id.",
  parameters: {
    type: 'object',
    properties: {
      doc_id: { type: 'string', description: 'A document id, or the temp_id of a document you created this turn.' },
      from_block: { type: 'integer', minimum: 1, description: 'For a long document: the block number to start from (default 1). The output says when there is more.' },
    },
    required: ['doc_id'],
    additionalProperties: false,
  },
  label: (args, ctx) => `Reading “${ctx.view.docs.find((d) => d.id === args.doc_id)?.name ?? 'a document'}”`,
  execute(args, ctx) {
    const view = previewView(ctx);
    const id = typeof args.doc_id === 'string' ? (view.docIds[args.doc_id] ?? args.doc_id) : '';
    const doc = view.docs.find((d) => d.id === id);
    if (!doc) return toolError(`no document with id ${String(args.doc_id)} in this chat`, { documents: ctx.view.docs.map((d) => ({ id: d.id, name: d.name })) });
    let text = serializeCanvas(view.blocks, [doc], ctx.openDocId);
    for (const [blockId, label] of view.labels) text = text.split(`[id=${blockId}]`).join(`[${label}]`);
    for (const [tempId, docId] of Object.entries(view.docIds)) text = text.split(`(id: ${docId}`).join(`(new, temp_id: ${tempId}`);
    const from = typeof args.from_block === 'number' ? args.from_block : 1;
    // The doc's comment threads (as they were when the turn began), with its first page; the
    // page leaves room for them and for the note saying how to read on, which comes last.
    const notes = from <= 1 ? commentsText(ctx.view.comments, doc.id) : '';
    const page = pageBlocks(text, from, Math.max(1000, ctx.maxReadChars - notes.length - NOTE_ROOM));
    if (from > 1 && from > page.total) return toolError(`the document has ${page.total} block(s); from_block ${from} is past the end`);
    return { output: [page.text, notes, pageNote(page, String(args.doc_id))].filter(Boolean).join('\n\n') };
  },
};
