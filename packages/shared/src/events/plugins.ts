/** Event payloads for plugins (docs/plugins.md): trust levels, and Ask first in a chat. */
import { z } from "zod";
import { PluginTrust } from "../plugins.js";

/** The teacher set a plugin's trust level for the workspace on the Plugins screen. */
export const PluginTrustSetPayload = z.object({
  plugin_id: z.string(),
  trust: PluginTrust,
  /** The level before (the catalogue's default when the teacher had never set it). */
  before: PluginTrust,
});

/** The assistant wanted an Ask first plugin in this chat (the envelope's thread) and was told to ask. */
export const PluginRequestPayload = z.object({
  plugin_id: z.string(),
  turn_id: z.string(),
});

/** The teacher allowed an Ask first plugin in this chat (the envelope's thread). */
export const PluginGrantPayload = z.object({
  plugin_id: z.string(),
});

/**
 * A plugin on offer to a turn, as `chat_prompt` records it. Added 22 Nov 2026 (#159): `draft` and
 * `content_hash` for a studio draft (its id is the draft's, `d-…`); `content_hash` is null when
 * the studio could not be read for the turn, so the draft was shown as unavailable. Absent: a
 * catalogue plugin, or earlier data.
 */
export const PluginOnOffer = z.object({ id: z.string(), trust: PluginTrust, draft: z.literal(true).optional(), content_hash: z.string().nullable().optional() });
export type PluginOnOffer = z.infer<typeof PluginOnOffer>;
