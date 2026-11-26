/**
 * Canvas state model. Pure: every command takes a state and a context, mutates the
 * state in place, and returns the rows that changed so the caller can persist them.
 * The server runs it against the database; the export runs it to rebuild a session.
 *
 * Invariants enforced here:
 * - `origin` never changes;
 * - nothing is physically removed: deletion and rejection are status changes;
 * - a proposed block is not live until accepted (typing into it keeps it a suggestion when the
 *   client says so, `editInSuggestion`; otherwise it accepts it);
 * - a block's `doc_id` never changes, and blocks only move within their doc.
 */
import type { Block, BlockContent, Doc } from "./blocks.js";
import type { Actor, BlockType, Origin } from "./enums.js";
import { createDoc } from "./canvas/docs.js";
import {
  addRevision,
  assertEditable,
  CanvasError,
  emptyChanges,
  getBlock,
  getDoc,
  liveBlocks,
  mergeChanges,
  place,
  renumber,
  touch,
  visibleBlocks,
  type CanvasState,
  type Changes,
} from "./canvas/state.js";
import type { Ctx } from "./canvas/state.js";
import { editBlock } from "./canvas/proposals.js";
import { isOldList, joinRuns, splitList } from "./lists.js";

export { CanvasError, createState, docsOf, getBlock, getDoc, liveBlocks, mergeChanges, visibleBlocks } from "./canvas/state.js";
export type { CanvasState, Changes, Ctx } from "./canvas/state.js";
export { createDoc, decideStyle, proposeStyle, renameDoc, setDocStyle, type CreateDocParams } from "./canvas/docs.js";
export { acceptAll, acceptAllOrder, acceptBlock, decidePart, editBlock, editInSuggestion, proposeDelete, proposeMove, proposeReplace, rejectAll, rejectBlock } from "./canvas/proposals.js";

/**
 * A new teacher doc in a thread, filled with the given blocks in order (an uploaded file).
 * Each block is live teacher text with one revision citing `cause_event_id`. A whole-list block
 * (a reference file read before lists were a block per item) comes in as its items.
 */
export function importDoc(
  state: CanvasState,
  ctx: Ctx,
  p: { thread_id: string; name: string; id?: string; blocks: Array<{ type: BlockType; content: string }>; cause_event_id: string },
): { doc: Doc; changes: Changes } {
  const created = createDoc(state, ctx, { thread_id: p.thread_id, name: p.name, created_by: "teacher", id: p.id });
  let changes = created.changes;
  let after = "start";
  for (const b of p.blocks.flatMap((x) => (isOldList(x.type) ? splitList(x.type, x.content) : [x]))) {
    const r = insertBlock(state, ctx, { doc_id: created.doc.id, after, type: b.type, content: b.content, origin: "teacher", status: "live", actor: "teacher", cause_event_id: p.cause_event_id });
    changes = mergeChanges(changes, r.changes);
    after = r.block.id;
  }
  return { doc: created.doc, changes };
}

/**
 * A copy of a doc in the same thread: its live blocks, in order, as new teacher blocks
 * (each `derived_from` its original). Pending suggestions and proposed blocks are not copied.
 * `block_ids` gives the new blocks' ids in order (from the editor), or they are generated.
 */
export function duplicateDoc(
  state: CanvasState,
  ctx: Ctx,
  p: { doc_id: string; name: string; id?: string; cause_event_id: string },
): { doc: Doc; changes: Changes } {
  const source = getDoc(state, p.doc_id);
  const created = createDoc(state, ctx, { thread_id: source.thread_id, name: p.name, created_by: "teacher", id: p.id });
  // A copy looks the same, whatever new docs start in.
  if (source.style) created.doc.style = { ...source.style };
  else delete created.doc.style;
  const copied = copyBlocks(state, ctx, {
    doc_id: created.doc.id,
    from: liveBlocks(state, source.id),
    as: { origin: "teacher", status: "live", actor: "teacher", cause_event_id: p.cause_event_id },
  });
  return { doc: created.doc, changes: mergeChanges(created.changes, copied.changes) };
}

/**
 * Copies blocks, in order, to the start of a doc: each a new block `derived_from` the one it
 * copies, with that block's type and text. `as` says whose blocks they are (Duplicate, or a
 * model copy). Returns the new blocks in order.
 */
export function copyBlocks(
  state: CanvasState,
  ctx: Ctx,
  p: { doc_id: string; from: readonly Pick<Block, "id" | "type" | "content">[]; as: Pick<InsertParams, "origin" | "origin_turn" | "status" | "actor" | "cause_event_id"> },
): { blocks: Block[]; changes: Changes } {
  let changes = emptyChanges();
  const blocks: Block[] = [];
  let after = "start";
  for (const b of p.from) {
    const r = insertBlock(state, ctx, { ...p.as, doc_id: p.doc_id, after, type: b.type, content: b.content, derived_from: b.id });
    changes = mergeChanges(changes, r.changes);
    blocks.push(r.block);
    after = r.block.id;
  }
  return { blocks, changes };
}

/* -------------------------------------------------------------- commands */

export interface InsertParams {
  doc_id: string;
  after: string;
  type: BlockType;
  content: string;
  origin: Origin;
  origin_turn?: string | null;
  status: "proposed" | "live";
  actor: Actor;
  cause_event_id: string;
  derived_from?: string | null;
  id?: string;
}

export function insertBlock(state: CanvasState, ctx: Ctx, p: InsertParams): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  getDoc(state, p.doc_id);
  if (p.id !== undefined && state.blocks.has(p.id)) throw new CanvasError("duplicate_id", `block ${p.id} already exists`);
  const now = ctx.now();
  const block: Block = {
    id: p.id ?? ctx.newId(),
    session_id: state.sessionId,
    doc_id: p.doc_id,
    type: p.type,
    content: "",
    origin: p.origin,
    origin_turn: p.origin_turn ?? null,
    status: p.status,
    version: 0,
    derived_from: p.derived_from ?? null,
    order: 0,
    pending: null,
    created_at: now,
    updated_at: now,
  };
  state.blocks.set(block.id, block);
  addRevision(changes, ctx, block, p.actor, { content: p.content }, p.cause_event_id);
  place(state, block, p.after, changes, ctx);
  return { block, changes };
}

/** Teacher deletes a block outright. No revision: content is unchanged, status is deleted. */
export function deleteBlock(state: CanvasState, ctx: Ctx, p: { block_id: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  block.status = "deleted";
  block.pending = null;
  block.updated_at = ctx.now();
  touch(changes, block);
  renumber(visibleBlocks(state, block.doc_id), changes, ctx);
  return { block, changes };
}

export function moveBlock(state: CanvasState, ctx: Ctx, p: { block_id: string; after: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  if (p.after !== "start" && getBlock(state, p.after).doc_id !== block.doc_id) {
    throw new CanvasError("cross_doc", "move across docs");
  }
  place(state, block, p.after, changes, ctx);
  return { block, changes };
}

/** Teacher changes a block's type, optionally with the content restructured for the new type. */
export function retypeBlock(
  state: CanvasState,
  ctx: Ctx,
  p: { block_id: string; type: BlockType; after?: BlockContent; cause_event_id: string },
): { block: Block; changes: Changes } {
  const block = getBlock(state, p.block_id);
  assertEditable(block);
  const changes = emptyChanges();
  block.type = p.type;
  block.updated_at = ctx.now();
  touch(changes, block);
  if (p.after) {
    const r = editBlock(state, ctx, { block_id: p.block_id, after: p.after, cause_event_id: p.cause_event_id });
    return { block, changes: mergeChanges(changes, r.changes) };
  }
  return { block, changes };
}

/** Teacher splits a block (Enter). The original keeps its id; the second part is new, derived from it. */
export function splitBlock(
  state: CanvasState,
  ctx: Ctx,
  p: { block_id: string; first: BlockContent; second: BlockContent; second_type?: BlockType; second_id?: string; cause_event_id: string },
): { first: Block; second: Block; changes: Changes } {
  const first = getBlock(state, p.block_id);
  const edit = editBlock(state, ctx, { block_id: p.block_id, after: p.first, cause_event_id: p.cause_event_id });
  const ins = insertBlock(state, ctx, {
    doc_id: first.doc_id,
    after: first.id,
    type: p.second_type ?? first.type,
    content: p.second.content,
    origin: "teacher",
    status: "live",
    actor: "teacher",
    cause_event_id: p.cause_event_id,
    derived_from: first.id,
    id: p.second_id,
  });
  return { first, second: ins.block, changes: mergeChanges(edit.changes, ins.changes) };
}

/** Teacher merges a block into the one before it (Backspace at start). The absorbed block is deleted. */
export function mergeBlocks(
  state: CanvasState,
  ctx: Ctx,
  p: { block_id: string; merged_into: string; after: BlockContent; cause_event_id: string },
): { target: Block; changes: Changes } {
  const absorbed = getBlock(state, p.block_id);
  const target = getBlock(state, p.merged_into);
  if (absorbed.doc_id !== target.doc_id) throw new CanvasError("cross_doc", "merge across docs");
  const edit = editBlock(state, ctx, { block_id: target.id, after: p.after, cause_event_id: p.cause_event_id });
  const del = deleteBlock(state, ctx, { block_id: absorbed.id });
  return { target, changes: mergeChanges(edit.changes, del.changes) };
}



/** Markdown rendering of a doc's live blocks (one file per doc in the export); a run of list items is one list. */
export function toMarkdown(state: CanvasState, docId: string): string {
  const out: string[] = [];
  for (const b of joinRuns(liveBlocks(state, docId))) {
    switch (b.type) {
      case "heading":
        out.push(b.content.startsWith("#") ? b.content : `## ${b.content}`);
        break;
      case "quote":
        out.push(b.content.split("\n").map((l) => (l.startsWith(">") ? l : `> ${l}`)).join("\n"));
        break;
      case "code_block":
        out.push(b.content.startsWith("```") ? b.content : "```\n" + b.content + "\n```");
        break;
      case "divider":
        out.push("---");
        break;
      case "page_break":
        // Markdown has no pages; a comment marks the spot and viewers hide it.
        out.push("<!-- page break -->");
        break;
      case "paragraph":
        // A line break inside a paragraph: two trailing spaces make it a hard break in markdown.
        out.push(b.content.replace(/ *\n/g, "  \n"));
        break;
      default:
        out.push(b.content);
    }
  }
  return out.join("\n\n") + (out.length ? "\n" : "");
}
