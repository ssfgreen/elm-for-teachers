/**
 * The canvas state and the low-level helpers every canvas command shares: reading blocks and
 * docs, collecting changes, revisions and order. Pure, like the rest of the canvas.
 */
import type { Block, BlockContent, BlockRevision, Doc } from "../blocks.js";
import { blockContentOf } from "../blocks.js";
import type { Actor, DocStyle } from "../enums.js";

export interface CanvasState {
  sessionId: string;
  blocks: Map<string, Block>;
  docs: Map<string, Doc>;
}

export interface Changes {
  blocks: Block[];
  docs: Doc[];
  revisions: BlockRevision[];
}

export interface Ctx {
  now: () => string;
  newId: () => string;
  /** The look a new doc starts with (the teacher's default font); a copy takes its source's instead. */
  newDocStyle?: DocStyle;
}

export class CanvasError extends Error {
  constructor(
    public readonly code:
      | "unknown_block"
      | "unknown_doc"
      | "block_not_editable"
      | "nothing_pending"
      | "bad_anchor"
      | "cross_doc"
      | "duplicate_id",
    message: string,
  ) {
    super(message);
    this.name = "CanvasError";
  }
}

/* ----------------------------------------------------------------- state */

/**
 * A state over these blocks and docs. It holds the objects themselves, not copies, and the
 * operations change them in place: pass copies of anything that must stay as it is (such as a
 * React snapshot).
 */
export function createState(sessionId: string, blocks: Block[] = [], docs: Doc[] = []): CanvasState {
  const state: CanvasState = { sessionId, blocks: new Map(), docs: new Map() };
  for (const d of docs) state.docs.set(d.id, d);
  for (const b of blocks) state.blocks.set(b.id, b);
  return state;
}

/** Blocks shown in a doc: live and proposed, in order. */
export function visibleBlocks(state: CanvasState, docId: string): Block[] {
  return [...state.blocks.values()]
    .filter((b) => b.doc_id === docId && (b.status === "live" || b.status === "proposed"))
    .sort((a, b) => a.order - b.order);
}

/** Blocks that are part of the doc proper: live only, in order. */
export function liveBlocks(state: CanvasState, docId: string): Block[] {
  return visibleBlocks(state, docId).filter((b) => b.status === "live");
}

/** Docs of one thread (or every doc), oldest first. */
export function docsOf(state: CanvasState, threadId?: string): Doc[] {
  return [...state.docs.values()]
    .filter((d) => threadId === undefined || d.thread_id === threadId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function getBlock(state: CanvasState, id: string): Block {
  const b = state.blocks.get(id);
  if (!b) throw new CanvasError("unknown_block", `unknown block ${id}`);
  return b;
}

export function getDoc(state: CanvasState, id: string): Doc {
  const d = state.docs.get(id);
  if (!d) throw new CanvasError("unknown_doc", `unknown doc ${id}`);
  return d;
}

/* --------------------------------------------------------------- helpers */

export function emptyChanges(): Changes {
  return { blocks: [], docs: [], revisions: [] };
}

export function touch(changes: Changes, block: Block): void {
  if (!changes.blocks.includes(block)) changes.blocks.push(block);
}

export function addRevision(changes: Changes, ctx: Ctx, block: Block, actor: Actor, after: BlockContent, causeEventId: string): void {
  const before = block.version === 0 ? null : blockContentOf(block);
  block.version += 1;
  block.content = after.content;
  block.updated_at = ctx.now();
  changes.revisions.push({
    block_id: block.id,
    version: block.version,
    actor,
    before,
    after: { ...after },
    cause_event_id: causeEventId,
    at: block.updated_at,
  });
  touch(changes, block);
}

/** Renumber `order` for every visible block in a doc. */
export function renumber(ordered: Block[], changes: Changes, ctx: Ctx): void {
  ordered.forEach((b, i) => {
    if (b.order !== i) {
      b.order = i;
      b.updated_at = ctx.now();
      touch(changes, b);
    }
  });
}

/** Insert `block` into the visible order of its doc after `after` ("start" or a block id). */
export function place(state: CanvasState, block: Block, after: string, changes: Changes, ctx: Ctx): void {
  const ordered = visibleBlocks(state, block.doc_id).filter((b) => b.id !== block.id);
  let index: number;
  if (after === "start") {
    index = 0;
  } else {
    const anchor = state.blocks.get(after);
    if (!anchor || anchor.doc_id !== block.doc_id || !(anchor.status === "live" || anchor.status === "proposed")) {
      throw new CanvasError("bad_anchor", `cannot place after ${after}`);
    }
    index = ordered.findIndex((b) => b.id === after) + 1;
  }
  ordered.splice(index, 0, block);
  renumber(ordered, changes, ctx);
}

export function assertEditable(block: Block): void {
  if (block.status !== "live" && block.status !== "proposed") {
    throw new CanvasError("block_not_editable", `block ${block.id} is ${block.status}`);
  }
}

export function mergeChanges(a: Changes, b: Changes): Changes {
  const out = emptyChanges();
  mergeInto(out, a);
  mergeInto(out, b);
  return out;
}

export function mergeInto(target: Changes, src: Changes): void {
  for (const b of src.blocks) if (!target.blocks.includes(b)) target.blocks.push(b);
  for (const d of src.docs) if (!target.docs.includes(d)) target.docs.push(d);
  target.revisions.push(...src.revisions);
}
