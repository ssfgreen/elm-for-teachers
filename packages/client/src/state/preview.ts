/**
 * Live preview of a reply that is still streaming: the operations received so far
 * (including the one being written, with its content so far) applied to a copy of the
 * canvas with the shared model, so the document shows the suggestions as they are written.
 * Nothing here is saved; the server applies and logs the real operations when the turn ends.
 */
import { Operation, applyOperations, createState, parsePartialArray, splitStreamingReply, type Block } from '@edw/shared';
import type { CanvasSnapshot, PublicBlock } from '../editor/types.js';

/** Ids for preview blocks: stable across updates, so the editor keeps the same nodes. */
const previewId = (n: number) => `01PREV1EW${String(n).padStart(17, '0')}`;
export const isPreviewId = (id: string) => id.startsWith('01PREV1EW');

const PREVIEW_TS = '1970-01-01T00:00:00.000Z';

function apply(snap: CanvasSnapshot, ops: Operation[], threadId: string, docId: string): CanvasSnapshot {
  let n = 0;
  const ctx = { now: () => PREVIEW_TS, newId: () => previewId((n += 1)) };
  const blocks = snap.blocks.map((b): Block => ({ ...b, origin: 'model', origin_turn: null }));
  // Copies: the model writes to the docs it is given (a set_style puts `proposed_style` on one),
  // and these are the screen's own; a suggestion must not show before the server has it.
  const state = createState('preview', blocks, snap.docs.map((d) => ({ ...d })));
  applyOperations(state, ctx, { operations: ops, turn_id: 'preview', cause_event_id: 'preview', thread_id: threadId, default_doc_id: docId });
  return {
    blocks: [...state.blocks.values()].map((b): PublicBlock => {
      const copy: Partial<Block> = { ...b };
      delete copy.origin;
      delete copy.origin_turn;
      return copy as PublicBlock;
    }),
    docs: snap.docs,
  };
}

/**
 * The snapshot with the streamed operations applied, or null when there are none yet.
 * An operation that does not parse or does not apply (for example an `after` naming a
 * block that is not there) is left out of the preview, as validation would drop it.
 */
export function previewReply(snap: CanvasSnapshot, raw: string, threadId: string, docId: string): CanvasSnapshot | null {
  const { opsText } = splitStreamingReply(raw);
  if (opsText === null) return null;
  const good: Operation[] = [];
  for (const item of parsePartialArray(opsText).items) {
    const op = Operation.safeParse(item);
    if (!op.success) continue;
    try {
      apply(snap, [...good, op.data], threadId, docId);
      good.push(op.data);
    } catch {
      /* left out, as validation would */
    }
  }
  return good.length ? apply(snap, good, threadId, docId) : null;
}
