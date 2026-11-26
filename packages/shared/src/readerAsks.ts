/**
 * A pupil's ask in the reader (#214, plan C item R2): the pupil highlights a passage of a reading
 * and presses one of its prompt buttons, or a follow-up button under an answer. There is no free
 * text: the request names a prompt and carries the highlighted passage, which the server finds in
 * the reading's frozen copy. The answer comes back whole (no streaming); R3 adds the screen.
 */
import { z } from "zod";

/** The longest passage a pupil may highlight, in characters. */
export const READER_HIGHLIGHT_MAX = 1000;

/**
 * What the pupil sends. Unknown keys are refused, so a question typed by the pupil cannot ride
 * along. The passage is checked by the server (422 when too long or not in the reading).
 */
export const ReaderAskBody = z
  .object({
    prompt_id: z.string().min(1),
    highlighted_text: z.string(),
    /** The ask this one follows up; left out (or null) for a first ask. */
    parent_ask_id: z.string().min(1).nullish(),
  })
  .strict();
export type ReaderAskBody = z.infer<typeof ReaderAskBody>;

/** The answer: the ask's id (a later follow-up's parent), the reply and how many follow-ups are left in this chain. */
export const ReaderAskResult = z.object({
  ask: z.object({ id: z.string(), reply: z.string(), follow_ups_left: z.number().int().nonnegative() }),
});
export type ReaderAskResult = z.infer<typeof ReaderAskResult>;

/** Why an ask was refused: the `code` of the refusal. */
export const READER_ASK_REFUSALS = [
  /** 422: the passage is empty, too long or not in the reading. */
  "highlight_too_long",
  "highlight_not_in_reading",
  /** 409: the prompt is not allowed on the reading or no longer in the library. */
  "prompt_unavailable",
  /** 409: the prompt is not ticked for this place (after a highlight, or as a follow-up). */
  "prompt_not_offered",
  /** 409: the chain already has as many follow-ups as allowed. */
  "follow_ups_used",
  /** 429: the pupil's own budget in the class, or the workspace's. */
  "pupil_budget_spent",
  "budget_spent",
  /** 503: no provider that keeps nothing (zero retention) is configured. */
  "no_zero_retention",
  /** 502: the model call failed; nothing was stored or charged. */
  "provider_error",
] as const;
export type ReaderAskRefusal = (typeof READER_ASK_REFUSALS)[number];
