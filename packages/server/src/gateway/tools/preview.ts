/**
 * The thread's docs as they would be if the turn's edits so far were accepted, so a tool that
 * reads a doc shows the model its own changes (without this, re-reading after a move showed the
 * old order, and the model kept redoing it). Blocks inserted this turn have no id yet: they are
 * labelled `new`, with their temp_id when they have one, which later operations can use; a copied
 * block (`copy_of`) by its name, `<temp_id>/<source id>`.
 */
import { acceptAll, applyOperations, copyTempId, createState, type Block, type Doc } from '@edw/shared';
import type { ToolContext } from './types.js';

const PREVIEW_TS = '1970-01-01T00:00:00.000Z';
const previewId = (n: number) => `01PREV1EW${String(n).padStart(17, '0')}`;

export interface PreviewView {
  docs: Doc[];
  blocks: Block[];
  /** Preview block id -> its label in place of an id (`new` or `new, temp_id=...`). */
  labels: Map<string, string>;
  /** create_doc temp_id -> the preview doc's id. */
  docIds: Record<string, string>;
}

export function previewView(ctx: ToolContext): PreviewView {
  if (ctx.accepted.length === 0) return { docs: ctx.view.docs, blocks: ctx.view.blocks, labels: new Map(), docIds: {} };
  let n = 0;
  const pc = { now: () => PREVIEW_TS, newId: () => previewId((n += 1)) };
  const state = createState('preview', ctx.view.blocks.map((b) => ({ ...b })), ctx.view.docs.map((d) => ({ ...d })));
  const threadId = ctx.view.docs.find((d) => d.id === ctx.openDocId)?.thread_id ?? ctx.view.docs[0]?.thread_id ?? '';
  const applied = applyOperations(state, pc, { operations: [...ctx.accepted], turn_id: 'preview', cause_event_id: 'preview', thread_id: threadId, default_doc_id: ctx.openDocId, ...(ctx.copyChoice ? { copy_choices: { [ctx.copyChoice.doc_id]: ctx.copyChoice.choice } } : {}) });
  for (const d of state.docs.values()) acceptAll(state, pc, { doc_id: d.id, cause_event_id: 'preview' });
  const labels = new Map<string, string>();
  for (const p of applied.produced) {
    if (p.op.op === 'insert' && p.block_id) labels.set(p.block_id, p.op.temp_id ? `new, temp_id=${p.op.temp_id}` : 'new');
  }
  const tempOf = new Map(Object.entries(applied.doc_ids).map(([temp, id]) => [id, temp]));
  for (const c of applied.copies) labels.set(c.block_id, `new, temp_id=${copyTempId(tempOf.get(c.doc_id)!, c.from)}`);
  return { docs: [...state.docs.values()], blocks: [...state.blocks.values()], labels, docIds: applied.doc_ids };
}
