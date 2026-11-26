/**
 * The pupil's reader (#213, plan C item R1): the readings a pupil may open, a reading as the pupil
 * sees it (never a prompt's hidden instruction), and the pupil's own highlights on it.
 *
 * A highlight names a block of the reading's frozen copy and a range in that block's text as the
 * reader shows it (`readerBlock` in readerText.ts: markup taken off), so the server can check it
 * against the copy and the page can draw it again after a reload.
 */
import { z } from "zod";
import { ReadingBlock } from "./readings.js";

/** The labels a pupil can give a highlight, in the order the page offers them. Null is unlabelled. */
export const HIGHLIGHT_CATEGORIES = [
  { id: "dont_understand", label: "Don't understand" },
  { id: "may_be_inaccurate", label: "May be inaccurate" },
  { id: "possibly_biased", label: "Possibly biased" },
  { id: "missing_sources", label: "Missing sources" },
  { id: "poor_quality", label: "Poor quality" },
] as const;

type CategoryId = (typeof HIGHLIGHT_CATEGORIES)[number]["id"];
export const HighlightCategory = z.enum(HIGHLIGHT_CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]]);
export type HighlightCategory = z.infer<typeof HighlightCategory>;

/** At most this many highlights per pupil per reading. */
export const READER_HIGHLIGHTS_MAX = 200;

/** What the page sends to save a highlight: a block of the copy and a range in its reader text. */
export const HighlightFields = z
  .object({
    block_id: z.string().min(1).max(64),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    category: HighlightCategory.nullable(),
  })
  .refine((h) => h.end > h.start, "end must be after start");
export type HighlightFields = z.infer<typeof HighlightFields>;

export const Highlight = z.object({
  id: z.string(),
  block_id: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  category: HighlightCategory.nullable(),
  created_at: z.string(),
});
export type Highlight = z.infer<typeof Highlight>;

/** A reading in the pupil's list: newest first. `set_on` is the day it was set (YYYY-MM-DD). */
export const PupilReadingItem = z.object({
  id: z.string(),
  name: z.string(),
  class_id: z.string(),
  class_name: z.string(),
  set_on: z.string(),
});
export type PupilReadingItem = z.infer<typeof PupilReadingItem>;

/** A prompt as a pupil may see it: the button and where it shows. Never its instruction. */
export const PupilPrompt = z.object({
  id: z.string(),
  label: z.string(),
  after_highlight: z.boolean(),
  follow_up: z.boolean(),
});
export type PupilPrompt = z.infer<typeof PupilPrompt>;

/** A reading as the pupil opens it. */
export const PupilReading = z.object({
  id: z.string(),
  name: z.string(),
  class_name: z.string(),
  blocks: z.array(ReadingBlock),
  prompts: z.array(PupilPrompt),
  /** The follow-up limit in force: the reading's own, else the class's, else config's. */
  follow_ups_max: z.number().int().nonnegative(),
});
export type PupilReading = z.infer<typeof PupilReading>;
