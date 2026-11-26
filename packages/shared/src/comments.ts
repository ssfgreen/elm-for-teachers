import { z } from "zod";
import { Timestamp, Ulid } from "./blocks.js";

/**
 * Comments on a doc, as in a word processor: a thread starts with a root comment anchored to a
 * block (and the text selected in it, if any), and gathers replies. The teacher and the model
 * both write them. A deleted comment is kept, marked deleted, for the study record; deleting a
 * root deletes its thread. The teacher can edit and delete their own comments, not the model's,
 * and resolve (or reopen) any thread.
 */
export const CommentAuthor = z.enum(["teacher", "model"]);
export type CommentAuthor = z.infer<typeof CommentAuthor>;

export const COMMENT_MAX = 4000;

export const Comment = z.object({
  id: Ulid,
  session_id: z.string(),
  doc_id: Ulid,
  /** The block the thread is about (the root's; replies repeat it). */
  block_id: Ulid,
  /** The thread's root comment; null on the root itself. */
  root_id: Ulid.nullable(),
  author: CommentAuthor,
  body: z.string().min(1).max(COMMENT_MAX),
  /** The text selected when the thread was started, if any (root only). */
  quote: z.string().max(2000).nullable(),
  /** The model turn that wrote it, or that a teacher's @model comment started. */
  turn_id: z.string().nullable(),
  created_at: Timestamp,
  /** Set when the teacher last changed the body (their own comments only). */
  edited_at: Timestamp.nullable(),
  /** Set on a root while its thread is resolved (null again when reopened). */
  resolved_at: Timestamp.nullable(),
  deleted_at: Timestamp.nullable(),
});
export type Comment = z.infer<typeof Comment>;
