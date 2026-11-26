import { checkLayout, type Block } from '@edw/shared';
import { previewView } from './preview.js';
import { toolError, type AgentTool } from './types.js';

/** A doc's blocks in the order read_document numbers them, so the report's numbers match. */
const docBlocks = (blocks: readonly Block[], docId: string) =>
  blocks.filter((b) => b.doc_id === docId && (b.status === 'live' || b.status === 'proposed')).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));

/**
 * The layout of one of this thread's docs as Word would print it (shared/src/layout), with the
 * turn's edits so far applied: writing lines, table columns, spacing and page ends. The model
 * cannot see the page; this tells it what a teacher would see. It never writes.
 */
export const checkLayoutTool: AgentTool = {
  name: 'check_layout',
  description:
    'Check how a document will look printed or opened in Word (A4), with your suggested edits from this turn applied: writing lines that stop part way or wrap, table column widths against their content, empty paragraphs and uneven gaps, and where the pages end. Blocks are numbered as read_document numbers them. Use it after changing a worksheet\'s layout or when the teacher asks about spacing, lines, tables or pages, then fix what matters to the teacher.',
  parameters: {
    type: 'object',
    properties: {
      doc_id: { type: 'string', description: 'A document id, or the temp_id of a document you created this turn.' },
    },
    required: ['doc_id'],
    additionalProperties: false,
  },
  label: (args, ctx) => `Checking the layout of “${ctx.view.docs.find((d) => d.id === args.doc_id)?.name ?? 'a document'}”`,
  execute(args, ctx) {
    const view = previewView(ctx);
    const id = typeof args.doc_id === 'string' ? (view.docIds[args.doc_id] ?? args.doc_id) : '';
    const doc = view.docs.find((d) => d.id === id);
    if (!doc) return toolError(`no document with id ${String(args.doc_id)} in this chat`, { documents: ctx.view.docs.map((d) => ({ id: d.id, name: d.name })) });
    const result = checkLayout(docBlocks(view.blocks, doc.id), doc.style?.font);
    // Blocks inserted this turn have no id yet: name them as read_document does.
    let text = result.text;
    for (const [blockId, label] of view.labels) text = text.split(`[id=${blockId}]`).join(`[${label}]`);
    const found = result.findings.length;
    return { output: text, summary: [`${result.pages} page${result.pages === 1 ? '' : 's'}; ${found === 0 ? 'no layout problems found' : `${found} layout problem${found === 1 ? '' : 's'} found`}`] };
  },
};
