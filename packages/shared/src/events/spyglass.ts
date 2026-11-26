/**
 * Event payloads for Spyglass (docs/spyglass.md, Part 6): the copy choice, the flags a turn got,
 * the teacher's toggle and what they did with a flag.
 */
import { z } from "zod";
import { Ulid } from "../blocks.js";
import { CopyChoice } from "../canvas/copies.js";
import { SpyglassCheck, SpyglassHidden, SpyglassLabel } from "../spyglass.js";

/**
 * The teacher chose what a copy of a doc with suggestions waiting is built from, on the card under
 * the reply (the envelope's thread). `turn_id`: the turn whose copy waited on the choice.
 */
export const CopyChoicePayload = z.object({
  doc_id: Ulid,
  choice: CopyChoice,
  /** How many suggestions were waiting in the doc when the assistant was asked to copy it. */
  waiting: z.number().int().nonnegative(),
  turn_id: z.string(),
});

/**
 * The flags a turn got, logged whether or not the teacher saw them (`hidden` says why not), so
 * turns with Spyglass on and off can be compared. Only for turns that changed content.
 */
export const SpyglassShownPayload = z.object({
  turn_id: z.string(),
  flags: z.array(z.object({ check: SpyglassCheck, label: SpyglassLabel, block_ids: z.array(z.string()) })),
  others: z.number().int().nonnegative(),
  by: z.enum(["judge", "fallback"]),
  /** The judge's last gateway call; absent when it was not called (skipped for time). */
  gateway_call_id: z.string().optional(),
  hidden: SpyglassHidden.optional(),
});

/** The teacher switched Spyglass on or off under the chat box. */
export const SpyglassTogglePayload = z.object({ on: z.boolean() });

/** What the teacher can do with a flag in the callout (Part 5). */
export const SpyglassAction = z.enum(["restore", "undo", "keep", "apply_to_copies", "remove_one", "show", "dismiss"]);
export type SpyglassAction = z.infer<typeof SpyglassAction>;

/**
 * The teacher acted on one of a turn's flags: `flag` is its place in the callout (0 first), with
 * its label and blocks so the line reads alone. `wrote`: blocks the action changed (none for show
 * and dismiss).
 */
export const SpyglassActionPayload = z.object({
  turn_id: z.string(),
  flag: z.number().int().nonnegative(),
  label: SpyglassLabel,
  block_ids: z.array(z.string()),
  action: SpyglassAction,
  wrote: z.array(z.string()).optional(),
});
