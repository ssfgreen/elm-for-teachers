/** The model's operations become proposals on the canvas, in one pass. */
import { hasWaitingSuggestion, type Block } from "../blocks.js";
import type { Operation } from "../operations.js";
import { copyBlocks, insertBlock, proposeDelete, proposeMove, proposeReplace } from "../canvas.js";
import { copySource, copyStyle, copyTempId, type CopyChoice } from "./copies.js";
import { createDoc, decideStyle, proposeStyle } from "./docs.js";
import { acceptAllOrder, acceptBlock } from "./proposals.js";
import { addRevision, CanvasError, emptyChanges, getBlock, mergeInto, place, renumber, touch, visibleBlocks, type CanvasState, type Changes, type Ctx } from "./state.js";

/*
 * The model's own suggestions (blocks still `proposed`) are not part of the doc yet, so it
 * changes them in place: a replace rewrites the suggestion, a delete withdraws it, a move
 * puts it elsewhere. Each stays a suggestion for the teacher to accept or reject.
 */
const isSuggestion = (state: CanvasState, id: string) => state.blocks.get(id)?.status === "proposed";

function reviseSuggestion(state: CanvasState, ctx: Ctx, p: { block_id: string; content: string; cause_event_id: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  addRevision(changes, ctx, block, "model", { content: p.content }, p.cause_event_id);
  return { block, changes };
}

function withdrawSuggestion(state: CanvasState, ctx: Ctx, p: { block_id: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  block.status = "deleted";
  block.updated_at = ctx.now();
  touch(changes, block);
  renumber(visibleBlocks(state, block.doc_id), changes, ctx);
  return { block, changes };
}

function moveSuggestion(state: CanvasState, ctx: Ctx, p: { block_id: string; after: string }): { block: Block; changes: Changes } {
  const changes = emptyChanges();
  const block = getBlock(state, p.block_id);
  if (p.after !== "start" && getBlock(state, p.after).doc_id !== block.doc_id) throw new CanvasError("cross_doc", "move across docs");
  block.updated_at = ctx.now();
  touch(changes, block);
  place(state, block, p.after, changes, ctx);
  return { block, changes };
}

export interface ApplyResult {
  changes: Changes;
  proposed_block_ids: string[];
  /** Docs created this turn. */
  created_doc_ids: string[];
  /** Docs given a suggested font or page colour this turn. */
  styled_doc_ids: string[];
  /** temp_id → real doc id for create_doc ops in this turn. */
  doc_ids: Record<string, string>;
  /** Each op with the block or doc it produced. */
  produced: Array<{ op: Operation; block_id: string | null; doc_id: string }>;
  /**
   * Blocks this turn changed that already had a suggestion waiting from an earlier turn, where
   * the assistant did not say the teacher asked to revise it: in Editing mode they stay waiting.
   */
  earlier_suggestions: string[];
  /** Each block a `copy_of` copied: the new doc, the source block and the copy. */
  copies: Array<{ doc_id: string; from: string; block_id: string }>;
}

/** A suggestion waiting on the block: a new block not yet accepted, or a change to a live one. */
const waiting = (state: CanvasState, id: string) => {
  const b = state.blocks.get(id);
  return !!b && hasWaitingSuggestion(b);
};

/**
 * Turn validated operations into proposals. Inserts default to `defaultDocId` (the
 * doc the teacher has open); new docs go in `threadId`. Inserts sharing an anchor
 * keep list order: each is placed after the previous insert that used that anchor.
 */
export function applyOperations(
  state: CanvasState,
  ctx: Ctx,
  p: {
    operations: Operation[];
    turn_id: string;
    cause_event_id: string;
    thread_id: string;
    default_doc_id: string;
    /** The teacher's choice of what a copy of each doc is built from (ChatBody.copy_choice). */
    copy_choices?: Readonly<Record<string, CopyChoice>>;
  },
): ApplyResult {
  const changes = emptyChanges();
  const result: ApplyResult = { changes, proposed_block_ids: [], created_doc_ids: [], styled_doc_ids: [], doc_ids: {}, produced: [], earlier_suggestions: [], copies: [] };
  // What each copy is made of, read before the turn changes anything: a copy never carries this
  // turn's own suggestions. Validation has already dropped a copy that needs the teacher's choice.
  const sources = new Map<string, Block[]>();
  for (const op of p.operations) {
    if (op.op !== "create_doc" || !op.copy_of || !state.docs.has(op.copy_of)) continue;
    const choice = p.copy_choices?.[op.copy_of];
    sources.set(op.temp_id, (copySource(state, op.copy_of, choice) ?? copySource(state, op.copy_of, "approved_only")!).map((b) => ({ ...b })));
  }
  /** Each block once: a copied block changed later in the turn is already listed. */
  const propose = (id: string) => {
    if (!result.proposed_block_ids.includes(id)) result.proposed_block_ids.push(id);
  };
  /** Blocks this turn has suggested so far: its own, not an earlier turn's. */
  const ours = new Set<string>();
  const noteEarlier = (op: { id: string; revises_suggestion?: boolean }) => {
    if (!ours.has(op.id) && waiting(state, op.id) && !op.revises_suggestion && !result.earlier_suggestions.includes(op.id)) result.earlier_suggestions.push(op.id);
  };
  const lastInsertedAfter = new Map<string, string>(); // `${doc}:${anchor}` → last inserted block id
  const tempBlocks = new Map<string, string>(); // insert temp_id → block id
  for (let op of p.operations) {
    switch (op.op) {
      case "create_doc": {
        const cd = createDoc(state, ctx, { thread_id: p.thread_id, name: op.name, created_by: "model" });
        result.doc_ids[op.temp_id] = cd.doc.id;
        result.created_doc_ids.push(cd.doc.id);
        mergeInto(changes, cd.changes);
        result.produced.push({ op, block_id: null, doc_id: cd.doc.id });
        const from = sources.get(op.temp_id);
        if (op.copy_of && from) {
          const style = copyStyle(state.docs.get(op.copy_of)!, p.copy_choices?.[op.copy_of]);
          if (style) cd.doc.style = style;
          else delete cd.doc.style;
          const copied = copyBlocks(state, ctx, {
            doc_id: cd.doc.id,
            from,
            as: { origin: "model", origin_turn: p.turn_id, status: "proposed", actor: "model", cause_event_id: p.cause_event_id },
          });
          mergeInto(changes, copied.changes);
          const docTemp = op.temp_id;
          copied.blocks.forEach((b, i) => {
            const fromId = from[i]!.id;
            tempBlocks.set(copyTempId(docTemp, fromId), b.id);
            ours.add(b.id);
            result.proposed_block_ids.push(b.id);
            result.copies.push({ doc_id: cd.doc.id, from: fromId, block_id: b.id });
          });
        }
        break;
      }
      case "set_style": {
        const docId = op.doc ? (result.doc_ids[op.doc] ?? op.doc) : p.default_doc_id;
        const style = { ...(op.font ? { font: op.font } : {}), ...(op.background ? { background: op.background } : {}) };
        const r = proposeStyle(state, ctx, { doc_id: docId, style, turn_id: p.turn_id });
        mergeInto(changes, r.changes);
        if (!result.styled_doc_ids.includes(docId)) result.styled_doc_ids.push(docId);
        result.produced.push({ op, block_id: null, doc_id: docId });
        break;
      }
      case "insert": {
        const docId = op.doc ? (result.doc_ids[op.doc] ?? op.doc) : p.default_doc_id;
        const anchor = tempBlocks.get(op.after) ?? op.after;
        const key = `${docId}:${anchor}`;
        const after = lastInsertedAfter.get(key) ?? anchor;
        const ins = insertBlock(state, ctx, {
          doc_id: docId,
          after,
          type: op.type,
          content: op.content,
          origin: "model",
          origin_turn: p.turn_id,
          status: "proposed",
          actor: "model",
          cause_event_id: p.cause_event_id,
          derived_from: op.from ? (tempBlocks.get(op.from) ?? op.from) : null,
        });
        lastInsertedAfter.set(key, ins.block.id);
        ours.add(ins.block.id);
        if (op.temp_id) tempBlocks.set(op.temp_id, ins.block.id);
        mergeInto(changes, ins.changes);
        result.proposed_block_ids.push(ins.block.id);
        result.produced.push({ op, block_id: ins.block.id, doc_id: docId });
        break;
      }
      case "replace": {
        op = { ...op, id: tempBlocks.get(op.id) ?? op.id };
        noteEarlier(op);
        const r = isSuggestion(state, op.id)
          ? reviseSuggestion(state, ctx, { block_id: op.id, content: op.content, cause_event_id: p.cause_event_id })
          : proposeReplace(state, ctx, { block_id: op.id, turn_id: p.turn_id, content: op.content });
        mergeInto(changes, r.changes);
        propose(op.id);
        result.produced.push({ op, block_id: op.id, doc_id: r.block.doc_id });
        break;
      }
      case "delete": {
        op = { ...op, id: tempBlocks.get(op.id) ?? op.id };
        noteEarlier(op);
        const withdrawn = isSuggestion(state, op.id);
        const r = withdrawn ? withdrawSuggestion(state, ctx, { block_id: op.id }) : proposeDelete(state, ctx, { block_id: op.id, turn_id: p.turn_id });
        mergeInto(changes, r.changes);
        // A withdrawn suggestion is gone: nothing is left to accept or reject.
        if (!withdrawn) propose(op.id);
        result.produced.push({ op, block_id: op.id, doc_id: r.block.doc_id });
        break;
      }
      case "move": {
        op = { ...op, id: tempBlocks.get(op.id) ?? op.id };
        noteEarlier(op);
        const r = isSuggestion(state, op.id)
          ? moveSuggestion(state, ctx, { block_id: op.id, after: tempBlocks.get(op.after) ?? op.after })
          : proposeMove(state, ctx, { block_id: op.id, turn_id: p.turn_id, after: op.after });
        mergeInto(changes, r.changes);
        propose(op.id);
        result.produced.push({ op, block_id: op.id, doc_id: r.block.doc_id });
        break;
      }
    }
  }
  return result;
}

/**
 * Editing mode (the teacher's choice under the chat box, from 7 Nov 2026): a turn's suggestions
 * go straight into the doc. Applied after `applyOperations`, in the same pass: each block it
 * suggested is accepted (moves in chain order, as accept all does), and each suggested font or
 * page colour taken. The revisions are the assistant's, caused by the turn's response; no
 * teacher decision is recorded.
 *
 * Not taken in: a change to a block that already had a suggestion from an earlier turn, unless
 * the assistant marked it `revises_suggestion` (the teacher asked for it). That earlier
 * suggestion is still the teacher's to decide, so the change waits with it (Sam, 7 Nov 2026,
 * after a turn about one part of a list took in a waiting change to another part).
 * Nor the blocks in `hold`: the caller's own reasons (a block the teacher typed in meanwhile).
 */
export function takeTurnIn(state: CanvasState, ctx: Ctx, result: ApplyResult, causeEventId: string, hold: readonly string[] = []): Changes {
  const keep = new Set([...result.earlier_suggestions, ...hold]);
  return takeIn(state, ctx, { block_ids: result.proposed_block_ids.filter((id) => !keep.has(id)), doc_ids: result.styled_doc_ids }, causeEventId);
}

/**
 * Accept, as the assistant's revisions, the suggestions waiting on these blocks (moves in chain
 * order, as accept all does) and the suggested font or page colour of these docs.
 */
export function takeIn(state: CanvasState, ctx: Ctx, p: { block_ids: readonly string[]; doc_ids: readonly string[] }, causeEventId: string): Changes {
  const changes = emptyChanges();
  const toTake = p.block_ids
    .filter((id) => waiting(state, id))
    .map((id) => state.blocks.get(id))
    .filter((b): b is Block => !!b);
  for (const b of acceptAllOrder(toTake)) mergeInto(changes, acceptBlock(state, ctx, { block_id: b.id, cause_event_id: causeEventId }).changes);
  for (const docId of p.doc_ids) {
    if (state.docs.get(docId)?.proposed_style) mergeInto(changes, decideStyle(state, ctx, { doc_id: docId, accept: true }).changes);
  }
  return changes;
}
