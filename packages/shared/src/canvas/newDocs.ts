/**
 * Where the turn goes straight in, in Suggesting mode too: a suggestion there would have nothing
 * to replace. Elsewhere the assistant's changes are suggestions as before.
 *
 * - A doc the assistant makes or copies this turn (Sam, 12 Nov 2026).
 * - A blank doc (Sam, 13 Nov 2026): every visible block is empty text; no picture, table, divider
 *   or page break; no suggestion or suggested style waiting. Its name and font do not count, and
 *   a doc typed in and then emptied is blank again. Any blank doc of the chat counts.
 *
 * What the turn puts there is taken in at once, as in Editing mode, whichever mode the teacher
 * chose. Blank is read inside the commit, before the turn's operations: when the teacher typed
 * while the assistant worked, the doc is no longer blank and the changes are suggestions.
 */
import type { Block, Doc } from "../blocks.js";
import { hasWaitingSuggestion } from "../blocks.js";
import type { BlockType } from "../enums.js";
import { takeIn, type ApplyResult } from "./apply.js";
import { docsOf, type CanvasState, type Changes, type Ctx } from "./state.js";

/** Blocks that are something in the doc even with no text. */
const NOT_TEXT: ReadonlySet<BlockType> = new Set(["image", "table", "divider", "page_break"]);

/** Whether the doc is blank, among these blocks (other docs' blocks are passed over). */
export function isBlankDoc(doc: Pick<Doc, "id" | "proposed_style"> | undefined, blocks: Iterable<Block>): boolean {
  if (!doc || doc.proposed_style) return false;
  for (const b of blocks) {
    if (b.doc_id !== doc.id || (b.status !== "live" && b.status !== "proposed")) continue;
    if (hasWaitingSuggestion(b) || NOT_TEXT.has(b.type) || b.content.trim() !== "") return false;
  }
  return true;
}

/** The chat's blank docs. */
export function blankDocIds(state: CanvasState, threadId: string): string[] {
  const blocks = [...state.blocks.values()];
  return docsOf(state, threadId)
    .filter((d) => isBlankDoc(d, blocks))
    .map((d) => d.id);
}

/**
 * Take in what the turn suggested in the docs it made, and in `blank` (the docs that were blank
 * before the turn): their blocks, and a font or page colour suggested for them. Returns the
 * changes, the blocks taken in, and the blank docs the turn put something in.
 */
export function takeNewDocsIn(state: CanvasState, ctx: Ctx, result: ApplyResult, causeEventId: string, blank: readonly string[] = []): { changes: Changes; block_ids: string[]; blank_doc_ids: string[] } {
  const direct = new Set([...result.created_doc_ids, ...blank]);
  const blockIds = result.proposed_block_ids.filter((id) => direct.has(state.blocks.get(id)?.doc_id ?? ""));
  const styled = result.styled_doc_ids.filter((id) => direct.has(id));
  const touched = new Set([...blockIds.map((id) => state.blocks.get(id)!.doc_id), ...styled]);
  return { changes: takeIn(state, ctx, { block_ids: blockIds, doc_ids: styled }, causeEventId), block_ids: blockIds, blank_doc_ids: blank.filter((id) => touched.has(id)) };
}
