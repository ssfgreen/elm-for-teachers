/** The docs one thread's turn works on, as the model sees them. */
import { copySource, docsOf, type Block, type CanvasState, type CopyChoice, type Doc } from '@edw/shared';
import type { ValidationContext } from './validate.js';

/** The docs the model sees (one thread's), and the context its operations are validated against. */
export interface WorkingView {
  docs: Doc[];
  blocks: Block[];
  ctx: ValidationContext;
}

/** `copyChoice`: the teacher's choice for a copy of one doc (ChatBody.copy_choice). */
export function workingView(state: CanvasState, threadId: string, openDocId: string, copyChoice?: { doc_id: string; choice: CopyChoice }): WorkingView {
  const docs = docsOf(state, threadId);
  const docIds = new Set(docs.map((d) => d.id));
  const blocks = [...state.blocks.values()].filter((b) => docIds.has(b.doc_id));
  // What the model may name: the doc's live blocks and its own suggestions not yet accepted.
  const shown = blocks.filter((b) => b.status === 'live' || b.status === 'proposed');
  return {
    docs,
    blocks,
    ctx: {
      liveBlockIds: new Set(shown.map((b) => b.id)),
      blockDoc: new Map(shown.map((b) => [b.id, b.doc_id])),
      docIds,
      openDocId,
      imageBlockIds: new Set(shown.filter((b) => b.type === 'image').map((b) => b.id)),
      blockTypes: new Map(shown.map((b) => [b.id, b.type])),
      copies: new Map(docs.map((d) => [d.id, copySource(state, d.id, copyChoice?.doc_id === d.id ? copyChoice.choice : undefined)?.map((b) => b.id) ?? null])),
    },
  };
}
