/**
 * The frozen copy of a doc that a reading keeps (#187): its live blocks, in order, as they are
 * now. A block the assistant proposed is left out, and so is a change waiting on a live block
 * (the block is copied as it stands). A picture stays as its `asset:<id>` source. Pure.
 */
import { liveBlocks, type CanvasState, type ReadingBlock } from '@edw/shared';
import { hashJson } from '@edw/shared/node';

export interface FrozenCopy {
  blocks: ReadingBlock[];
  /** `sha256:<hex>` of the blocks. */
  content_hash: string;
}

export function frozenCopy(state: CanvasState, docId: string): FrozenCopy {
  const blocks = liveBlocks(state, docId).map((b) => ({ id: b.id, type: b.type, content: b.content }));
  return { blocks, content_hash: `sha256:${hashJson(blocks)}` };
}
