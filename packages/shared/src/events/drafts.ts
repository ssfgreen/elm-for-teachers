/**
 * Event payloads for a workspace's plugin drafts from the plugin studio (server only). A draft's
 * address holds its secret code, so neither the address nor the code is ever in an event: only
 * the draft's id here, its name, and a hash of its content when the studio could be read.
 */
import { z } from "zod";

/** The teacher added a studio draft to the workspace. */
export const PluginDraftAddPayload = z.object({
  /** Elm's own short id for the draft, never part of its address. */
  draft_id: z.string().min(1),
  name: z.string(),
  /** A sha256 of what the studio served when the draft was added; null when it could not be read. */
  content_hash: z.string().nullable(),
});

/** The teacher removed a studio draft from the workspace. */
export const PluginDraftRemovePayload = z.object({
  draft_id: z.string().min(1),
  name: z.string(),
});
