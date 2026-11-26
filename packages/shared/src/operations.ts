import { z } from "zod";
import { BlockType, DocBackground, DocFont } from "./enums.js";

/**
 * Block operations the model may propose. Operations never touch a doc directly;
 * they become proposals the teacher accepts or rejects.
 *
 * A `create_doc` op carries a `temp_id` that later ops in the same turn may use as
 * their `doc` until the server assigns a real id. New docs go in the current thread.
 * An `insert` may carry a `temp_id` too, so a later insert can go `after` it.
 *
 * Order: inserts land in the order they are listed. Consecutive inserts naming the same
 * `after` are placed one after another (not each at that spot), so a whole document is
 * its blocks top to bottom, all with `"after": "start"`; chaining each block after the
 * previous one's temp_id gives the same result.
 */
export const InsertOp = z.object({
  op: z.literal("insert"),
  /** Doc id, a same-turn temp_id, or omitted for the doc the teacher has open. */
  doc: z.string().optional(),
  /** Block id, the temp_id of an earlier insert in this turn, or "start". */
  after: z.string(),
  type: BlockType,
  content: z.string(),
  /** A name for this new block, so later inserts in the same turn can go after it. */
  temp_id: z.string().optional(),
  /**
   * The block this one is a version of (a definition moved into a block of its own): a block id,
   * or a copied block's temp id. It becomes the new block's `derived_from`.
   */
  from: z.string().optional(),
});
export type InsertOp = z.infer<typeof InsertOp>;

export const ReplaceOp = z.object({
  op: z.literal("replace"),
  id: z.string(),
  content: z.string(),
  /**
   * Editing mode only: the teacher asked for this change to the assistant's earlier suggestion on
   * the block (named or clearly implied), so it goes straight in. Without it, a change to a block
   * with an earlier suggestion waiting stays a suggestion.
   */
  revises_suggestion: z.boolean().optional(),
});
export type ReplaceOp = z.infer<typeof ReplaceOp>;

export const DeleteOp = z.object({
  op: z.literal("delete"),
  id: z.string(),
  /**
   * Editing mode only: the teacher asked for this change to the assistant's earlier suggestion on
   * the block (named or clearly implied), so it goes straight in. Without it, a change to a block
   * with an earlier suggestion waiting stays a suggestion.
   */
  revises_suggestion: z.boolean().optional(),
});
export type DeleteOp = z.infer<typeof DeleteOp>;

export const MoveOp = z.object({
  op: z.literal("move"),
  id: z.string(),
  after: z.string(),
  /**
   * Editing mode only: the teacher asked for this change to the assistant's earlier suggestion on
   * the block (named or clearly implied), so it goes straight in. Without it, a change to a block
   * with an earlier suggestion waiting stays a suggestion.
   */
  revises_suggestion: z.boolean().optional(),
});
export type MoveOp = z.infer<typeof MoveOp>;

export const CreateDocOp = z.object({
  op: z.literal("create_doc"),
  temp_id: z.string(),
  name: z.string().min(1),
  /**
   * A doc in the chat to copy: its blocks come in, in order, as suggestions, each derived from the
   * block it copies, named `<temp_id>/<source block id>` for later operations in the turn.
   */
  copy_of: z.string().optional(),
});
export type CreateDocOp = z.infer<typeof CreateDocOp>;

/**
 * A suggested font or page colour for a whole doc, from the lists the toolbar offers. The
 * teacher accepts or rejects it in the comments column; what it leaves out stays as it is.
 */
export const SetStyleOp = z.object({
  op: z.literal("set_style"),
  /** Doc id, a same-turn temp_id, or omitted for the doc the teacher has open. */
  doc: z.string().optional(),
  font: DocFont.optional(),
  background: DocBackground.optional(),
});
export type SetStyleOp = z.infer<typeof SetStyleOp>;

export const Operation = z.discriminatedUnion("op", [InsertOp, ReplaceOp, DeleteOp, MoveOp, CreateDocOp, SetStyleOp]);
export type Operation = z.infer<typeof Operation>;

export const OperationList = z.array(Operation);

/** Why an operation was dropped at validation. */
export const DroppedOp = z.object({
  index: z.number().int().nonnegative(),
  op: z.unknown(),
  reason: z.enum(["unknown_block_id", "unknown_doc", "schema_invalid", "duplicate_temp_id", "moves_across_docs", "invalid_image", "no_style", "table_needs_table_block", "needs_copy_choice"]),
});
export type DroppedOp = z.infer<typeof DroppedOp>;
