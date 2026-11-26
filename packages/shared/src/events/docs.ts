/** Event payloads for docs: created, renamed, styled, deleted, opened, downloaded, previewed. */
import { z } from "zod";
import { DocStyle } from "../enums.js";
import { Ulid } from "../blocks.js";

export const DocCreatePayload = z.object({
  doc_id: Ulid,
  thread_id: Ulid,
  name: z.string(),
  created_by: z.enum(["teacher", "model"]),
  /** Set when the doc is a duplicate of another. */
  copied_from: Ulid.nullable().optional(),
  /** Set when the doc was made from an uploaded file. */
  imported_from: z
    .union([
      z.object({ kind: z.literal("docx"), filename: z.string(), bytes: z.number().int().nonnegative() }),
      /** The model opened a reference file as a doc (open_reference_as_doc). */
      z.object({ kind: z.literal("reference"), reference_id: Ulid, filename: z.string() }),
    ])
    .optional(),
  /**
   * The look it started with, when it had one: the teacher's default font (Preferences), or for
   * the model's copy of a doc, that doc's look. Not set on a teacher's duplicate (see copied_from).
   */
  style: DocStyle.optional(),
});

export const DocRenamePayload = z.object({
  doc_id: Ulid,
  name: z.string(),
  /** Named from its first heading (an "Untitled" doc), not typed by the teacher. */
  auto: z.boolean().optional(),
});

/** The teacher set the doc's font or page colour; `style` is the whole look after the change. */
export const DocStylePayload = z.object({ doc_id: Ulid, style: DocStyle });

/**
 * The teacher accepted or rejected the model's suggested font or page colour. `style` is what
 * was suggested (only the parts it would change); an accept is followed by `doc_style`.
 */
export const StyleDecisionPayload = z.object({ doc_id: Ulid, turn_id: z.string(), style: DocStyle });

/** The teacher deleted a doc; it is kept, marked, for the export. */
export const DocDeletePayload = z.object({ doc_id: Ulid, thread_id: Ulid, name: z.string() });

/** The teacher switched to a doc (client-side). */
export const DocOpenPayload = z.object({
  doc_id: Ulid,
});

/** The teacher downloaded a doc. */
export const DocExportPayload = z.object({
  doc_id: Ulid,
  format: z.enum(["docx", "markdown", "json"]),
});

/** The teacher opened the Word preview of a doc; `pages` is how many it came to. */
export const DocPreviewPayload = z.object({
  doc_id: Ulid,
  pages: z.number().int().min(0).max(10_000),
});

/**
 * The teacher scrolled the Word preview, throttled like `scroll`. `position` is how far down the
 * pages are scrolled and `max` how far they can go, both in pixels, so position / max is how far
 * through the pages the teacher got (`max` is 0 when the pages fit without scrolling).
 */
export const PreviewScrollPayload = z.object({
  doc_id: Ulid,
  position: z.number().nonnegative(),
  max: z.number().nonnegative(),
});
