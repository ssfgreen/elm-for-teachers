/** Event payloads for comments: added, deleted, edited, resolved. */
import { z } from "zod";
import { Ulid } from "../blocks.js";

/** A comment (root or reply) added, by the teacher or the model. */
export const CommentCreatePayload = z.object({
  comment_id: Ulid,
  root_id: Ulid.nullable(),
  doc_id: Ulid,
  block_id: Ulid,
  author: z.enum(["teacher", "model"]),
  body: z.string(),
  quote: z.string().nullable(),
  /** The teacher wrote @model: the assistant was asked to answer (that turn's id). */
  turn_id: z.string().nullable(),
});

/** A comment deleted; a root takes its thread with it (`replies` lists them). */
export const CommentDeletePayload = z.object({
  comment_id: Ulid,
  replies: z.array(Ulid),
});

/** The teacher changed one of their comments; `previous` is the body before. */
export const CommentEditPayload = z.object({
  comment_id: Ulid,
  body: z.string(),
  previous: z.string(),
});

/** A thread resolved (`resolved` true) or reopened. */
export const CommentResolvePayload = z.object({
  comment_id: Ulid,
  resolved: z.boolean(),
});
