/** Event payloads for the assistant's turns, the teacher's decisions on its suggestions, and threads (chats). */
import { z } from "zod";
import { ProposalMode } from "../enums.js";
import { BlockContent, CommentAnchor, Timestamp, Ulid } from "../blocks.js";
import { OperationList } from "../operations.js";
import { PluginOnOffer } from "./plugins.js";

/** The teacher pressed Stop while the assistant was answering: nothing of the turn is applied. */
export const ChatStopPayload = z.object({
  turn_id: z.string(),
  /** The reply as far as the teacher had seen it. */
  shown_text: z.string(),
});

/** How the assistant's changes reach the doc: as suggestions, or straight in. */
export const EditMode = z.enum(["suggest", "edit"]);
export type EditMode = z.infer<typeof EditMode>;

/**
 * How suggestions look in the document (12 Nov 2026). "inline" (Suggesting): only the words
 * added, in green; what is taken out is on the suggestion's card. "track" (Track changes): words
 * added and taken out, both in red.
 */
export const SuggestView = z.enum(["inline", "track"]);
export type SuggestView = z.infer<typeof SuggestView>;

/** One change inside a block's suggested change, decided on its own. */
export const DecisionPart = z.object({
  /** Its place among the block's changes, in reading order, from 0. */
  index: z.number().int().nonnegative(),
  /** The text it adds and takes out, as the card showed them. */
  ins: z.string(),
  del: z.string(),
  /** The block's live content and its suggested content after the decision. */
  live_after: BlockContent,
  suggested_after: BlockContent,
});
export type DecisionPart = z.infer<typeof DecisionPart>;

export const ChatPromptPayload = z.object({
  turn_id: z.string(),
  text: z.string(),
  /** Present when the teacher commented on a passage with @model. */
  anchor: CommentAnchor.nullable().optional(),
  /** Present when the prompt is an @model comment in a doc's comment thread. */
  comment_id: Ulid.nullable().optional(),
  /** The chat's files attached to this message with "+". */
  attachments: z.array(Ulid).optional(),
  /** The model the turn ran on, and its reasoning effort ("none" for a model without). */
  model: z.string().optional(),
  effort: z.string().optional(),
  /**
   * Added 7 Nov 2026: what the teacher set under the chat box. "suggest": the assistant's changes
   * are suggestions to accept or reject; "edit": they go straight into the doc. Absent (all
   * earlier data) means "suggest".
   */
  edit_mode: EditMode.optional(),
  /**
   * Added 8 Nov 2026: the plugins on offer to the turn (not Off) and their trust levels. Absent
   * (all earlier data): the picture library only, if config agent.tools named search_pictures.
   */
  plugins: z.array(PluginOnOffer).optional(),
  /** Added 11 Nov 2026: whether the teacher had Spyglass on under the chat box. Absent: earlier data, or a client that does not send it. */
  spyglass: z.boolean().optional(),
  /**
   * Added 12 Nov 2026, Suggesting turns only: how suggestions looked to the teacher, Suggesting
   * ("inline") or Track changes ("track"). Absent: Editing mode, or earlier data, when every
   * suggestion showed as tracked changes (words added in green, taken out in orange).
   */
  suggest_view: SuggestView.optional(),
});

export const ChatResponsePayload = z.object({
  turn_id: z.string(),
  text: z.string(),
  /** Operations as presented. */
  operations: OperationList,
  gateway_call_id: z.string(),
});

export const ProposalShownPayload = z.object({
  turn_id: z.string(),
  block_ids: z.array(Ulid),
  /**
   * Docs the turn created. From 12 Nov 2026 in Suggesting mode their content goes straight in, so
   * their blocks (and a style suggested for them) are not in `block_ids` or `style_doc_ids`;
   * before then they were suggestions like any others.
   */
  doc_ids: z.array(Ulid),
  /** Docs the turn suggested a font or page colour for; left out when none. */
  style_doc_ids: z.array(Ulid).optional(),
  /**
   * Added 13 Nov 2026. Existing docs that were blank when the turn was committed, so the turn's
   * changes to them went straight in rather than as suggestions; their blocks are not in
   * `block_ids`. Left out when none; older events lack it.
   */
  blank_doc_ids: z.array(Ulid).optional(),
});

export const ProposalDecisionPayload = z.object({
  /** The block decided on, or null for accept all / reject all. */
  block_id: Ulid.nullable(),
  /** For accept all / reject all: the doc they apply to. */
  doc_id: Ulid.nullable(),
  mode: ProposalMode,
  /**
   * Added 7 Nov 2026. Present when the teacher decided one change inside a suggested change to a
   * block (one card in the comments column), not the whole block. The rest of the suggestion stays.
   */
  part: DecisionPart.optional(),
});

/**
 * The teacher picked one of the pictures offered for an image block (the others ARASAAC found for
 * the assistant's search). It is copied in as `asset_id` and put in the block, which accepts it.
 */
export const PictureChoosePayload = z.object({
  turn_id: z.string(),
  block_id: Ulid,
  /** The ARASAAC picture picked, and its place in the row offered (0 is the first). */
  picture: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  /** The one the assistant had put in. */
  replaced: z.number().int().positive(),
  asset_id: z.string(),
});

export const ThreadCreatePayload = z.object({
  thread_id: Ulid,
  /** The blank doc the thread starts with. */
  doc_id: Ulid,
  /** The project the chat was started in (absent on events from before projects). */
  project_id: Ulid.nullable().optional(),
  /** The class or year group the chat was started for (absent before classes). */
  class_id: Ulid.nullable().optional(),
  year_group_id: Ulid.nullable().optional(),
});

/** The teacher named a thread (it is "Untitled" until then). */
export const ThreadRenamePayload = z.object({
  thread_id: Ulid,
  title: z.string(),
  /** Named by the model, from the wand or on its own after the first prompts (see chat_title). */
  auto: z.boolean().optional(),
});

/** The teacher switched to a thread (client-side). */
export const ThreadOpenPayload = z.object({
  thread_id: Ulid,
});

/** A call to the model for a chat's name (not a gateway call: it is no chat turn), logged whether or not it worked. */
export const ChatTitlePayload = z.object({
  thread_id: Ulid,
  title: z.string().nullable(),
  /** The wand, or 'auto': an Untitled chat named on its own after its first prompts. Absent before 12 Nov 2026: the wand. */
  trigger: z.enum(['wand', 'auto']).optional(),
  model: z.string(),
  system_prompt_hash: z.string(),
  latency_ms: z.number().int().nonnegative(),
  at: Timestamp,
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  provider_request_id: z.string().nullable(),
  request: z.unknown().optional(),
  error: z.string().nullable(),
});
