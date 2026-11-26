import { z } from "zod";
import { Actor, BlockStatus, BlockType, DocStyle, Origin } from "./enums.js";

/** ISO-8601 timestamp string, always server time unless the field says otherwise. */
export const Timestamp = z.string().datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

export const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID");
export type Ulid = z.infer<typeof Ulid>;

/**
 * A project: whatever the teacher wants it to be (a class, a course, a topic). It gathers
 * chats and, later, the files and skills they use. A chat need not be in one. Archiving
 * hides it; nothing is deleted.
 */
export const PROJECT_NAME_MAX = 120;
/** "What are you trying to achieve?": the project's goals, subject, class. */
export const PROJECT_DESCRIPTION_MAX = 4000;
/** The teacher's standing instructions for the project's chats. */
export const PROJECT_INSTRUCTIONS_MAX = 8000;
export const Project = z.object({
  id: Ulid,
  session_id: z.string(),
  name: z.string().min(1).max(PROJECT_NAME_MAX),
  /** What the teacher is trying to achieve (asked when the project is made). */
  description: z.string().max(PROJECT_DESCRIPTION_MAX).nullable(),
  /** The teacher's standing instructions for the project's chats. */
  instructions: z.string().max(PROJECT_INSTRUCTIONS_MAX).nullable(),
  created_at: Timestamp,
  archived_at: Timestamp.nullable(),
  /** Deleted by the teacher, with its chats: hidden from them, kept for the research export. */
  deleted_at: Timestamp.nullable(),
});
export type Project = z.infer<typeof Project>;

/**
 * A chat thread. Each thread owns its docs: the model sees only the current
 * thread's docs and conversation, which keeps prompts small.
 */
export const Thread = z.object({
  id: Ulid,
  session_id: z.string(),
  title: z.string(),
  /** The project the chat belongs to, or null for a chat outside any project. */
  project_id: Ulid.nullable(),
  /** The class the chat is for (docs/classes.md); a chat has at most one of project, class and year group. */
  class_id: Ulid.nullable().optional(),
  /** The year group the chat is for. */
  year_group_id: Ulid.nullable().optional(),
  /** The needs group the chat is for (standalone or alongside class_id). */
  needs_group_id: Ulid.nullable().optional(),
  created_at: Timestamp,
});
export type Thread = z.infer<typeof Thread>;

/** A document: an ordered set of blocks, belonging to one thread. */
export const Doc = z.object({
  id: Ulid,
  session_id: z.string(),
  thread_id: Ulid,
  name: z.string().min(1),
  created_by: z.enum(["teacher", "model"]),
  created_at: Timestamp,
  /** Its font and page colour; left out when both are the default. */
  style: DocStyle.optional(),
  /**
   * A font or page colour the model suggested and the teacher has not decided on yet: only the
   * parts it would change, and the turn that suggested it.
   */
  proposed_style: z.object({ style: DocStyle, turn_id: z.string() }).optional(),
  /** When the teacher deleted it; only ever set in the research export. */
  deleted_at: Timestamp.optional(),
});
export type Doc = z.infer<typeof Doc>;

/**
 * Where a chat message points in a doc: the block, the selected range within its
 * content (offsets into the editor text, null for the whole block) and the selected
 * text as the teacher saw it.
 */
export const CommentAnchor = z.object({
  block_id: Ulid,
  from: z.number().int().nonnegative().nullable(),
  to: z.number().int().nonnegative().nullable(),
  quote: z.string().max(2000).nullable(),
});
export type CommentAnchor = z.infer<typeof CommentAnchor>;

/**
 * A model proposal against an existing block, shown until the teacher accepts or
 * rejects it. Proposed inserts are blocks with status `proposed` instead.
 */
export const PendingOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replace"), turn_id: z.string(), content: z.string() }),
  z.object({ op: z.literal("delete"), turn_id: z.string() }),
  z.object({ op: z.literal("move"), turn_id: z.string(), after: z.string() }),
]);
export type PendingOp = z.infer<typeof PendingOp>;

/** One block of a doc. */
export const Block = z.object({
  id: Ulid,
  session_id: z.string(),
  doc_id: Ulid,
  type: BlockType,
  /** Markdown text (see the client's markdown.ts for each type's shape). */
  content: z.string(),
  origin: Origin,
  origin_turn: z.string().nullable(),
  status: BlockStatus,
  /** Incremented on every content change; server-assigned. */
  version: z.number().int().nonnegative(),
  /** Parent block id on split or merge. */
  derived_from: Ulid.nullable(),
  /** Position within its doc; server-maintained. */
  order: z.number().int().nonnegative(),
  /** A proposal against this block awaiting accept or reject; null otherwise. */
  pending: PendingOp.nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Block = z.infer<typeof Block>;

/** Content snapshot carried by a revision. An object so it can grow fields again. */
export const BlockContent = z.object({
  content: z.string(),
});
export type BlockContent = z.infer<typeof BlockContent>;

/** One row per content change. */
export const BlockRevision = z.object({
  block_id: Ulid,
  version: z.number().int().nonnegative(),
  actor: Actor,
  before: BlockContent.nullable(),
  after: BlockContent,
  /** The event that caused this change: keystroke batch, accept, model op, structure. */
  cause_event_id: Ulid,
  at: Timestamp,
});
export type BlockRevision = z.infer<typeof BlockRevision>;

/**
 * A suggestion waits on this block for the teacher's decision: a block the assistant proposed,
 * or a proposed change (replace, delete, move) to a live one.
 */
export function hasWaitingSuggestion(b: Pick<Block, "status" | "pending">): boolean {
  return b.status === "proposed" || (b.status === "live" && b.pending !== null);
}

export function blockContentOf(b: Pick<Block, "content">): BlockContent {
  return { content: b.content };
}
