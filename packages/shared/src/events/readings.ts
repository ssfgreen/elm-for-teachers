/**
 * Event payloads for a class's readings (#187; server only). As for the prompt library (question
 * 43), never the doc's name or the copy's text, which stay in `readings`. Since #195 (question 81,
 * Sam 23 Nov 2026) a set or an update also carries the reading's follow-up limit and the frozen
 * copy's hash; both are absent from earlier events.
 */
import { z } from "zod";

const ids = {
  reading_id: z.string().min(1),
  class_id: z.string().min(1),
  doc_id: z.string().min(1),
};

/**
 * After the set or update: `follow_ups_max` is the reading's own limit (null: it follows the
 * class's), `content_hash` the frozen copy's (`sha256:...`, as in `readings.content_hash`).
 */
const figures = {
  follow_ups_max: z.number().int().nonnegative().nullable().optional(),
  content_hash: z.string().min(1).optional(),
};

/** The teacher set a reading for a class: a frozen copy of the doc, with the prompts it allows. */
export const ReadingSetPayload = z.object({ ...ids, prompt_ids: z.array(z.string().min(1)), ...figures });

/** The teacher changed a reading's prompts or follow-up limit (not logged when nothing changed). */
export const ReadingUpdatePayload = z.object({ ...ids, prompt_ids: z.array(z.string().min(1)), ...figures });

/** The teacher removed a reading (its row stays, with `removed_at`). */
export const ReadingRemovePayload = z.object(ids);
