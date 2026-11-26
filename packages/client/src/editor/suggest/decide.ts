/**
 * Deciding one change inside a suggested edit to a block: the block's live and suggested
 * markdown afterwards, as the decision event carries them (`part`). Pure.
 */
import type { DecisionPart } from "@edw/shared";
import { canvasSchema } from "../extensions/index.js";
import { nodeToContent } from "../markdown.js";
import type { PublicBlock } from "../types.js";
import { acceptChange, changesOf, rejectChange } from "./merge.js";
import { nodeOf } from "./text.js";

export function partDecision(b: PublicBlock, index: number, accept: boolean): DecisionPart | null {
  if (b.pending?.op !== "replace") return null;
  const schema = canvasSchema();
  const live = nodeOf(schema, b.type, b.content);
  const suggested = nodeOf(schema, b.type, b.pending.content);
  const change = changesOf(live, suggested)[index];
  if (!change) return null;
  const next = accept ? acceptChange(live, suggested, index) : rejectChange(live, suggested, index);
  if (!next) return null;
  return {
    index,
    ins: change.ins,
    del: change.del,
    live_after: accept ? nodeToContent(next) : { content: b.content },
    suggested_after: accept ? { content: b.pending.content } : nodeToContent(next),
  };
}
