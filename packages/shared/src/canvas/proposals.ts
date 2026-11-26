/**
 * The assistant's proposals and the teacher's decisions on them: proposing a replace, delete or
 * move, accepting or rejecting one block or a whole doc, and a teacher edit to a block that may
 * hold one. Part of the canvas model (../canvas.ts), which re-exports it.
 */
import { hasWaitingSuggestion, type Block, type BlockContent } from "../blocks.js";
import { addRevision, assertEditable, CanvasError, emptyChanges, getBlock, mergeInto, place, renumber, touch, visibleBlocks, type CanvasState, type Changes, type Ctx } from "./state.js";

/**
 * Teacher edits a block's content. Typing into a proposed block accepts it;
 * typing into a block with a pending replace applies the proposal first (so the
 * model's revision is recorded) and then the teacher's edit on top.
 */
export function editBlock(
  state: CanvasState,
  ctx: Ctx,
  p: { block_id: string; after: BlockContent; cause_event_id: string },
): { block: Block; changes: Changes; implicit_accept: boolean } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  let implicitAccept = false;
  if (block.status === "proposed") {
    block.status = "live";
    implicitAccept = true;
  }
  if (block.pending?.op === "replace") {
    addRevision(changes, ctx, block, "model", { content: block.pending.content }, p.cause_event_id);
    block.pending = null;
    implicitAccept = true;
  } else if (block.pending) {
    block.pending = null;
  }
  if (block.content !== p.after.content) {
    addRevision(changes, ctx, block, "teacher", p.after, p.cause_event_id);
  } else {
    block.updated_at = ctx.now();
    touch(changes, block);
  }
  return { block, changes, implicit_accept: implicitAccept };
}

export function proposeReplace(state: CanvasState, ctx: Ctx, p: { block_id: string; turn_id: string; content: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  block.pending = { op: "replace", turn_id: p.turn_id, content: p.content };
  block.updated_at = ctx.now();
  touch(changes, block);
  return { block, changes };
}

export function proposeDelete(state: CanvasState, ctx: Ctx, p: { block_id: string; turn_id: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  block.pending = { op: "delete", turn_id: p.turn_id };
  block.updated_at = ctx.now();
  touch(changes, block);
  return { block, changes };
}

export function proposeMove(state: CanvasState, ctx: Ctx, p: { block_id: string; turn_id: string; after: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  if (p.after !== "start" && getBlock(state, p.after).doc_id !== block.doc_id) {
    throw new CanvasError("cross_doc", "move across docs");
  }
  block.pending = { op: "move", turn_id: p.turn_id, after: p.after };
  block.updated_at = ctx.now();
  touch(changes, block);
  return { block, changes };
}

/** Accept a proposed block or the pending proposal on a live block. */
export function acceptBlock(state: CanvasState, ctx: Ctx, p: { block_id: string; cause_event_id: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  if (block.status === "proposed") {
    block.status = "live";
    block.updated_at = ctx.now();
    touch(changes, block);
    return { block, changes };
  }
  assertEditable(block);
  const pending = block.pending;
  if (!pending) throw new CanvasError("nothing_pending", `block ${block.id} has no proposal`);
  block.pending = null;
  switch (pending.op) {
    case "replace":
      addRevision(changes, ctx, block, "model", { content: pending.content }, p.cause_event_id);
      break;
    case "delete":
      block.status = "deleted";
      block.updated_at = ctx.now();
      touch(changes, block);
      renumber(visibleBlocks(state, block.doc_id), changes, ctx);
      break;
    case "move":
      block.updated_at = ctx.now();
      touch(changes, block);
      place(state, block, pending.after, changes, ctx);
      break;
  }
  return { block, changes };
}

/** Reject a proposed block (status rejected) or clear the pending proposal on a live block. */
export function rejectBlock(state: CanvasState, ctx: Ctx, p: { block_id: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  if (block.status === "proposed") {
    block.status = "rejected";
    block.pending = null;
    block.updated_at = ctx.now();
    touch(changes, block);
    renumber(visibleBlocks(state, block.doc_id), changes, ctx);
    return { block, changes };
  }
  assertEditable(block);
  if (!block.pending) throw new CanvasError("nothing_pending", `block ${block.id} has no proposal`);
  block.pending = null;
  block.updated_at = ctx.now();
  touch(changes, block);
  return { block, changes };
}


/**
 * The order to accept a doc's proposals in, given them in document order: everything
 * but moves first, then moves so that a move whose `after` is another pending move comes
 * after that move. The model writes a reorder as a chain (B1 after start, B2 after B1, ...),
 * which only comes out right applied in that order, not in document order.
 */
export function acceptAllOrder<T extends { id: string; pending: { op: string; after?: string } | null }>(ordered: T[]): T[] {
  const isMove = (b: T) => b.pending?.op === "move";
  const out = ordered.filter((b) => !isMove(b));
  let moves = ordered.filter(isMove);
  while (moves.length) {
    const waiting = new Set(moves.map((b) => b.id));
    const ready = moves.filter((b) => !waiting.has(b.pending!.after ?? "start"));
    // A cycle (a after b, b after a) cannot be ordered: take the rest as they stand.
    const next = ready.length ? ready : moves;
    out.push(...next);
    const taken = new Set(next.map((b) => b.id));
    moves = moves.filter((b) => !taken.has(b.id));
  }
  return out;
}

/** Accept every outstanding proposal in a doc (the "accept all" control). */
export function acceptAll(state: CanvasState, ctx: Ctx, p: { doc_id: string; cause_event_id: string }): { changes: Changes; block_ids: string[] } {
  const changes = emptyChanges();
  const blockIds: string[] = [];
  for (const b of acceptAllOrder(visibleBlocks(state, p.doc_id).filter(hasWaitingSuggestion))) {
    mergeInto(changes, acceptBlock(state, ctx, { block_id: b.id, cause_event_id: p.cause_event_id }).changes);
    blockIds.push(b.id);
  }
  return { changes, block_ids: blockIds };
}

/** Reject every outstanding proposal in a doc. */
export function rejectAll(state: CanvasState, ctx: Ctx, p: { doc_id: string }): { changes: Changes; block_ids: string[] } {
  const changes = emptyChanges();
  const blockIds: string[] = [];
  for (const b of visibleBlocks(state, p.doc_id)) {
    if (!hasWaitingSuggestion(b)) continue;
    mergeInto(changes, rejectBlock(state, ctx, { block_id: b.id }).changes);
    blockIds.push(b.id);
  }
  return { changes, block_ids: blockIds };
}

/* -------------------------------------------------------------- rendering */

/**
 * The teacher typed into a block holding a suggestion, and the suggestion stays waiting for a
 * decision (as in Word). `after` is the text as shown. For a new block from the assistant it
 * becomes the block's text, still a suggestion. For a suggested change, `after` becomes the
 * suggested text and `live` the block's own text (the teacher's edits outside the suggested
 * words reach both); when the two end up the same, nothing is left to decide. Any other block
 * is edited as usual (editBlock).
 */
export function editInSuggestion(
  state: CanvasState,
  ctx: Ctx,
  p: { block_id: string; after: BlockContent; live?: BlockContent; cause_event_id: string },
): { block: Block; changes: Changes; implicit_accept: boolean } {
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  const changes = emptyChanges();
  if (block.status === "proposed" || block.pending?.op === "move") {
    if (block.content !== p.after.content) addRevision(changes, ctx, block, "teacher", p.after, p.cause_event_id);
    return { block, changes, implicit_accept: false };
  }
  const pending = block.pending;
  if (pending?.op !== "replace" || !p.live) return editBlock(state, ctx, { block_id: p.block_id, after: p.after, cause_event_id: p.cause_event_id });
  if (block.content !== p.live.content) addRevision(changes, ctx, block, "teacher", p.live, p.cause_event_id);
  block.pending = block.content === p.after.content ? null : { ...pending, content: p.after.content };
  block.updated_at = ctx.now();
  touch(changes, block);
  return { block, changes, implicit_accept: false };
}

/**
 * The teacher accepted or rejected one change inside a suggested change to a block. The client
 * works out the block's live and suggested text after it (`live`, `suggested`). Accepting
 * records the new live text as the assistant's revision, as accepting a whole block does;
 * rejecting changes only the suggestion. When the two end up the same, nothing is left to decide.
 */
export function decidePart(
  state: CanvasState,
  ctx: Ctx,
  p: { block_id: string; accept: boolean; live: BlockContent; suggested: BlockContent; cause_event_id: string },
): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  const pending = block.pending;
  if (pending?.op !== "replace") throw new CanvasError("nothing_pending", `block ${block.id} has no suggested change`);
  if (p.accept && block.content !== p.live.content) addRevision(changes, ctx, block, "model", p.live, p.cause_event_id);
  block.pending = block.content === p.suggested.content ? null : { ...pending, content: p.suggested.content };
  block.updated_at = ctx.now();
  touch(changes, block);
  return { block, changes };
}
