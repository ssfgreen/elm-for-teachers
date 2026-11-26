/** Event payloads for projects and reference files. */
import { z } from "zod";
import { Timestamp, Ulid } from "../blocks.js";

/** The teacher opened a reference file's preview (its text, as the model reads it). */
export const ReferenceOpenPayload = z.object({
  reference_id: Ulid,
});

/** The teacher opened a project's page (or the New project form, with no id). */
export const ProjectOpenPayload = z.object({
  project_id: Ulid.nullable(),
});

export const ProjectCreatePayload = z.object({
  project_id: Ulid,
  name: z.string(),
  description: z.string().nullable().optional(),
});

/** The teacher changed a project's description or instructions (the full new text; null clears it). */
export const ProjectUpdatePayload = z.object({
  project_id: Ulid,
  description: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
});

export const ProjectRenamePayload = z.object({
  project_id: Ulid,
  name: z.string(),
});

/** The teacher archived a project: hidden, its chats kept. */
export const ProjectArchivePayload = z.object({
  project_id: Ulid,
});

/** The teacher typed DELETE: the project and its chats (`thread_ids`) are hidden from them. */
export const ProjectDeletePayload = z.object({
  project_id: Ulid,
  thread_ids: z.array(Ulid),
});

/** A reference file added to a project or a chat (logged once it is ready for the model). */
export const ReferenceUploadPayload = z.object({
  reference_id: Ulid,
  project_id: Ulid.nullable(),
  thread_id: Ulid.nullable().optional(),
  name: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
  est_tokens: z.number().int().nonnegative(),
});

/** The model call that wrote a reference file's one-line summary (its own record: it belongs to no thread). */
export const ReferenceSummaryPayload = z.object({
  reference_id: Ulid,
  summary: z.string().nullable(),
  model: z.string(),
  system_prompt_hash: z.string(),
  latency_ms: z.number().int().nonnegative(),
  at: Timestamp,
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  provider_request_id: z.string().nullable(),
  /** The request body as sent (no credentials). */
  request: z.unknown().optional(),
  error: z.string().nullable(),
});

export const ReferenceDeletePayload = z.object({
  reference_id: Ulid,
  project_id: Ulid.nullable(),
  thread_id: Ulid.nullable().optional(),
});
