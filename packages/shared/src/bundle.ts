import { z } from "zod";
import { Timestamp } from "./blocks.js";
import { DEFAULT_FEATURES, Features } from "./features.js";

/**
 * Session bundle file contents. Events, threads, docs, blocks, revisions, chat turns
 * and gateway calls reuse their own schemas; only session.json is defined here.
 */
export const SessionJson = z.object({
  session_id: z.string(),
  label: z.string(),
  tool_version: z.string(),
  config_hash: z.string(),
  system_prompt_hash: z.string(),
  created_at: Timestamp,
  /** When the participant link was first opened; null if never. */
  first_opened_at: Timestamp.nullable(),
  /**
   * How the workspace is reached: "link" by its participant link (or access code), "account"
   * by one signed-in teacher account. Bundles from before 13 Nov 2026 lack it: read them as "link",
   * the only kind there was.
   */
  access: z.enum(["link", "account"]),
  /**
   * The feature switches in force when it was exported (features.ts), all of them. Bundles from before
   * 15 Nov 2026 lack it: read them as the defaults, as every workspace had (and `pupils` off).
   */
  features: Features.default({ ...DEFAULT_FEATURES }),
});
export type SessionJson = z.infer<typeof SessionJson>;

/**
 * Every file a bundle contains, besides one markdown file per doc under `docs/` and the config
 * texts under `config/`. This is the research data format: the export builds exactly these
 * (the compiler checks it) and the export test checks against this list.
 */
export const BUNDLE_FILES = [
  "session.json",
  "projects.json",
  "classes.json",
  "threads.json",
  "docs.json",
  "blocks.json",
  "revisions.jsonl",
  "events.jsonl",
  "chat_turns.jsonl",
  "gateway_calls.jsonl",
  "text_events.jsonl",
  "comments.jsonl",
  "references.jsonl",
  "make_board.json",
  "MANIFEST.json",
] as const;
export type BundleFile = (typeof BUNDLE_FILES)[number];
