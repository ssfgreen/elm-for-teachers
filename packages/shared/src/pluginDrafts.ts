/**
 * A plugin draft from the studio, as the server shows it to the workspace (#158): never its
 * address, which holds the draft's secret code.
 */
import { z } from "zod";

export const PluginDraft = z.object({
  /** Elm's own id for the draft (`d-` and 8 characters), not the studio's code. */
  id: z.string(),
  /** Read from the studio when it was added; "Studio draft" when it gave none. */
  name: z.string(),
  added_at: z.string(),
});
export type PluginDraft = z.infer<typeof PluginDraft>;
