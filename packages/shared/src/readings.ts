/**
 * Readings (#187, plan C item R0): an article the teacher sets for a whole class. The server keeps
 * a frozen copy of one of the workspace's docs as it was when set (live blocks only), with the
 * library prompts it allows and, optionally, its own follow-up limit. Nothing reaches pupils or
 * the model yet: pupils see readings in R1, and R2 sends the copy to the model.
 */
import { z } from "zod";
import { FOLLOW_UPS_MAX_LIMIT, FollowUpsMax } from "./classReader.js";
import { READER_PROMPTS_MAX } from "./readerPrompts.js";

/** The fewest and most follow-ups a reading may allow: a class's own range (`FollowUpsMax`, #186). */
export const READING_FOLLOW_UPS_MIN = 0;
export const READING_FOLLOW_UPS_MAX = FOLLOW_UPS_MAX_LIMIT;

/** The library prompts a reading allows: at least one, each once. The server keeps them in the library's order. */
export const ReadingPromptIds = z
  .array(z.string().min(1))
  .min(1)
  .max(READER_PROMPTS_MAX)
  .refine((ids) => new Set(ids).size === ids.length, "each prompt once");

/** What the teacher sends to set a reading. */
export const ReadingFields = z.object({
  /** The doc the copy is taken from (one of the workspace's, not deleted). */
  doc_id: z.string().min(1),
  prompt_ids: ReadingPromptIds,
  /** Its own follow-up limit (`FollowUpsMax`, 0 to 10); null means "the same as the class". */
  follow_ups_max: FollowUpsMax.nullable(),
});
export type ReadingFields = z.infer<typeof ReadingFields>;

/** What an edit may change; the copy itself changes only by setting the doc again. */
export const ReadingPatch = ReadingFields.omit({ doc_id: true }).partial();
export type ReadingPatch = z.infer<typeof ReadingPatch>;

/** One block of the frozen copy: as it was in the doc, a picture kept as its `asset:<id>` source. */
export const ReadingBlock = z.object({ id: z.string(), type: z.string(), content: z.string() });
export type ReadingBlock = z.infer<typeof ReadingBlock>;

/** A reading as the teacher's class page lists it (never the copy's blocks). */
export const Reading = z.object({
  id: z.string(),
  class_id: z.string(),
  /** The doc the copy was taken from; it may have changed or been deleted since. */
  doc_id: z.string(),
  /** The doc's name when the reading was set. */
  name: z.string(),
  prompt_ids: z.array(z.string()),
  /** Its own follow-up limit (`FollowUpsMax`, 0 to 10); null means "the same as the class". */
  follow_ups_max: FollowUpsMax.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Reading = z.infer<typeof Reading>;

/** A doc the teacher can set as a reading: its name and its chat's title, newest first. */
export const ReadingSource = z.object({
  doc_id: z.string(),
  name: z.string(),
  thread_title: z.string(),
  created_at: z.string(),
});
export type ReadingSource = z.infer<typeof ReadingSource>;
