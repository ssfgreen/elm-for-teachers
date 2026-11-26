/**
 * Event payloads for the teacher's prompt library for the pupil reader (#177; server only). As
 * for the teacher's other set-up actions (question 43), ids and kinds only: never a prompt's
 * label, instruction or ticks, which stay in `reader_prompts`.
 */
import { z } from "zod";

/** A prompt went into the library: one of config's defaults when the library was first used, or the teacher's own. */
export const ReaderPromptAddPayload = z.object({
  prompt_id: z.string().min(1),
});

/** The teacher changed a prompt (not logged when nothing changed). */
export const ReaderPromptEditPayload = z.object({
  prompt_id: z.string().min(1),
});

/** The teacher removed a prompt. */
export const ReaderPromptRemovePayload = z.object({
  prompt_id: z.string().min(1),
});

/** The teacher moved prompts: every prompt's id, in the new order (not logged when nothing moved). */
export const ReaderPromptReorderPayload = z.object({
  prompt_ids: z.array(z.string().min(1)),
});
