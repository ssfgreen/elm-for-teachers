/** Event payloads for the editor: typing, paste, selection, focus, scrolling, block changes and image uploads. */
import { z } from "zod";
import { TextOps } from "../text.js";
import { Actor, BlockType, FocusPane } from "../enums.js";
import { BlockContent, Timestamp, Ulid } from "../blocks.js";

const BlockOrChatTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("block"), block_id: Ulid }),
  z.object({ kind: z.literal("chat") }),
]);

/**
 * One editor transaction on a block, as a delta over the block's markdown content
 * (text.ts). `t` is epoch milliseconds.
 */
export const TextEdit = z.object({
  t: z.number().int().nonnegative(),
  ops: TextOps,
});
export type TextEdit = z.infer<typeof TextEdit>;

export const KeystrokeBatchPayload = z.object({
  target: BlockOrChatTarget,
  /** Chat input: text diffs. */
  steps: z.array(z.unknown()).optional(),
  /** Blocks: every transaction in the batch, in order; replaying them gives `content_after`. */
  edits: z.array(TextEdit).optional(),
  char_count: z.number().int().nonnegative(),
  batch_start_ts: Timestamp,
  batch_end_ts: Timestamp,
  /** Block targets only: the block's content after the batch, as the editor shows it; the server records the revision from it. */
  content_after: BlockContent.optional(),
  /**
   * Added 7 Nov 2026. True when the edit was made in a block holding one of the assistant's
   * suggestions and the suggestion stays waiting for a decision, as typing into a suggestion does
   * in Word. `content_after` is then the suggested text as shown. Without it (all earlier data),
   * typing into a suggestion accepted it (`edit_then_accept`).
   */
  in_suggestion: z.literal(true).optional(),
  /** With `in_suggestion`, for a suggested change to a block: the block's live text after the edit. */
  live_after: BlockContent.optional(),
});

export const PastePayload = z.object({
  target: BlockOrChatTarget,
  length: z.number().int().nonnegative(),
  source: z.enum(["internal", "external", "inferred_external"]),
});

export const SelectionPayload = z.object({
  block_id: Ulid,
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
});

export const FocusPayload = z.object({
  pane: FocusPane,
  block_id: Ulid.nullable(),
});

export const ScrollPayload = z.object({
  pane: FocusPane,
  position: z.number(),
});

export const BlockVisiblePayload = z.object({
  block_id: Ulid,
  visible: z.boolean(),
});

export const BlockRevisionPayload = z.object({
  block_id: Ulid,
  version: z.number().int().nonnegative(),
  actor: Actor,
});

/**
 * Teacher structural changes, logged by the server when the editor's structural
 * commands arrive (split on Enter, merge on Backspace, insert, delete, move, retype).
 * Content changes inside a block arrive as keystroke batches.
 */
export const BlockStructurePayload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("split"), block_id: Ulid, new_block_id: Ulid }),
  z.object({ action: z.literal("merge"), block_id: Ulid, merged_into: Ulid }),
  z.object({ action: z.literal("insert"), block_id: Ulid, after: z.string() }),
  z.object({ action: z.literal("delete"), block_id: Ulid }),
  z.object({ action: z.literal("move"), block_id: Ulid, after: z.string() }),
  z.object({ action: z.literal("retype"), block_id: Ulid, type: BlockType }),
]);

/** An image added to a doc (stored server-side, referenced from an image block). */
export const AssetUploadPayload = z.object({
  asset_id: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  filename: z.string().nullable(),
  /** A drawing the assistant made in this turn (an SVG image block), not a teacher's upload. */
  turn_id: z.string().optional(),
});
