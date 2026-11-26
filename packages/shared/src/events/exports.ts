import { z } from "zod";

/**
 * A researcher downloaded the workspace's full bundle (admin export, server only). `format`:
 * the zip or the JSON of its files; `via`: signed in as an admin account or by the admin
 * password; `files`: how many files the bundle held; `account_id`: the admin's account, when
 * signed in (from 14 Nov 2026; a password export, and earlier events, have none). The event is
 * written after the bundle is built, so that bundle does not hold it; the next one does.
 */
export const WorkspaceExportPayload = z.object({
  format: z.enum(["zip", "json"]),
  via: z.enum(["account", "password"]),
  files: z.number().int().nonnegative(),
  account_id: z.string().min(1).optional(),
});
