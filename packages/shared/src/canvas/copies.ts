/**
 * What a model copy of a doc (`create_doc` with `copy_of`) is built from. When the source has
 * suggestions the teacher has not decided on, the teacher chooses (docs/spyglass.md, Part 1):
 *
 * - `approve_all`: the client accepts them all first, so the copy is the source as it now is;
 * - `approved_only`: the source's live text only, as the teacher's Duplicate copies;
 * - `all_and_leave`: the source as if every suggestion were accepted (a suggested block copied,
 *   a waiting change taken, a waiting delete left out), while they stay waiting in the source.
 *
 * Pure.
 */
import { z } from "zod";
import { hasWaitingSuggestion, type Block, type Doc } from "../blocks.js";
import type { DocStyle } from "../enums.js";
import { acceptAll } from "./proposals.js";
import { createState, liveBlocks, visibleBlocks, type CanvasState } from "./state.js";

export const CopyChoice = z.enum(["approve_all", "approved_only", "all_and_leave"]);
export type CopyChoice = z.infer<typeof CopyChoice>;

/** The name later operations in the turn use for a copied block, before it has an id. */
export const copyTempId = (docTempId: string, fromBlockId: string) => `${docTempId}/${fromBlockId}`;

/** How many suggestions wait in a doc: suggested blocks, and changes waiting on live ones. */
export function waitingIn(blocks: readonly Block[], docId: string): number {
  return blocks.filter((b) => b.doc_id === docId && hasWaitingSuggestion(b)).length;
}

const FIXED = { now: () => "1970-01-01T00:00:00.000Z", newId: () => "" };

/**
 * The blocks a copy of `docId` is made of, in order, or null when suggestions wait there and the
 * teacher has not chosen. Each block keeps its own id, which the copy's `derived_from` names: a
 * suggested block copied with `all_and_leave` names the suggested block.
 */
export function copySource(state: CanvasState, docId: string, choice?: CopyChoice): Block[] | null {
  const shown = visibleBlocks(state, docId);
  if (!shown.some(hasWaitingSuggestion)) return liveBlocks(state, docId);
  if (!choice) return null;
  if (choice !== "all_and_leave") return liveBlocks(state, docId);
  // Accept everything on a copy of the doc's blocks; the state itself is left as it is.
  const doc = state.docs.get(docId)!;
  const scratch = createState(state.sessionId, shown.map((b) => ({ ...b })), [{ ...doc }]);
  acceptAll(scratch, FIXED, { doc_id: docId, cause_event_id: "copy" });
  return liveBlocks(scratch, docId);
}

/** The style a copy takes: the source's, with a waiting suggested style too under `all_and_leave`. */
export function copyStyle(doc: Doc, choice?: CopyChoice): DocStyle | undefined {
  const style = { ...doc.style, ...(choice === "all_and_leave" ? doc.proposed_style?.style : {}) };
  return style.font || style.background ? style : undefined;
}
